import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntimeStore } from "../runtime/in-memory-runtime-store.ts";
import { createFixedWindowRateLimiter } from "./rate-limit.ts";

test("fixed window rate limiter blocks requests after the configured limit", async () => {
  const store = createInMemoryRuntimeStore();
  const limiter = createFixedWindowRateLimiter({
    store,
    limit: 2,
    windowMs: 1000,
    now: () => 1000
  });

  assert.equal((await limiter.check({ scope: "room.create", identity: "ip-1" })).allowed, true);
  assert.equal((await limiter.check({ scope: "room.create", identity: "ip-1" })).allowed, true);
  const blocked = await limiter.check({ scope: "room.create", identity: "ip-1" });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterMs, 1000);
});

test("fixed window rate limiter opens a new window when time advances", async () => {
  let now = 1000;
  const store = createInMemoryRuntimeStore();
  const limiter = createFixedWindowRateLimiter({
    store,
    limit: 1,
    windowMs: 1000,
    now: () => now
  });

  assert.equal((await limiter.check({ scope: "command", identity: "player-1" })).allowed, true);
  assert.equal((await limiter.check({ scope: "command", identity: "player-1" })).allowed, false);

  now = 2000;
  assert.equal((await limiter.check({ scope: "command", identity: "player-1" })).allowed, true);
});
