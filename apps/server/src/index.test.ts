import assert from "node:assert/strict";
import test from "node:test";

import { createPosition } from "../../../packages/domain/src/index.ts";
import { createServerCompositionRoot } from "./index.ts";

test("server creates sessions, validates commands, and keeps an authoritative log", () => {
  const server = createServerCompositionRoot();
  server.createSession("session-1", {
    matchId: "match-1",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ],
    treasures: [
      {
        id: "treasure-1",
        slot: 1,
        points: 3,
        position: createPosition(1, 0)
      }
    ]
  });

  const invalid = server.dispatchRawCommand("session-1", {
    type: "match.submitPriority",
    version: 1,
    matchId: "match-1",
    playerId: "player-1",
    priorityCard: 99
  });

  assert.equal(invalid.rejection?.code, "PROTOCOL_VALIDATION_FAILED");

  server.dispatchCommand("session-1", {
    type: "match.submitAuctionBids",
    version: 1,
    matchId: "match-1",
    playerId: "player-1",
    bids: []
  });
  server.dispatchCommand("session-1", {
    type: "match.submitAuctionBids",
    version: 1,
    matchId: "match-1",
    playerId: "player-2",
    bids: []
  });
  server.dispatchCommand("session-1", {
    type: "match.submitPriority",
    version: 1,
    matchId: "match-1",
    playerId: "player-1",
    priorityCard: 6
  });
  const result = server.dispatchCommand("session-1", {
    type: "match.submitPriority",
    version: 1,
    matchId: "match-1",
    playerId: "player-2",
    priorityCard: 5
  });

  assert.equal(result.rejection, null);
  assert.equal(server.getSnapshot("session-1").state.round.activePlayerId, "player-1");
  assert.equal(server.getEventLog("session-1").length, 4);
});

test("server reconnect returns snapshot and command history", () => {
  const server = createServerCompositionRoot();
  server.createSession("session-2", {
    matchId: "match-2",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ]
  });

  server.dispatchCommand("session-2", {
    type: "match.submitAuctionBids",
    version: 1,
    matchId: "match-2",
    playerId: "player-1",
    bids: []
  });
  server.dispatchCommand("session-2", {
    type: "match.submitAuctionBids",
    version: 1,
    matchId: "match-2",
    playerId: "player-2",
    bids: []
  });

  const reconnect = server.reconnect("session-2", "player-1");

  assert.equal(reconnect.snapshot.state.round.phase, "prioritySubmission");
  assert.equal(reconnect.log.length, 2);
});
