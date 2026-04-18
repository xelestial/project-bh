import assert from "node:assert/strict";
import test from "node:test";

import { getCommandVersion, validateMatchCommand } from "./match-command-schema.ts";

test("protocol accepts a valid priority submission command", () => {
  const result = validateMatchCommand({
    type: "match.submitPriority",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    priorityCard: 6
  });

  assert.equal(result.ok, true);
});

test("protocol accepts a valid auction bids command", () => {
  const result = validateMatchCommand({
    type: "match.submitAuctionBids",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    bids: [{ offerSlot: 0, amount: 2 }]
  });

  assert.equal(result.ok, true);
});

test("protocol accepts a valid throw command", () => {
  const result = validateMatchCommand({
    type: "match.throwTile",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    source: { x: 1, y: 1 },
    target: { x: 3, y: 1 }
  });

  assert.equal(result.ok, true);
});

test("protocol accepts a valid special card command", () => {
  const result = validateMatchCommand({
    type: "match.useSpecialCard",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    cardType: "fence",
    fencePositions: [
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  });

  assert.equal(result.ok, true);
});

test("protocol accepts a valid rotate command", () => {
  const result = validateMatchCommand({
    type: "match.rotateTiles",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    direction: "clockwise",
    selection: {
      kind: "rectangle6",
      origin: { x: 2, y: 2 },
      orientation: "horizontal"
    }
  });

  assert.equal(result.ok, true);
});

test("protocol accepts a valid prepare-next-round command", () => {
  const result = validateMatchCommand({
    type: "match.prepareNextRound",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    treasurePlacements: {
      "treasure-1": { x: 2, y: 2 }
    }
  });

  assert.equal(result.ok, true);
});

test("protocol rejects unknown versions", () => {
  const result = validateMatchCommand({
    type: "match.endTurn",
    version: 999,
    matchId: "match-1",
    playerId: "player-1"
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.message, /Unsupported command version/);
  }
});

test("protocol rejects invalid priority cards", () => {
  const result = validateMatchCommand({
    type: "match.submitPriority",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    priorityCard: 9
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.message, /priorityCard/);
  }
});

test("protocol rejects invalid rotation selections", () => {
  const result = validateMatchCommand({
    type: "match.rotateTiles",
    version: getCommandVersion(),
    matchId: "match-1",
    playerId: "player-1",
    direction: "clockwise",
    selection: {
      kind: "rectangle6",
      origin: { x: 2, y: 2 },
      orientation: "diagonal"
    }
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.message, /orientation/);
  }
});
