import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../packages/domain/src/index.ts";
import { createEngineWorker } from "./engine-worker.ts";
import { createInMemoryRuntimeStore } from "./runtime/in-memory-runtime-store.ts";

test("engine worker applies command envelopes and appends authoritative events", async () => {
  const store = createInMemoryRuntimeStore();
  const worker = createEngineWorker({ store });
  const state = createMatchState({
    matchId: "match-engine-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.matches.saveSnapshot({
    sessionId: "session-engine-test",
    state,
    logLength: 0,
    revision: 0
  });

  await store.streams.appendCommand("session-engine-test", {
    commandId: "command-engine-1",
    roomId: "room-engine",
    playerId: "p1",
    receivedAt: "2026-04-30T00:00:00.000Z",
    payload: {
      type: "match.submitAuctionBids",
      version: 1,
      matchId: "match-engine-test",
      playerId: "p1",
      bids: []
    }
  });

  const processed = await worker.processNextCommand("session-engine-test");
  const snapshot = await store.matches.getSnapshot("session-engine-test");
  const events = await store.streams.readEvents("session-engine-test", "0-0", 10);

  assert.equal(processed, true);
  assert.equal(snapshot?.revision, 1);
  assert.equal(snapshot?.logLength, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.value.commandId, "command-engine-1");
});

test("engine worker records domain rejections without losing canonical state", async () => {
  const store = createInMemoryRuntimeStore();
  const worker = createEngineWorker({ store });
  const state = createMatchState({
    matchId: "match-engine-reject",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.matches.saveSnapshot({
    sessionId: "session-engine-reject",
    state,
    logLength: 0,
    revision: 0
  });

  await store.streams.appendCommand("session-engine-reject", {
    commandId: "command-engine-reject-1",
    roomId: "room-engine",
    playerId: "p2",
    receivedAt: "2026-04-30T00:00:00.000Z",
    payload: {
      type: "match.endTurn",
      version: 1,
      matchId: "match-engine-reject",
      playerId: "p2"
    }
  });

  await worker.processNextCommand("session-engine-reject");
  const snapshot = await store.matches.getSnapshot("session-engine-reject");
  const events = await store.streams.readEvents("session-engine-reject", "0-0", 10);

  assert.equal(snapshot?.revision, 1);
  assert.ok(events[0]!.value.result.rejection);
  assert.equal(snapshot?.state.round.phase, "auction");
});

test("engine worker treats repeated command ids as idempotent", async () => {
  const store = createInMemoryRuntimeStore();
  const worker = createEngineWorker({ store });
  const state = createMatchState({
    matchId: "match-engine-idempotency",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.matches.saveSnapshot({
    sessionId: "session-engine-idempotency",
    state,
    logLength: 0,
    revision: 0
  });

  const envelope = {
    commandId: "command-engine-idempotent-1",
    roomId: "room-engine",
    playerId: "p1",
    receivedAt: "2026-04-30T00:00:00.000Z",
    payload: {
      type: "match.submitAuctionBids",
      version: 1,
      matchId: "match-engine-idempotency",
      playerId: "p1",
      bids: []
    } as const
  };

  await store.streams.appendCommand("session-engine-idempotency", envelope);
  await store.streams.appendCommand("session-engine-idempotency", envelope);

  await worker.processNextCommand("session-engine-idempotency");
  await worker.processNextCommand("session-engine-idempotency");

  const snapshot = await store.matches.getSnapshot("session-engine-idempotency");
  const events = await store.streams.readEvents("session-engine-idempotency", "0-0", 10);

  assert.equal(snapshot?.revision, 1);
  assert.equal(snapshot?.logLength, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0]!.value.revision, events[1]!.value.revision);
});
