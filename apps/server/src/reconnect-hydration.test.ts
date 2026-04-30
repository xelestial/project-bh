import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntimeStore } from "./runtime/in-memory-runtime-store.ts";
import { loadReconnectContext } from "./reconnect-hydration.ts";
import { hashSessionToken } from "./security/session-token.ts";

test("reconnect hydration restores room and player session from runtime store", async () => {
  const store = createInMemoryRuntimeStore();
  const sessionTokenSecret = "0123456789abcdef0123456789abcdef";
  const sessionToken = "player-session-token";
  const tokenHash = hashSessionToken(sessionToken, sessionTokenSecret);

  await store.rooms.save({
    roomId: "room-reconnect",
    inviteCode: "ABC123",
    roomName: "Reconnect Room",
    visibility: "public",
    hostPlayerId: "p1",
    desiredPlayerCount: 2,
    createdAt: "2026-04-30T00:00:00.000Z",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ],
    status: "started",
    sessionId: "session-reconnect"
  });
  await store.sessions.save({
    tokenHash,
    roomId: "room-reconnect",
    playerId: "p2",
    clientInstanceId: "client-p2",
    issuedAt: "2026-04-30T00:00:00.000Z",
    expiresAt: "2026-05-01T00:00:00.000Z",
    revokedAt: null
  });

  const context = await loadReconnectContext({
    store,
    roomId: "room-reconnect",
    sessionToken,
    sessionTokenSecret,
    now: () => "2026-04-30T01:00:00.000Z"
  });

  assert.equal(context?.room.roomId, "room-reconnect");
  assert.equal(context?.session.playerId, "p2");
});

test("reconnect hydration rejects tokens for another room", async () => {
  const store = createInMemoryRuntimeStore();
  const sessionTokenSecret = "0123456789abcdef0123456789abcdef";
  const sessionToken = "player-session-token";
  const tokenHash = hashSessionToken(sessionToken, sessionTokenSecret);

  await store.rooms.save({
    roomId: "room-reconnect",
    inviteCode: "ABC123",
    roomName: "Reconnect Room",
    visibility: "public",
    hostPlayerId: "p1",
    desiredPlayerCount: 2,
    createdAt: "2026-04-30T00:00:00.000Z",
    players: [{ id: "p1", name: "One" }],
    status: "lobby",
    sessionId: null
  });
  await store.sessions.save({
    tokenHash,
    roomId: "other-room",
    playerId: "p1",
    clientInstanceId: "client-p1",
    issuedAt: "2026-04-30T00:00:00.000Z",
    expiresAt: "2026-05-01T00:00:00.000Z",
    revokedAt: null
  });

  const context = await loadReconnectContext({
    store,
    roomId: "room-reconnect",
    sessionToken,
    sessionTokenSecret,
    now: () => "2026-04-30T01:00:00.000Z"
  });

  assert.equal(context, null);
});
