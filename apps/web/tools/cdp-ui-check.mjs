import fs from "node:fs/promises";

import WebSocket from "ws";

const [, , endpoint, mode, screenshotPath] = process.argv;

if (!endpoint || !mode || !screenshotPath) {
  console.error("Usage: node apps/web/tools/cdp-ui-check.mjs <endpoint> <mode> <screenshot-path>");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ws = new WebSocket(endpoint);
let sequence = 0;
const pending = new Map();

await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});

ws.on("message", (raw) => {
  const message = JSON.parse(raw.toString("utf8"));

  if (!message.id || !pending.has(message.id)) {
    return;
  }

  const callback = pending.get(message.id);
  pending.delete(message.id);
  callback(message);
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, (message) => {
      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }

      resolve(message.result ?? {});
    });

    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  return result.result?.value;
}

async function capture(path) {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png"
  });
  await fs.writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function clickPoint(x, y) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1
  });
}

async function clickButtonByText(text) {
  const position = await evaluate(`
    (() => {
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes(${JSON.stringify(text)})
      );
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        disabled: button.disabled
      };
    })()
  `);

  if (!position) {
    return null;
  }

  await clickPoint(position.x, position.y);
  return position;
}

async function typeIntoInputByIndex(index, text) {
  const position = await evaluate(`
    (() => {
      const input = document.querySelectorAll('input')[${index}];
      if (!(input instanceof HTMLInputElement)) return null;
      input.focus();
      input.select();
      const rect = input.getBoundingClientRect();
      return {
        x: rect.left + 16,
        y: rect.top + rect.height / 2
      };
    })()
  `);

  if (!position) {
    return false;
  }

  await clickPoint(position.x, position.y);
  await send("Input.insertText", { text });
  await sleep(120);
  return true;
}

async function prepare() {
  await send("Page.enable");
  await send("Runtime.enable");
  await sleep(1000);
}

async function createHostWaitingRoom() {
  const typed = await typeIntoInputByIndex(0, "Host");
  const clickInfo = await clickButtonByText("Create Party");
  await sleep(1800);
  const inviteCode = await evaluate(`
    document.querySelector('.invite-code-pill')?.textContent?.trim() ?? ''
  `);
  await capture(screenshotPath);
  console.log(JSON.stringify({ inviteCode, clickInfo, typed }));
}

async function startMatch() {
  const clickInfo = await clickButtonByText("Start Match");
  await sleep(2500);
  const phase = await evaluate(`
    [...document.querySelectorAll('.title-row span')].map((node) => node.textContent).join(' | ')
  `);
  await capture(screenshotPath);
  console.log(JSON.stringify({ phase, clickInfo }));
}

try {
  await prepare();

  if (mode === "host-waiting") {
    await createHostWaitingRoom();
  } else if (mode === "start-match") {
    await startMatch();
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }
} finally {
  ws.close();
}
