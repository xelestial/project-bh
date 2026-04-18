import assert from "node:assert/strict";
import test from "node:test";

import { moveActivePlayer } from "../../domain/src/index.ts";
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
  assert.equal(result.availableSecondaryActions.move, false);
});

test("turn affordances expose secondary options after the first move", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;

  const result = queryTurnAffordances(stepped, "player-1");

  assert.equal(result.active, true);
  assert.equal(result.stage, "secondaryAction");
  assert.equal(result.availableSecondaryActions.move, true);
  assert.equal(result.availableSecondaryActions.rotateTiles, true);
  assert.equal(result.availableSecondaryActions.endTurn, true);
  assert.deepEqual(result.secondaryMoveTargets, [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 2 }
  ]);
});
