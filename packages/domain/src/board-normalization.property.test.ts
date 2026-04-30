import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  BOARD_SIZE,
  getTileKind,
  normalizeBoardAfterMutation,
  positionKey,
  type BoardState,
  type Position,
  type TileKind
} from "./index.ts";
import { tileDefinitionsArbitrary } from "../../testkit/src/index.ts";

function buildBoard(
  tiles: readonly {
    readonly position: Position;
    readonly kind: Exclude<TileKind, "plain">;
  }[]
): BoardState {
  return {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    tiles: Object.fromEntries(
      tiles.map((tile) => [positionKey(tile.position), { kind: tile.kind }])
    ),
    fences: {}
  };
}

function tileEntries(board: BoardState): readonly (readonly [string, TileKind])[] {
  return Object.entries(board.tiles)
    .map(([key, tile]) => [key, tile.kind] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

test("normalizing a generated board is idempotent", () => {
  fc.assert(
    fc.property(tileDefinitionsArbitrary, (tiles) => {
      const board = buildBoard(tiles);
      const seeds = tiles.map((tile) => tile.position);
      const first = normalizeBoardAfterMutation(board, seeds).board;
      const second = normalizeBoardAfterMutation(first, seeds).board;

      assert.deepEqual(tileEntries(second), tileEntries(first));
    }),
    { numRuns: 500 }
  );
});

test("normalization never creates non-plain tiles outside generated tile positions", () => {
  fc.assert(
    fc.property(tileDefinitionsArbitrary, (tiles) => {
      const board = buildBoard(tiles);
      const seeds = tiles.map((tile) => tile.position);
      const normalized = normalizeBoardAfterMutation(board, seeds).board;
      const generatedKeys = new Set(tiles.map((tile) => positionKey(tile.position)));

      for (const key of Object.keys(normalized.tiles)) {
        assert.equal(generatedKeys.has(key), true);
      }

      for (const tile of tiles) {
        assert.notEqual(getTileKind(normalized, tile.position), "plain");
      }
    }),
    { numRuns: 500 }
  );
});
