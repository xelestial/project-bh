import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  BOARD_SIZE,
  endTurn,
  moveActivePlayer,
  type Direction,
  type MatchState
} from "./index.ts";
import {
  createTwoPlayerMatchFixture,
  directionArbitrary
} from "../../testkit/src/index.ts";

type GeneratedCommand =
  | { readonly type: "move"; readonly direction: Direction }
  | { readonly type: "endTurn" };

const generatedCommandArbitrary: fc.Arbitrary<GeneratedCommand> = fc.oneof(
  directionArbitrary.map((direction) => ({
    type: "move" as const,
    direction
  })),
  fc.constant({ type: "endTurn" as const })
);

function applyIfLegal(match: MatchState, command: GeneratedCommand): MatchState {
  const activePlayerId = match.round.activePlayerId;

  if (!activePlayerId) {
    return match;
  }

  try {
    if (command.type === "move") {
      return moveActivePlayer(match, activePlayerId, command.direction).state;
    }

    return endTurn(match, activePlayerId).state;
  } catch {
    return match;
  }
}

function applySequence(commands: readonly GeneratedCommand[]): MatchState {
  return commands.reduce(
    (match, command) => applyIfLegal(match, command),
    createTwoPlayerMatchFixture({ treasures: [] })
  );
}

function assertGlobalInvariants(match: MatchState): void {
  for (const player of Object.values(match.players)) {
    assert.equal(Number.isInteger(player.position.x), true);
    assert.equal(Number.isInteger(player.position.y), true);
    assert.equal(player.position.x >= 0 && player.position.x < BOARD_SIZE, true);
    assert.equal(player.position.y >= 0 && player.position.y < BOARD_SIZE, true);
  }

  const carriedTreasureIds = Object.values(match.players)
    .map((player) => player.carriedTreasureId)
    .filter((treasureId): treasureId is string => treasureId !== null);

  assert.equal(new Set(carriedTreasureIds).size, carriedTreasureIds.length);

  for (const treasure of Object.values(match.treasures)) {
    const locationCount = [
      treasure.position !== null,
      treasure.carriedByPlayerId !== null,
      treasure.openedByPlayerId !== null,
      treasure.removedFromRound
    ].filter(Boolean).length;

    assert.equal(locationCount <= 1, true);
  }
}

test("generated legal command sequences are deterministic and preserve global invariants", () => {
  fc.assert(
    fc.property(
      fc.array(generatedCommandArbitrary, { minLength: 0, maxLength: 40 }),
      (commands) => {
        const first = applySequence(commands);
        const second = applySequence(commands);

        assert.deepEqual(second, first);
        assertGlobalInvariants(first);
      }
    ),
    { numRuns: 300 }
  );
});
