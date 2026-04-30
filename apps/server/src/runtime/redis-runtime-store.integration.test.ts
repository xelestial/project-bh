import assert from "node:assert/strict";
import test from "node:test";

import { createClient } from "redis";

import { createMatchState } from "../../../../packages/domain/src/index.ts";
import { createRedisRuntimeStore } from "./redis-runtime-store.ts";

test("redis runtime store persists snapshot and stream entries", async (context) => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    context.skip("REDIS_URL is not configured.");
    return;
  }

  const client = createClient({ url: redisUrl });
  await client.connect();

  try {
    const store = createRedisRuntimeStore({
      client,
      keyPrefix: `bh:test:${Date.now()}`
    });
    const state = createMatchState({
      matchId: "match-redis-test",
      players: [
        { id: "p1", name: "One" },
        { id: "p2", name: "Two" }
      ]
    });

    await store.matches.saveSnapshot({
      sessionId: "session-redis-test",
      state,
      logLength: 0,
      revision: 0
    });

    await store.streams.appendCommand("session-redis-test", {
      commandId: "command-redis-1",
      roomId: "room-redis",
      playerId: "p1",
      receivedAt: "2026-04-30T00:00:00.000Z",
      payload: {
        type: "match.endTurn",
        version: 1,
        matchId: "match-redis-test",
        playerId: "p1"
      }
    });

    await store.streamCursors.save("session-redis-test", "engine-a", "1-0");

    assert.equal((await store.matches.getSnapshot("session-redis-test"))?.revision, 0);
    assert.equal((await store.streams.readCommands("session-redis-test", "0-0", 10)).length, 1);
    assert.equal(await store.streamCursors.get("session-redis-test", "engine-a"), "1-0");
  } finally {
    await client.quit();
  }
});
