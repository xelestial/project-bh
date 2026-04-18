import { BOARD_SIZE, type Direction, type Position } from "./model.ts";

const DIRECTION_VECTORS: Readonly<Record<Direction, Position>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 }
};

export function createPosition(x: number, y: number): Position {
  return { x, y };
}

export function isWithinBoard(position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < BOARD_SIZE &&
    position.y >= 0 &&
    position.y < BOARD_SIZE
  );
}

export function movePosition(position: Position, direction: Direction): Position {
  const vector = DIRECTION_VECTORS[direction];

  return {
    x: position.x + vector.x,
    y: position.y + vector.y
  };
}

export function isSamePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

export function manhattanDistance(left: Position, right: Position): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function areOrthogonallyAdjacent(left: Position, right: Position): boolean {
  return manhattanDistance(left, right) === 1;
}

export function cardinalDirectionBetween(
  from: Position,
  to: Position
): Direction | null {
  if (from.x === to.x) {
    if (from.y < to.y) {
      return "south";
    }

    if (from.y > to.y) {
      return "north";
    }
  }

  if (from.y === to.y) {
    if (from.x < to.x) {
      return "east";
    }

    if (from.x > to.x) {
      return "west";
    }
  }

  return null;
}

export function cardinalLineDistance(from: Position, to: Position): number | null {
  if (from.x === to.x) {
    return Math.abs(from.y - to.y);
  }

  if (from.y === to.y) {
    return Math.abs(from.x - to.x);
  }

  return null;
}

export function adjacentPositions(position: Position): readonly Position[] {
  return Object.values(DIRECTION_VECTORS)
    .map((vector) => ({
      x: position.x + vector.x,
      y: position.y + vector.y
    }))
    .filter(isWithinBoard);
}

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}
