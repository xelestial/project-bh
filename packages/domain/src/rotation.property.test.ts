import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  getRotationPositionMapping,
  getRotationSelectionPositions,
  isValidRotationSelection,
  isWithinBoard,
  positionKey,
  type Position,
  type Rectangle6RotationSelection,
  type RotationDirection,
  type RotationSelection
} from "./index.ts";
import {
  rotationDirectionArbitrary,
  rotationSelectionArbitrary
} from "../../testkit/src/index.ts";

function mapPosition(
  mapping: ReadonlyMap<string, Position>,
  position: Position
): Position {
  const mapped = mapping.get(positionKey(position));
  assert.ok(mapped, `Expected mapping for ${positionKey(position)}`);
  return mapped;
}

function oppositeDirection(direction: RotationDirection): RotationDirection {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}

function inverseSelection(selection: RotationSelection): RotationSelection {
  if (selection.kind !== "rectangle6") {
    return selection;
  }

  const inverseOrientation: Rectangle6RotationSelection["orientation"] =
    selection.orientation === "horizontal" ? "vertical" : "horizontal";

  return {
    ...selection,
    orientation: inverseOrientation
  };
}

test("rotation selections always produce a valid board-local bijection", () => {
  fc.assert(
    fc.property(rotationSelectionArbitrary, rotationDirectionArbitrary, (selection, direction) => {
      assert.equal(isValidRotationSelection(selection), true);

      const positions = getRotationSelectionPositions(selection);
      const mapping = getRotationPositionMapping(selection, direction);
      const sourceKeys = positions.map(positionKey);
      const destinationKeys = [...mapping.values()].map(positionKey);

      assert.equal(mapping.size, positions.length);
      assert.deepEqual(new Set(sourceKeys), new Set(mapping.keys()));
      assert.equal(new Set(destinationKeys).size, positions.length);

      for (const destination of mapping.values()) {
        assert.equal(isWithinBoard(destination), true);
      }
    }),
    { numRuns: 500 }
  );
});

test("clockwise and counterclockwise rotations are inverses", () => {
  fc.assert(
    fc.property(rotationSelectionArbitrary, rotationDirectionArbitrary, (selection, direction) => {
      const forward = getRotationPositionMapping(selection, direction);
      const backward = getRotationPositionMapping(
        inverseSelection(selection),
        oppositeDirection(direction)
      );

      for (const source of getRotationSelectionPositions(selection)) {
        const afterForward = mapPosition(forward, source);
        const afterBackward = mapPosition(backward, afterForward);

        assert.deepEqual(afterBackward, source);
      }
    }),
    { numRuns: 500 }
  );
});
