import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createServer as createViteServer, type ViteDevServer } from "vite";
import { WebSocket } from "ws";

import { startHttpServer } from "../../server/src/http-server.ts";
import { createWebViteConfig } from "../config.ts";

interface RemoteTarget {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly url: string;
  readonly webSocketDebuggerUrl?: string;
}

interface ChromeHandle {
  readonly process: ChildProcess;
  readonly debugPort: number;
  readonly userDataDir: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isListenPermissionError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EPERM";
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createNetServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve free port."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function findPlaywrightChromiumExecutable(): string | null {
  const cacheRoot = join(homedir(), "Library", "Caches", "ms-playwright");

  if (!existsSync(cacheRoot)) {
    return null;
  }

  const chromiumDirectories = readdirSync(cacheRoot)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .reverse();

  for (const directory of chromiumDirectories) {
    const candidates = [
      join(
        cacheRoot,
        directory,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      ),
      join(
        cacheRoot,
        directory,
        "chrome-mac",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      )
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function findChromeExecutable(): string | null {
  const candidates = [
    process.env.CHROME_BIN,
    findPlaywrightChromiumExecutable(),
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim() && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function readJson<TValue>(url: string): Promise<TValue> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }

  return (await response.json()) as TValue;
}

async function waitFor<TValue>(
  run: () => Promise<TValue>,
  options: {
    readonly timeoutMs?: number;
    readonly intervalMs?: number;
    readonly label: string;
  }
): Promise<TValue> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 100;
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw new Error(
    `Timed out while waiting for ${options.label}.${lastError instanceof Error ? ` Last error: ${lastError.message}` : ""}`
  );
}

async function launchChrome(url: string): Promise<ChromeHandle> {
  const executable = findChromeExecutable();

  if (!executable) {
    throw new Error("Chrome executable is not available.");
  }

  const debugPort = await getFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "project-bh-chrome-"));
  const process = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-extensions",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      url
    ],
    {
      stdio: "ignore"
    }
  );

  process.once("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      // Let the polling below surface the failure through the missing debugger endpoint.
    }
  });

  await waitFor(
    async () => {
      const version = await readJson<{ readonly webSocketDebuggerUrl?: string }>(
        `http://127.0.0.1:${debugPort}/json/version`
      );

      if (!version.webSocketDebuggerUrl) {
        throw new Error("Debugger endpoint is missing.");
      }

      return version;
    },
    { label: "Chrome debugger endpoint", timeoutMs: 20_000 }
  );

  return {
    process,
    debugPort,
    userDataDir
  };
}

async function closeChrome(handle: ChromeHandle | null): Promise<void> {
  if (!handle) {
    return;
  }

  if (!handle.process.killed) {
    handle.process.kill("SIGTERM");
  }

  await Promise.race([
    new Promise<void>((resolve) => {
      handle.process.once("exit", () => resolve());
    }),
    delay(2_000)
  ]);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(handle.userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }

      await delay(200);
    }
  }
}

class CdpPage {
  private sequence = 0;
  private readonly pending = new Map<number, (message: Record<string, unknown>) => void>();
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;

      if (typeof message.id !== "number") {
        return;
      }

      const callback = this.pending.get(message.id);

      if (!callback) {
        return;
      }

      this.pending.delete(message.id);
      callback(message);
    });
  }

  static async connect(debugPort: number, expectedUrlPrefix: string): Promise<CdpPage> {
    const target = await waitFor(
      async () => {
        const targets = await readJson<readonly RemoteTarget[]>(
          `http://127.0.0.1:${debugPort}/json/list`
        );
        const target = targets.find((candidate) => {
          return (
            candidate.type === "page" &&
            candidate.url.startsWith(expectedUrlPrefix) &&
            typeof candidate.webSocketDebuggerUrl === "string"
          );
        });

        if (!target?.webSocketDebuggerUrl) {
          throw new Error(`Page target for ${expectedUrlPrefix} is not ready.`);
        }

        return target;
      },
      { label: `page target ${expectedUrlPrefix}`, timeoutMs: 20_000 }
    );

    const webSocketDebuggerUrl = target.webSocketDebuggerUrl;

    assert.ok(webSocketDebuggerUrl, `Missing debugger URL for ${expectedUrlPrefix}.`);

    const socket = new WebSocket(webSocketDebuggerUrl);

    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    const page = new CdpPage(socket);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.waitForExpression("document.readyState === 'complete'", "document ready");
    return page;
  }

  async close(): Promise<void> {
    this.socket.close();
  }

  async send<TResult = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<TResult> {
    return await new Promise<TResult>((resolve, reject) => {
      const id = ++this.sequence;

      this.pending.set(id, (message) => {
        if (message.error && typeof message.error === "object" && message.error !== null && "message" in message.error) {
          reject(new Error(String(message.error.message)));
          return;
        }

        resolve((message.result ?? {}) as TResult);
      });

      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<TValue>(expression: string): Promise<TValue> {
    const result = await this.send<{
      readonly result?: {
        readonly value?: TValue;
      };
    }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    return result.result?.value as TValue;
  }

  async waitForExpression(expression: string, label: string, timeoutMs = 15_000): Promise<void> {
    await waitFor(
      async () => {
        const result = await this.evaluate<boolean>(expression);

        if (!result) {
          throw new Error(`Expression for ${label} is still falsy.`);
        }

        return result;
      },
      { label, timeoutMs }
    );
  }

  async clickSelector(selector: string): Promise<void> {
    const clicked = await this.evaluate<boolean>(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement) || element.hasAttribute("disabled")) {
          return false;
        }

        element.click();
        return true;
      })()
    `);

    assert.equal(clicked, true, `Expected ${selector} to be clickable.`);
  }

  async fillInput(selector: string, value: string): Promise<void> {
    const updated = await this.evaluate<boolean>(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLInputElement)) {
          return false;
        }

        element.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(element, ${JSON.stringify(value)});
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()
    `);

    assert.equal(updated, true, `Expected ${selector} to be an input.`);
  }

  async rightClickSelector(selector: string): Promise<void> {
    const dispatched = await this.evaluate<boolean>(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          buttons: 2,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        }));
        return true;
      })()
    `);

    assert.equal(dispatched, true, `Expected ${selector} to exist for right click.`);
  }

  async textContent(selector: string): Promise<string> {
    const text = await this.evaluate<string | null>(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        return element?.textContent?.trim() ?? null;
      })()
    `);

    if (text === null) {
      throw new Error(`Expected ${selector} to have text content.`);
    }

    return text;
  }

  async setViewport(width: number, height: number, mobile = false): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile
    });
  }
}

interface MatchLayoutMetrics {
  readonly viewportArea: number;
  readonly boardArea: number;
  readonly boardRatio: number;
  readonly boardStageRatio: number;
  readonly boardTop: number;
  readonly topHudHeight: number;
  readonly topChromeHeight: number;
  readonly bottomSheetHeight: number;
  readonly hasMobileResourceTabs: boolean;
  readonly hasHorizontalOverflow: boolean;
  readonly boardIntersectsCallout: boolean;
  readonly minimumPlayerTextSize: number;
  readonly topStatusText: string;
}

async function readMatchLayoutMetrics(page: CdpPage): Promise<MatchLayoutMetrics> {
  return await page.evaluate<MatchLayoutMetrics>(`
    (() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);

        if (!element) {
          return null;
        }

        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height
        };
      };
      const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      const fontSize = (selector) => {
        const element = document.querySelector(selector);
        return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 999;
      };
      const board = rect('.board');
      const stage = rect('.board-canvas');
      const callout = rect('.phase-callout');
      const topStrip = rect('.top-strip');
      const score = rect('.scoreboard-strip');
      const treasure = rect('.treasure-slot-strip');
      const bottomSheet = rect('.match-footer');
      const topHudHeight = [topStrip, score].reduce((total, item) => total + (item?.height ?? 0), 0);
      const topChromeHeight = [topStrip, score, treasure].reduce((total, item) => total + (item?.height ?? 0), 0);
      const viewportArea = window.innerWidth * window.innerHeight;
      const boardArea = (board?.width ?? 0) * (board?.height ?? 0);
      const stageArea = (stage?.width ?? 0) * (stage?.height ?? 0);

      return {
        viewportArea,
        boardArea,
        boardRatio: boardArea / viewportArea,
        boardStageRatio: stageArea > 0 ? boardArea / stageArea : 0,
        boardTop: board?.top ?? 0,
        topHudHeight,
        topChromeHeight,
        bottomSheetHeight: bottomSheet?.height ?? 0,
        hasMobileResourceTabs: Boolean(document.querySelector('[data-testid="mobile-resource-tabs"]')),
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        boardIntersectsCallout: intersects(board, callout),
        minimumPlayerTextSize: Math.min(
          fontSize('.board-meta'),
          fontSize('.inventory-section h3'),
          fontSize('.stat-pill-value')
        ),
        topStatusText: document.querySelector('.top-strip')?.textContent ?? ''
      };
    })()
  `);
}

function assertMatchLayoutSupportsPrimaryDesktop(metrics: MatchLayoutMetrics): void {
  assert.ok(
    metrics.boardRatio >= 0.4,
    `expected board to occupy at least 40% of 1920x1080 viewport, got ${(metrics.boardRatio * 100).toFixed(1)}%`
  );
  assert.ok(
    metrics.topHudHeight <= 112,
    `expected primary desktop top HUD to stay at or below 112px, got ${metrics.topHudHeight.toFixed(0)}px`
  );
  assert.equal(metrics.boardIntersectsCallout, false, "phase guidance must not overlap the board on primary desktop");
}

function assertMatchLayoutSupportsSmallDesktop(metrics: MatchLayoutMetrics): void {
  assert.ok(
    metrics.boardRatio >= 0.32,
    `expected board to occupy at least 32% of 1280x720 viewport, got ${(metrics.boardRatio * 100).toFixed(1)}%`
  );
  assert.ok(
    metrics.boardStageRatio >= 0.5,
    `expected board to use at least 50% of its canvas, got ${(metrics.boardStageRatio * 100).toFixed(1)}%`
  );
  assert.ok(
    metrics.topHudHeight <= 96,
    `expected top HUD to stay at or below 96px, got ${metrics.topHudHeight.toFixed(0)}px`
  );
  assert.ok(
    metrics.topChromeHeight <= 140,
    `expected total top chrome to stay at or below 140px, got ${metrics.topChromeHeight.toFixed(0)}px`
  );
  assert.equal(metrics.boardIntersectsCallout, false, "phase guidance must not overlap the board");
  assert.ok(
    metrics.minimumPlayerTextSize >= 12,
    `expected player-facing compact text to be at least 12px, got ${metrics.minimumPlayerTextSize.toFixed(2)}px`
  );
}

function assertMatchLayoutSupportsMobile(metrics: MatchLayoutMetrics): void {
  assert.equal(metrics.hasMobileResourceTabs, true, "mobile match layout should expose bottom sheet resource tabs");
  assert.equal(metrics.hasHorizontalOverflow, false, "mobile match layout must not create horizontal page overflow");
  assert.ok(metrics.boardTop < 360, `expected mobile board to appear before deep inventory content, got top ${metrics.boardTop.toFixed(0)}px`);
  assert.ok(
    metrics.bottomSheetHeight <= 844 * 0.45,
    `expected mobile bottom sheet to stay within 45% viewport height, got ${metrics.bottomSheetHeight.toFixed(0)}px`
  );
  assert.equal(
    /treasurePlacement|prioritySubmission|inTurn|Phase|Turn/.test(metrics.topStatusText),
    false,
    `expected top status to use player-facing localized labels, got ${JSON.stringify(metrics.topStatusText)}`
  );
}

async function submitCurrentAuctionBid(page: CdpPage): Promise<void> {
  const submitted = await page.evaluate<boolean>(`
    (async () => {
      const activeSession = JSON.parse(sessionStorage.getItem('project-bh.active-session') ?? 'null');

      if (!activeSession) {
        return false;
      }

      const roomResponse = await fetch('/api/rooms/' + activeSession.roomId + '?sessionToken=' + encodeURIComponent(activeSession.sessionToken));

      if (!roomResponse.ok) {
        return false;
      }

      const envelope = await roomResponse.json();
      const offer = envelope.snapshot?.state?.round?.auction?.currentOffer;

      if (!offer || !envelope.snapshot?.state?.matchId) {
        return false;
      }

      const commandResponse = await fetch('/api/rooms/' + activeSession.roomId + '/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          matchId: envelope.snapshot.state.matchId,
          sessionToken: activeSession.sessionToken,
          type: 'match.submitAuctionBids',
          bids: [{ offerSlot: offer.slot, amount: 0 }]
        })
      });

      return commandResponse.ok;
    })()
  `);

  assert.equal(submitted, true, "Expected current auction bid to submit through the browser session.");
}

async function readActiveRoomEnvelope(page: CdpPage): Promise<{
  readonly snapshot?: {
    readonly state?: {
      readonly board?: {
        readonly fences?: Record<string, unknown>;
      };
    };
    readonly viewer?: {
      readonly self?: {
        readonly specialInventory?: Record<string, number>;
      };
    };
  };
}> {
  return await page.evaluate(`
    (async () => {
      const activeSession = JSON.parse(sessionStorage.getItem('project-bh.active-session') ?? 'null');

      if (!activeSession) {
        throw new Error('Missing active browser session.');
      }

      const response = await fetch('/api/rooms/' + activeSession.roomId + '?sessionToken=' + encodeURIComponent(activeSession.sessionToken));

      if (!response.ok) {
        throw new Error('Room refresh failed: ' + response.status);
      }

      return await response.json();
    })()
  `);
}

async function waitForSpecialInventory(page: CdpPage, cardType: string, expectedCharges: number): Promise<void> {
  await waitFor(
    async () => {
      const envelope = await readActiveRoomEnvelope(page);
      const charges = envelope.snapshot?.viewer?.self?.specialInventory?.[cardType];

      if (charges !== expectedCharges) {
        throw new Error(`Expected ${cardType} charges ${expectedCharges}, got ${String(charges)}.`);
      }
    },
    { label: `${cardType} inventory ${expectedCharges}`, timeoutMs: 20_000 }
  );
}

async function waitForFenceCount(page: CdpPage, expectedCount: number): Promise<void> {
  await waitFor(
    async () => {
      const envelope = await readActiveRoomEnvelope(page);
      const count = Object.keys(envelope.snapshot?.state?.board?.fences ?? {}).length;

      if (count !== expectedCount) {
        throw new Error(`Expected fence count ${expectedCount}, got ${count}.`);
      }
    },
    { label: `fence count ${expectedCount}`, timeoutMs: 20_000 }
  );
}

async function submitPriorityCard(page: CdpPage, priorityCard: number): Promise<void> {
  const submitted = await page.evaluate<boolean>(`
    (async () => {
      const activeSession = JSON.parse(sessionStorage.getItem('project-bh.active-session') ?? 'null');

      if (!activeSession) {
        return false;
      }

      const roomResponse = await fetch('/api/rooms/' + activeSession.roomId + '?sessionToken=' + encodeURIComponent(activeSession.sessionToken));

      if (!roomResponse.ok) {
        return false;
      }

      const envelope = await roomResponse.json();

      if (!envelope.snapshot?.state?.matchId) {
        return false;
      }

      const commandResponse = await fetch('/api/rooms/' + activeSession.roomId + '/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          matchId: envelope.snapshot.state.matchId,
          sessionToken: activeSession.sessionToken,
          type: 'match.submitPriority',
          priorityCard: ${priorityCard}
        })
      });

      return commandResponse.ok;
    })()
  `);

  assert.equal(submitted, true, `Expected priority card ${priorityCard} to submit through the browser session.`);
}

async function placeTreasure(page: CdpPage, treasureId: string, cell: string): Promise<void> {
  await page.clickSelector(`[data-treasure-id="${treasureId}"]`);
  await page.waitForExpression(
    `document.querySelector('[data-treasure-id="${treasureId}"]')?.classList.contains('is-selected') === true`,
    `treasure ${treasureId} selected`
  );
  await page.rightClickSelector(`button[data-cell="${cell}"]`);
  await page.waitForExpression(
    `Boolean(document.querySelector('[data-testid="context-menu"] [data-action-id="place-treasure"]'))`,
    `treasure placement menu for ${cell}`
  );
  await page.clickSelector(`[data-testid="context-menu"] [data-action-id="place-treasure"]`);
  await page.waitForExpression(
    `document.querySelector('[data-treasure-id="${treasureId}"]') === null`,
    `treasure ${treasureId} placement acknowledgement`
  );
}

test(
  "browser smoke covers treasure placement, auction reveal, special-card targeting, and turn gates",
  { timeout: 120_000 },
  async (context) => {
    let backend: Awaited<ReturnType<typeof startHttpServer>> | null = null;
    let vite: ViteDevServer | null = null;
    let hostChrome: ChromeHandle | null = null;
    let guestChrome: ChromeHandle | null = null;
    let hostPage: CdpPage | null = null;
    let guestPage: CdpPage | null = null;

    if (process.env.RUN_BROWSER_SMOKE !== "1") {
      context.skip("Set RUN_BROWSER_SMOKE=1 to opt into launching a local browser process.");
      return;
    }

    if (!findChromeExecutable()) {
      context.skip("Chrome is not available for browser smoke coverage.");
      return;
    }

    try {
      try {
        backend = await startHttpServer({ port: 0, host: "127.0.0.1" });
      } catch (error) {
        if (isListenPermissionError(error)) {
          context.skip("Sandbox blocks local port binding; run browser smoke in a normal local shell.");
          return;
        }

        throw error;
      }

      const webPort = await getFreePort();
      vite = await createViteServer({
        ...createWebViteConfig({
          webHost: "127.0.0.1",
          webPort,
          backendHttpUrl: `http://${backend.host}:${backend.port}`,
          backendWsUrl: `ws://${backend.host}:${backend.port}`
        }),
        configFile: false,
        logLevel: "error"
      });
      await vite.listen();

      const baseUrl = `http://127.0.0.1:${webPort}`;

      try {
        hostChrome = await launchChrome(baseUrl);
      } catch (error) {
        context.skip(`Chrome headless debugging is unavailable in this environment: ${(error as Error).message}`);
        return;
      }

      hostPage = await CdpPage.connect(hostChrome.debugPort, baseUrl);
      await hostPage.setViewport(1280, 720);
      await hostPage.waitForExpression(
        `document.querySelector('[data-screen="landing"]') !== null`,
        "host landing screen"
      );
      await hostPage.fillInput('[data-testid="host-name-input"]', "Host");
      await hostPage.clickSelector('[data-testid="create-party-button"]');
      await hostPage.waitForExpression(
        `document.querySelector('[data-screen="room-lobby"]') !== null`,
        "host room lobby"
      );

      const inviteCode = await hostPage.textContent('[data-testid="invite-code-pill"]');
      assert.equal(inviteCode.length, 6);

      guestChrome = await launchChrome(`${baseUrl}/?invite=${inviteCode}`);
      guestPage = await CdpPage.connect(guestChrome.debugPort, `${baseUrl}/?invite=${inviteCode}`);
      await guestPage.setViewport(1280, 720);
      await guestPage.waitForExpression(
        `document.querySelector('[data-screen="landing"]') !== null`,
        "guest landing screen"
      );
      await guestPage.fillInput('[data-testid="join-name-input"]', "Guest");
      await guestPage.waitForExpression(
        `document.querySelector('[data-testid="invite-code-input"]')?.value === ${JSON.stringify(inviteCode)}`,
        "guest invite autofill"
      );
      await guestPage.clickSelector('[data-testid="join-party-button"]');
      await guestPage.waitForExpression(
        `document.querySelector('[data-screen="room-lobby"]') !== null`,
        "guest room lobby"
      );

      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="start-match-button"]') instanceof HTMLButtonElement &&
          !document.querySelector('[data-testid="start-match-button"]')?.hasAttribute('disabled')`,
        "start match enabled"
      );
      await hostPage.clickSelector('[data-testid="start-match-button"]');

      await hostPage.waitForExpression(
        `document.querySelector('[data-screen="match"]') !== null &&
          document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'treasurePlacement'`,
        "host treasure placement phase",
        20_000
      );
      await guestPage.waitForExpression(
        `document.querySelector('[data-screen="match"]') !== null &&
          document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'treasurePlacement'`,
        "guest treasure placement phase",
        20_000
      );

      assertMatchLayoutSupportsSmallDesktop(await readMatchLayoutMetrics(hostPage));
      await hostPage.setViewport(1920, 1080);
      await hostPage.waitForExpression(
        `document.querySelector('.board')?.getBoundingClientRect().width > 900`,
        "primary desktop board resize"
      );
      assertMatchLayoutSupportsPrimaryDesktop(await readMatchLayoutMetrics(hostPage));
      await hostPage.setViewport(390, 844, true);
      await hostPage.waitForExpression(
        `window.innerWidth === 390 && document.querySelector('[data-screen="match"]') !== null`,
        "mobile match resize"
      );
      assertMatchLayoutSupportsMobile(await readMatchLayoutMetrics(hostPage));
      await hostPage.setViewport(1280, 720);
      await hostPage.waitForExpression(
        `document.querySelector('.board')?.getBoundingClientRect().width > 600`,
        "small desktop board restore"
      );

      const hostTreasureIds = await hostPage.evaluate<readonly string[]>(`
        [...document.querySelectorAll('[data-testid="treasure-card-button"]')].map((element) =>
          element instanceof HTMLButtonElement && !element.disabled
            ? element.getAttribute('data-treasure-id') ?? ''
            : ''
        ).filter(Boolean)
      `);
      const guestTreasureIds = await guestPage.evaluate<readonly string[]>(`
        [...document.querySelectorAll('[data-testid="treasure-card-button"]')].map((element) =>
          element instanceof HTMLButtonElement && !element.disabled
            ? element.getAttribute('data-treasure-id') ?? ''
            : ''
        ).filter(Boolean)
      `);

      assert.ok(hostTreasureIds.length >= 1);
      assert.ok(guestTreasureIds.length >= 1);

      for (const [index, treasureId] of hostTreasureIds.entries()) {
        await placeTreasure(hostPage, treasureId, `${7 + index},7`);
      }

      for (const [index, treasureId] of guestTreasureIds.entries()) {
        await placeTreasure(guestPage, treasureId, `${9 + index},7`);
      }

      await hostPage.waitForExpression(
        `document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'auction'`,
        "host auction phase",
        20_000
      );
      await guestPage.waitForExpression(
        `document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'auction'`,
        "guest auction phase",
        20_000
      );

      const revealedOffers: string[] = [];

      await hostPage.clickSelector('[data-testid="auction-buy-fence-button"]');
      await waitForSpecialInventory(hostPage, "fence", 3);

      for (let index = 0; index < 4; index += 1) {
        const currentOffer = await hostPage.textContent('.auction-showcase-card strong');
        const currentRound = await hostPage.textContent('[data-testid="auction-round-pill"]');
        revealedOffers.push(currentOffer);

        await submitCurrentAuctionBid(hostPage);
        await submitCurrentAuctionBid(guestPage);

        if (index < 3) {
          await hostPage.waitForExpression(
            `document.querySelector('[data-testid="auction-round-pill"]')?.textContent?.trim() !== ${JSON.stringify(currentRound)}`,
            `auction reveal ${index + 2}`,
            20_000
          );
        }
      }

      assert.deepEqual(revealedOffers, ["냉기 폭탄", "화염 폭탄", "전기 폭탄", "대형 망치"]);

      await hostPage.waitForExpression(
        `document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'prioritySubmission'`,
        "host priority phase",
        20_000
      );
      await guestPage.waitForExpression(
        `document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'prioritySubmission'`,
        "guest priority phase",
        20_000
      );

      await submitPriorityCard(hostPage, 6);
      await submitPriorityCard(guestPage, 5);

      await hostPage.waitForExpression(
        `document.querySelector('[data-screen="match"]')?.getAttribute('data-round-phase') === 'inTurn' &&
          document.querySelector('[data-testid="turn-stage"]')?.textContent?.includes('1칸 이동') === true`,
        "host in-turn mandatory step",
        20_000
      );

      await hostPage.rightClickSelector('button[data-cell="1,0"]');
      await hostPage.waitForExpression(
        `Boolean(document.querySelector('[data-testid="context-menu"] [data-action-id="move-player"]'))`,
        "move action in context menu"
      );
      await hostPage.clickSelector('[data-testid="context-menu"] [data-action-id="move-player"]');
      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="turn-stage"]')?.textContent?.includes('행동 선택') === true`,
        "secondary action stage after move",
        20_000
      );

      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="prepare-next-round-button"]') === null`,
        "next-round progression hidden before round completion"
      );
      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="special-card-button"][data-special-card="fence"]') instanceof HTMLButtonElement &&
          !document.querySelector('[data-testid="special-card-button"][data-special-card="fence"]')?.hasAttribute('disabled')`,
        "fence special card enabled in secondary action",
        20_000
      );
      await hostPage.clickSelector('[data-testid="special-card-button"][data-special-card="fence"]');
      await hostPage.rightClickSelector('button[data-cell="2,0"]');
      await hostPage.waitForExpression(
        `Boolean(document.querySelector('[data-testid="context-menu"] [data-action-id="fence-first"]'))`,
        "fence first target action"
      );
      await hostPage.clickSelector('[data-testid="context-menu"] [data-action-id="fence-first"]');
      await hostPage.rightClickSelector('button[data-cell="2,1"]');
      await hostPage.waitForExpression(
        `Boolean(document.querySelector('[data-testid="context-menu"] [data-action-id="fence-place"]'))`,
        "fence placement action"
      );
      await hostPage.clickSelector('[data-testid="context-menu"] [data-action-id="fence-place"]');
      await waitForSpecialInventory(hostPage, "fence", 2);
      await waitForFenceCount(hostPage, 1);
    } finally {
      await hostPage?.close();
      await guestPage?.close();
      await closeChrome(hostChrome);
      await closeChrome(guestChrome);
      await vite?.close();
      await backend?.close();
    }
  }
);
