import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const WORKFLOW_FILE = new URL("../../../.github/workflows/redis-runtime.yml", import.meta.url);

test("redis runtime CI workflow runs the Redis-backed integration suite", () => {
  const workflow = readFileSync(WORKFLOW_FILE, "utf8");

  assert.match(workflow, /redis:7-alpine/);
  assert.match(workflow, /REDIS_URL: redis:\/\/127\.0\.0\.1:6379/);
  assert.match(workflow, /pnpm test:redis-runtime/);
});
