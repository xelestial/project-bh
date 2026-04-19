import {
  getRotationPositionMapping,
  getTileKind,
  positionKey,
  rotateTiles,
  type MatchState,
  type PlayerId,
  type Position,
  type RotationDirection,
  type RotationSelection
} from "../../domain/src/index.ts";

const ROTATION_DIRECTIONS: readonly RotationDirection[] = ["clockwise", "counterclockwise"];

// Closed treasure boxes are intentionally anonymous once placed on the board.
// Rotating them can still matter because players may lose track of which box
// originally matched their private treasure card.
function hasMeaningfulRotationOutcome(
  match: MatchState,
  selection: RotationSelection,
  direction: RotationDirection
): boolean {
  const mapping = getRotationPositionMapping(selection, direction);

  for (const [fromKey, toPosition] of mapping.entries()) {
    const [x, y] = fromKey.split(",").map(Number);

    if (x === undefined || y === undefined) {
      continue;
    }

    const fromPosition: Position = { x, y };

    if (getTileKind(match.board, fromPosition) !== getTileKind(match.board, toPosition)) {
      return true;
    }
  }

  for (const treasure of Object.values(match.treasures)) {
    if (!treasure.position || treasure.removedFromRound) {
      continue;
    }

    const mappedPosition = mapping.get(positionKey(treasure.position));

    if (
      mappedPosition &&
      (mappedPosition.x !== treasure.position.x || mappedPosition.y !== treasure.position.y)
    ) {
      return true;
    }
  }

  return false;
}

export function listLegalNormalRotationDirections(
  match: MatchState,
  playerId: PlayerId,
  origin: Position
): readonly RotationDirection[] {
  const selection: RotationSelection = {
    kind: "square2",
    origin
  };

  return ROTATION_DIRECTIONS.filter((direction) => {
    if (!hasMeaningfulRotationOutcome(match, selection, direction)) {
      return false;
    }

    try {
      rotateTiles(match, {
        playerId,
        selection,
        direction
      });
      return true;
    } catch {
      return false;
    }
  });
}

export function listLegalNormalRotationOrigins(
  match: MatchState,
  playerId: PlayerId
): readonly Position[] {
  const positions: Position[] = [];

  for (let y = 0; y < match.board.height; y += 1) {
    for (let x = 0; x < match.board.width; x += 1) {
      const origin = { x, y };

      if (listLegalNormalRotationDirections(match, playerId, origin).length > 0) {
        positions.push(origin);
      }
    }
  }

  return positions;
}
