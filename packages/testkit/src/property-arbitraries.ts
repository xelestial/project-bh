import fc from "fast-check";

import {
  BOARD_SIZE,
  PRIORITY_CARD_VALUES,
  type Direction,
  type Position,
  type PriorityCard,
  type Rectangle6RotationSelection,
  type RotationDirection,
  type RotationSelection,
  type TileDefinition,
  type TileKind
} from "../../domain/src/index.ts";

export const boardCoordinateArbitrary = fc.integer({
  min: 0,
  max: BOARD_SIZE - 1
});

export const boardPositionArbitrary: fc.Arbitrary<Position> = fc.record({
  x: boardCoordinateArbitrary,
  y: boardCoordinateArbitrary
});

export const directionArbitrary: fc.Arbitrary<Direction> = fc.constantFrom(
  "north",
  "east",
  "south",
  "west"
);

export const rotationDirectionArbitrary: fc.Arbitrary<RotationDirection> =
  fc.constantFrom("clockwise", "counterclockwise");

export const square2RotationSelectionArbitrary: fc.Arbitrary<RotationSelection> =
  fc.record({
    kind: fc.constant("square2"),
    origin: fc.record({
      x: fc.integer({ min: 0, max: BOARD_SIZE - 2 }),
      y: fc.integer({ min: 0, max: BOARD_SIZE - 2 })
    })
  });

export const cross5RotationSelectionArbitrary: fc.Arbitrary<RotationSelection> =
  fc.record({
    kind: fc.constant("cross5"),
    center: fc.record({
      x: fc.integer({ min: 1, max: BOARD_SIZE - 2 }),
      y: fc.integer({ min: 1, max: BOARD_SIZE - 2 })
    })
  });

const rectangle6HorizontalArbitrary: fc.Arbitrary<Rectangle6RotationSelection> =
  fc.record({
    kind: fc.constant("rectangle6"),
    origin: fc.record({
      x: fc.integer({ min: 0, max: BOARD_SIZE - 3 }),
      y: fc.integer({ min: 0, max: BOARD_SIZE - 3 })
    }),
    orientation: fc.constant("horizontal")
  });

const rectangle6VerticalArbitrary: fc.Arbitrary<Rectangle6RotationSelection> =
  fc.record({
    kind: fc.constant("rectangle6"),
    origin: fc.record({
      x: fc.integer({ min: 0, max: BOARD_SIZE - 3 }),
      y: fc.integer({ min: 0, max: BOARD_SIZE - 3 })
    }),
    orientation: fc.constant("vertical")
  });

export const rectangle6RotationSelectionArbitrary: fc.Arbitrary<RotationSelection> =
  fc.oneof(rectangle6HorizontalArbitrary, rectangle6VerticalArbitrary);

export const rotationSelectionArbitrary: fc.Arbitrary<RotationSelection> = fc.oneof(
  square2RotationSelectionArbitrary,
  cross5RotationSelectionArbitrary,
  rectangle6RotationSelectionArbitrary
);

export const priorityCardArbitrary: fc.Arbitrary<PriorityCard> =
  fc.constantFrom(...PRIORITY_CARD_VALUES);

export const elementalTileKindArbitrary: fc.Arbitrary<Exclude<TileKind, "plain">> =
  fc.constantFrom("fire", "water", "electric", "ice");

export const tileDefinitionsArbitrary: fc.Arbitrary<readonly TileDefinition[]> =
  fc.uniqueArray(
    fc.record({
      position: boardPositionArbitrary,
      kind: elementalTileKindArbitrary
    }),
    {
      maxLength: 30,
      selector: (tile) => `${tile.position.x},${tile.position.y}`
    }
  );
