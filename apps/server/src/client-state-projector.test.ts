import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState, createPosition, placeTreasure, type MatchState } from "../../../packages/domain/src/index.ts";

import { projectSnapshotForPlayer } from "./client-state-projector.ts";

function createSnapshot(state: MatchState) {
  return {
    sessionId: "session-hidden",
    state,
    logLength: 0
  } as const;
}

test("player projection keeps treasure slot and score data off the public snapshot", () => {
  const match = createMatchState({
    matchId: "match-hidden",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ],
    treasureBoardSlots: [1, 2, 3, 4, 5, 6, 7],
    treasures: [
      { id: "treasure-slot-1", slot: 1, points: 3, ownerPlayerId: "player-1" },
      { id: "treasure-fake-1", slot: null, points: 0, ownerPlayerId: "player-1" },
      { id: "treasure-slot-2", slot: 2, points: 4, ownerPlayerId: "player-2" }
    ]
  });

  const projectedForPlayerTwo = projectSnapshotForPlayer(createSnapshot(match), "player-2");

  const publicTreasureIds = Object.keys(projectedForPlayerTwo.state.treasures);
  assert.equal(publicTreasureIds.length, 3);
  assert.ok(publicTreasureIds.every((id) => id.startsWith("tt-")));
  assert.ok(publicTreasureIds.every((id) => !id.includes("slot")));
  assert.ok(publicTreasureIds.every((id) => !id.includes("fake")));
  assert.equal("slot" in projectedForPlayerTwo.state.treasures[publicTreasureIds[0]!]!, false);
  assert.equal("ownerPlayerId" in projectedForPlayerTwo.state.treasures[publicTreasureIds[0]!]!, false);
  assert.equal("points" in projectedForPlayerTwo.state.treasures[publicTreasureIds[0]!]!, false);
  assert.equal("specialInventory" in projectedForPlayerTwo.state.players["player-1"]!, false);
  assert.equal("availablePriorityCards" in projectedForPlayerTwo.state.players["player-1"]!, false);
  assert.equal("carriedTreasureId" in projectedForPlayerTwo.state.players["player-1"]!, false);
  assert.equal(
    projectedForPlayerTwo.state.treasureBoard.slots.find((slot) => slot.slot === 1)?.hasCard,
    true
  );
  assert.equal(projectedForPlayerTwo.state.players["player-1"]?.carryingTreasure, false);
  assert.deepEqual(projectedForPlayerTwo.viewer.treasurePlacementHand, [
    {
      id: projectedForPlayerTwo.viewer.treasurePlacementHand[0]!.id,
      slot: 2,
      points: 4,
      isFake: false
    }
  ]);
  assert.deepEqual(projectedForPlayerTwo.viewer.self.availablePriorityCards, [1, 2, 3, 4, 5, 6]);
  assert.equal(projectedForPlayerTwo.viewer.self.specialInventory.coldBomb, 0);

  const afterPlacement = placeTreasure(match, {
    playerId: "player-1",
    treasureId: "treasure-slot-1",
    position: createPosition(7, 7)
  }).state;
  const projectedForPlayerOne = projectSnapshotForPlayer(createSnapshot(afterPlacement), "player-1");

  assert.deepEqual(projectedForPlayerOne.viewer.treasurePlacementHand, [
    {
      id: projectedForPlayerOne.viewer.treasurePlacementHand[0]!.id,
      slot: null,
      points: 0,
      isFake: true
    }
  ]);
});

test("only the treasure opener receives the revealed treasure card details", () => {
  const match = createMatchState({
    matchId: "match-opened",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ],
    treasureBoardSlots: [1, 2, 3, 4, 5, 6, 7],
    treasures: [
      { id: "treasure-slot-1", slot: 1, points: 6, ownerPlayerId: "player-1" }
    ]
  });
  const openedMatch: MatchState = {
    ...match,
    treasures: {
      ...match.treasures,
      "treasure-slot-1": {
        ...match.treasures["treasure-slot-1"]!,
        openedByPlayerId: "player-2"
      }
    }
  };

  const projectedForOpener = projectSnapshotForPlayer(createSnapshot(openedMatch), "player-2");
  const projectedForOtherPlayer = projectSnapshotForPlayer(createSnapshot(openedMatch), "player-1");

  assert.ok(projectedForOpener.viewer.revealedTreasureCards[0]!.id.startsWith("tt-"));
  assert.deepEqual(projectedForOpener.viewer.revealedTreasureCards, [
    {
      id: projectedForOpener.viewer.revealedTreasureCards[0]!.id,
      slot: 1,
      points: 6
    }
  ]);
  assert.deepEqual(projectedForOtherPlayer.viewer.revealedTreasureCards, []);
  assert.equal(
    projectedForOpener.state.treasureBoard.slots.find((slot) => slot.slot === 1)?.opened,
    true
  );
});
