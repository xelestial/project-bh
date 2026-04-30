import type {
  Position,
  Rectangle6RotationSelection,
  RotationDirection,
  RotationSelection
} from "./model.ts";
import { isWithinBoard, positionKey } from "./position.ts";

function add(origin: Position, dx: number, dy: number): Position {
  return {
    x: origin.x + dx,
    y: origin.y + dy
  };
}

export function getRotationSelectionPositions(
  selection: RotationSelection
): readonly Position[] {
  switch (selection.kind) {
    case "square2":
      return [
        add(selection.origin, 0, 0),
        add(selection.origin, 1, 0),
        add(selection.origin, 0, 1),
        add(selection.origin, 1, 1)
      ];
    case "cross5":
      return [
        selection.center,
        add(selection.center, 0, -1),
        add(selection.center, 1, 0),
        add(selection.center, 0, 1),
        add(selection.center, -1, 0)
      ];
    case "rectangle6":
      return getRectanglePositions(selection);
  }
}

function getRectanglePositions(
  selection: Rectangle6RotationSelection
): readonly Position[] {
  const width = selection.orientation === "horizontal" ? 3 : 2;
  const height = selection.orientation === "horizontal" ? 2 : 3;
  const positions: Position[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      positions.push(add(selection.origin, x, y));
    }
  }

  return positions;
}

function rotateSquare2(
  selection: Extract<RotationSelection, { readonly kind: "square2" }>,
  direction: RotationDirection
): Map<string, Position> {
  const mapping = new Map<string, Position>();

  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const from = add(selection.origin, x, y);
      const rotated =
        direction === "clockwise"
          ? add(selection.origin, 1 - y, x)
          : add(selection.origin, y, 1 - x);
      mapping.set(positionKey(from), rotated);
    }
  }

  return mapping;
}

function rotateCross5(
  selection: Extract<RotationSelection, { readonly kind: "cross5" }>,
  direction: RotationDirection
): Map<string, Position> {
  const mapping = new Map<string, Position>();
  const center = selection.center;
  const north = add(center, 0, -1);
  const east = add(center, 1, 0);
  const south = add(center, 0, 1);
  const west = add(center, -1, 0);

  mapping.set(positionKey(center), center);

  if (direction === "clockwise") {
    mapping.set(positionKey(north), east);
    mapping.set(positionKey(east), south);
    mapping.set(positionKey(south), west);
    mapping.set(positionKey(west), north);
  } else {
    mapping.set(positionKey(north), west);
    mapping.set(positionKey(west), south);
    mapping.set(positionKey(south), east);
    mapping.set(positionKey(east), north);
  }

  return mapping;
}

function rotateRectangle6(
  selection: Rectangle6RotationSelection,
  direction: RotationDirection
): Map<string, Position> {
  const mapping = new Map<string, Position>();
  const width = selection.orientation === "horizontal" ? 3 : 2;
  const height = selection.orientation === "horizontal" ? 2 : 3;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = add(selection.origin, x, y);
      const rotated =
        direction === "clockwise"
          ? add(selection.origin, height - 1 - y, x)
          : add(selection.origin, y, width - 1 - x);
      mapping.set(positionKey(from), rotated);
    }
  }

  return mapping;
}

export function getRotationPositionMapping(
  selection: RotationSelection,
  direction: RotationDirection
): ReadonlyMap<string, Position> {
  switch (selection.kind) {
    case "square2":
      return rotateSquare2(selection, direction);
    case "cross5":
      return rotateCross5(selection, direction);
    case "rectangle6":
      return rotateRectangle6(selection, direction);
  }
}

export function isValidRotationSelection(selection: RotationSelection): boolean {
  const keys = new Set<string>();

  for (const position of getRotationSelectionPositions(selection)) {
    if (!isWithinBoard(position)) {
      return false;
    }

    const key = positionKey(position);

    if (keys.has(key)) {
      return false;
    }

    keys.add(key);
  }

  for (const direction of ["clockwise", "counterclockwise"] as const) {
    for (const destination of getRotationPositionMapping(selection, direction).values()) {
      if (!isWithinBoard(destination)) {
        return false;
      }
    }
  }

  return true;
}
