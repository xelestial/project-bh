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

  await rm(handle.userDataDir, { recursive: true, force: true });
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
        element.value = ${JSON.stringify(value)};
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()
    `);

    assert.equal(updated, true, `Expected ${selector} to be an input.`);
  }

  async rightClickSelector(selector: string): Promise<void> {
    const position = await this.evaluate<{ readonly x: number; readonly y: number } | null>(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      })()
    `);

    assert.ok(position, `Expected ${selector} to exist for right click.`);

    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: position.x,
      y: position.y,
      button: "right",
      clickCount: 1
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: position.x,
      y: position.y,
      button: "right",
      clickCount: 1
    });
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
}

async function placeTreasure(page: CdpPage, treasureId: string, cell: string): Promise<void> {
  await page.clickSelector(`[data-treasure-id="${treasureId}"]`);
  await page.rightClickSelector(`[data-cell="${cell}"]`);
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
  "browser smoke covers treasure placement, sequential auction reveal, and right-click movement",
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
          document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('treasurePlacement') === true`,
        "host treasure placement phase",
        20_000
      );
      await guestPage.waitForExpression(
        `document.querySelector('[data-screen="match"]') !== null &&
          document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('treasurePlacement') === true`,
        "guest treasure placement phase",
        20_000
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
        await placeTreasure(hostPage, treasureId, `${5 + index},5`);
      }

      for (const [index, treasureId] of guestTreasureIds.entries()) {
        await placeTreasure(guestPage, treasureId, `${7 + index},5`);
      }

      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('auction') === true`,
        "host auction phase",
        20_000
      );
      await guestPage.waitForExpression(
        `document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('auction') === true`,
        "guest auction phase",
        20_000
      );

      const revealedOffers: string[] = [];

      for (let index = 0; index < 4; index += 1) {
        const currentOffer = await hostPage.textContent('[data-testid="auction-current-offer"]');
        revealedOffers.push(currentOffer);

        await hostPage.clickSelector('[data-testid="auction-submit-button"]');
        await guestPage.clickSelector('[data-testid="auction-submit-button"]');

        if (index < 3) {
          await hostPage.waitForExpression(
            `document.querySelector('[data-testid="auction-current-offer"]')?.textContent?.trim() !== ${JSON.stringify(currentOffer)}`,
            `auction reveal ${index + 2}`,
            20_000
          );
        }
      }

      assert.deepEqual(revealedOffers, ["coldBomb", "flameBomb", "electricBomb", "largeHammer"]);

      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('prioritySubmission') === true`,
        "host priority phase",
        20_000
      );
      await guestPage.waitForExpression(
        `document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('prioritySubmission') === true`,
        "guest priority phase",
        20_000
      );

      await hostPage.clickSelector('[data-priority-card="6"]');
      await guestPage.clickSelector('[data-priority-card="5"]');

      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="round-phase"]')?.textContent?.includes('inTurn') === true &&
          document.querySelector('[data-testid="turn-stage"]')?.textContent?.includes('1칸 이동') === true`,
        "host in-turn mandatory step",
        20_000
      );

      await hostPage.rightClickSelector('[data-cell="1,0"]');
      await hostPage.waitForExpression(
        `Boolean(document.querySelector('[data-testid="context-menu"] [data-action-id="move-player"]'))`,
        "move action in context menu"
      );
      await hostPage.clickSelector('[data-testid="context-menu"] [data-action-id="move-player"]');
      await hostPage.waitForExpression(
        `document.querySelector('[data-testid="turn-stage"]')?.textContent?.includes('+2 선택') === true`,
        "secondary action stage after move",
        20_000
      );
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
