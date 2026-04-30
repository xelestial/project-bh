import assert from "node:assert/strict";
import test from "node:test";

import { createPosition, moveActivePlayer } from "../../domain/src/index.ts";
import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";
import { queryCellActions } from "./query-cell-actions.ts";

function hasMoveAction(actions: ReturnType<typeof queryCellActions>): boolean {
  return actions.some((action) => action.command?.type === "match.movePlayer");
}

test("cell action query uses one tile for the mandatory step and two tiles for secondary movement", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });

  assert.equal(hasMoveAction(queryCellActions(match, "player-1", createPosition(1, 0))), true);
  assert.equal(hasMoveAction(queryCellActions(match, "player-1", createPosition(2, 0))), false);

  const stepped = moveActivePlayer(match, "player-1", "south").state;

  assert.equal(hasMoveAction(queryCellActions(stepped, "player-1", createPosition(1, 1))), false);
  assert.equal(hasMoveAction(queryCellActions(stepped, "player-1", createPosition(2, 1))), true);
});
