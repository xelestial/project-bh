import assert from "node:assert/strict";
import test from "node:test";

import { createPosition, moveActivePlayer } from "../../domain/src/index.ts";
import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";
import { queryTurnAffordances } from "./query-turn-affordances.ts";

test("turn affordances expose mandatory move targets at turn start", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });

  const result = queryTurnAffordances(match, "player-1");

  assert.equal(result.active, true);
  assert.equal(result.stage, "mandatoryStep");
  assert.deepEqual(result.mandatoryMoveTargets, [
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ]);
  assert.deepEqual(result.rotationOrigins, []);
  assert.equal(result.availableSecondaryActions.move, false);
});

test("turn affordances expose open treasure at turn start when carrying at the start tile", () => {
  const match = createTwoPlayerMatchFixture();
  const playerOne = match.players["player-1"];
  const playerTwo = match.players["player-2"];

  assert.ok(playerOne);
  assert.ok(playerTwo);

  const prepared = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...playerOne,
        carriedTreasureId: "treasure-1"
      },
      "player-2": {
        ...playerTwo,
        position: createPosition(19, 1)
      }
    }
  };

  const result = queryTurnAffordances(prepared, "player-1");

  assert.equal(result.stage, "mandatoryStep");
  assert.equal(result.availableSecondaryActions.openTreasure, true);
});

test("turn affordances hide no-op normal rotations after the first move", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;

  const result = queryTurnAffordances(stepped, "player-1");

  assert.equal(result.active, true);
  assert.equal(result.stage, "secondaryAction");
  assert.equal(result.availableSecondaryActions.move, true);
  assert.equal(result.availableSecondaryActions.rotateTiles, false);
  assert.equal(result.availableSecondaryActions.endTurn, true);
  assert.deepEqual(result.rotationOrigins, []);
  assert.deepEqual(result.secondaryMoveTargets, [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 2 }
  ]);
});

test("turn affordances expose visible rotation origins when a square would actually change", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [
      { position: createPosition(2, 1), kind: "fire" },
      { position: createPosition(3, 2), kind: "electric" }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;

  const result = queryTurnAffordances(stepped, "player-1");

  assert.equal(result.active, true);
  assert.equal(result.stage, "secondaryAction");
  assert.equal(result.availableSecondaryActions.rotateTiles, true);
  assert.ok(result.rotationOrigins.length > 0);
  assert.ok(result.rotationOrigins.some((origin) => origin.x === 2 && origin.y === 1));
});

test("turn affordances keep treasure-moving rotations even when tile kinds match", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [
      {
        id: "treasure-1",
        slot: 1,
        points: 3,
        ownerPlayerId: "player-1",
        position: createPosition(2, 1)
      }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;

  const result = queryTurnAffordances(stepped, "player-1");

  assert.equal(result.availableSecondaryActions.rotateTiles, true);
  assert.ok(result.rotationOrigins.some((origin) => origin.x === 2 && origin.y === 1));
});

test("turn affordances expose owned charged special cards", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const playerOne = stepped.players["player-1"];

  assert.ok(playerOne);

  const prepared = {
    ...stepped,
    players: {
      ...stepped.players,
      "player-1": {
        ...playerOne,
        specialInventory: {
          ...playerOne.specialInventory,
          jump: 1
        }
      }
    }
  };

  const result = queryTurnAffordances(prepared, "player-1");

  assert.equal(result.availableSecondaryActions.specialCard, true);
  assert.equal(result.availableSpecialCards.jump, true);
  assert.equal(result.availableSpecialCards.recoveryPotion, false);
});
