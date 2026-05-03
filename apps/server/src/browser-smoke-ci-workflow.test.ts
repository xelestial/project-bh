import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const WORKFLOW_FILE = new URL("../../../.github/workflows/browser-smoke.yml", import.meta.url);

test("browser smoke CI workflow runs the visual browser smoke path", () => {
  const workflow = readFileSync(WORKFLOW_FILE, "utf8");

  assert.match(workflow, /RUN_BROWSER_SMOKE: "1"/);
  assert.match(workflow, /CHROME_BIN:/);
  assert.match(workflow, /pnpm test:browser-smoke/);
  assert.match(workflow, /pnpm build:web/);
});
