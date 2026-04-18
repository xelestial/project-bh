import type {
  BoardState,
  FenceState,
  Position,
  TileKind,
  TileState
} from "./model.ts";
import { adjacentPositions, isWithinBoard, positionKey } from "./position.ts";

export interface BoardTileChange {
  readonly position: Position;
  readonly from: TileKind;
  readonly to: TileKind;
}

const FIRE_CLUSTER_KINDS: readonly TileKind[] = ["fire", "giantFlame"];
const WATER_CLUSTER_KINDS: readonly TileKind[] = ["water", "river"];

function parsePositionKey(key: string): Position {
  const parts = key.split(",");
  const x = Number.parseInt(parts[0] ?? "", 10);
  const y = Number.parseInt(parts[1] ?? "", 10);

  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error(`Invalid board position key: ${key}`);
  }

  return { x, y };
}

export function getTileKind(board: BoardState, position: Position): TileKind {
  return board.tiles[positionKey(position)]?.kind ?? "plain";
}

export function setTileKind(
  board: BoardState,
  position: Position,
  kind: TileKind
): BoardState {
  if (!isWithinBoard(position)) {
    return board;
  }

  const key = positionKey(position);
  const nextTiles: Record<string, TileState> = {
    ...board.tiles
  };

  if (kind === "plain") {
    delete nextTiles[key];
  } else {
    nextTiles[key] = { kind };
  }

  return {
    ...board,
    tiles: nextTiles
  };
}

export function isFenceBlockingPosition(board: BoardState, position: Position): boolean {
  return Object.values(board.fences).some((fence) => {
    return fence.positions.some((candidate) => positionKey(candidate) === positionKey(position));
  });
}

export function upsertFence(board: BoardState, fence: FenceState): BoardState {
  return {
    ...board,
    fences: {
      ...board.fences,
      [fence.id]: fence
    }
  };
}

export function removeFence(board: BoardState, fenceId: string): BoardState {
  const nextFences: Record<string, FenceState> = {
    ...board.fences
  };
  delete nextFences[fenceId];

  return {
    ...board,
    fences: nextFences
  };
}

export function findFenceAtPosition(
  board: BoardState,
  position: Position
): FenceState | undefined {
  return Object.values(board.fences).find((fence) => {
    return fence.positions.some((candidate) => positionKey(candidate) === positionKey(position));
  });
}

function collectConnectedComponent(
  board: BoardState,
  start: Position,
  allowedKinds: readonly TileKind[]
): readonly Position[] {
  const startKind = getTileKind(board, start);

  if (!allowedKinds.includes(startKind)) {
    return [];
  }

  const queue: Position[] = [start];
  const visited = new Set<string>();
  const component: Position[] = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const key = positionKey(current);

    if (visited.has(key)) {
      continue;
    }

    visited.add(key);

    if (!allowedKinds.includes(getTileKind(board, current))) {
      continue;
    }

    component.push(current);

    for (const neighbor of adjacentPositions(current)) {
      if (!visited.has(positionKey(neighbor))) {
        queue.push(neighbor);
      }
    }
  }

  return component;
}

function normalizeCluster(
  board: BoardState,
  seeds: readonly Position[],
  clusterKinds: readonly TileKind[],
  promotedKind: TileKind,
  baseKind: TileKind
): { readonly board: BoardState; readonly changes: readonly BoardTileChange[] } {
  let nextBoard = board;
  const changes: BoardTileChange[] = [];
  const visited = new Set<string>();

  for (const seed of seeds) {
    const seedKey = positionKey(seed);

    if (visited.has(seedKey)) {
      continue;
    }

    const component = collectConnectedComponent(nextBoard, seed, clusterKinds);

    for (const position of component) {
      visited.add(positionKey(position));
    }

    if (component.length === 0) {
      continue;
    }

    const desiredKind = component.length >= 3 ? promotedKind : baseKind;

    for (const position of component) {
      const currentKind = getTileKind(nextBoard, position);

      if (currentKind === desiredKind) {
        continue;
      }

      changes.push({
        position,
        from: currentKind,
        to: desiredKind
      });
      nextBoard = setTileKind(nextBoard, position, desiredKind);
    }
  }

  return {
    board: nextBoard,
    changes
  };
}

export function normalizeBoardAfterMutation(
  board: BoardState,
  positions: readonly Position[]
): { readonly board: BoardState; readonly changes: readonly BoardTileChange[] } {
  const relevant = new Map<string, Position>();

  for (const position of positions) {
    if (!isWithinBoard(position)) {
      continue;
    }

    relevant.set(positionKey(position), position);

    for (const neighbor of adjacentPositions(position)) {
      relevant.set(positionKey(neighbor), neighbor);
    }
  }

  for (const key of Object.keys(board.tiles)) {
    const position = parsePositionKey(key);

    if (relevant.has(key)) {
      continue;
    }

    const kind = getTileKind(board, position);

    if (FIRE_CLUSTER_KINDS.includes(kind) || WATER_CLUSTER_KINDS.includes(kind)) {
      for (const neighbor of adjacentPositions(position)) {
        if (relevant.has(positionKey(neighbor))) {
          relevant.set(key, position);
          break;
        }
      }
    }
  }

  const relevantPositions = [...relevant.values()];
  const fireNormalized = normalizeCluster(
    board,
    relevantPositions,
    FIRE_CLUSTER_KINDS,
    "giantFlame",
    "fire"
  );
  const waterNormalized = normalizeCluster(
    fireNormalized.board,
    relevantPositions,
    WATER_CLUSTER_KINDS,
    "river",
    "water"
  );

  return {
    board: waterNormalized.board,
    changes: [...fireNormalized.changes, ...waterNormalized.changes]
  };
}
