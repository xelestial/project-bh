import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../../packages/domain/src/index.ts";
import { createInMemoryRuntimeStore } from "./in-memory-runtime-store.ts";

test("runtime store persists rooms, sessions, snapshots, and commands", async () => {
  const store = createInMemoryRuntimeStore();
  const state = createMatchState({
    matchId: "match-runtime-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.rooms.save({
    roomId: "room-1",
    inviteCode: "ABC123",
    roomName: "Room One",
    visibility: "public",
    hostPlayerId: "p1",
    desiredPlayerCount: 2,
    createdAt: "2026-04-30T00:00:00.000Z",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ],
    status: "started",
    sessionId: "session-room-1"
  });

  await store.sessions.save({
    tokenHash: "hash-1",
    roomId: "room-1",
    playerId: "p1",
    clientInstanceId: "client-1",
    issuedAt: "2026-04-30T00:00:00.000Z",
    expiresAt: "2026-05-01T00:00:00.000Z",
    revokedAt: null
  });

  await store.matches.saveSnapshot({
    sessionId: "session-room-1",
    state,
    logLength: 0,
    revision: 0
  });

  const commandId = await store.streams.appendCommand("session-room-1", {
    commandId: "command-1",
    roomId: "room-1",
    playerId: "p1",
    receivedAt: "2026-04-30T00:00:01.000Z",
    payload: {
      type: "match.endTurn",
      version: 1,
      matchId: "match-runtime-test",
      playerId: "p1"
    }
  });

  assert.equal((await store.rooms.get("room-1"))?.roomName, "Room One");
  assert.equal((await store.sessions.getByTokenHash("hash-1"))?.playerId, "p1");
  assert.equal((await store.matches.getSnapshot("session-room-1"))?.revision, 0);
  assert.equal(commandId, "1-0");
  assert.equal((await store.streams.readCommands("session-room-1", "0-0", 10)).length, 1);
});
