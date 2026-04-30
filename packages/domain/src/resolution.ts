import {
  findFenceAtPosition,
  getTileKind,
  normalizeBoardAfterMutation,
  removeFence,
  setTileKind
} from "./board.ts";
import { DomainError } from "./errors.ts";
import type { DomainEvent } from "./events.ts";
import type {
  MatchState,
  PlayerId,
  PlayerState,
  Position,
  TileKind,
  TreasureState
} from "./model.ts";
import {
  isSamePosition,
  isWithinBoard,
  manhattanDistance,
  movePosition,
  positionKey
} from "./position.ts";

const DROP_DIRECTION_PRIORITY = ["north", "east", "south", "west"] as const;

export type ResolutionStep =
  | { readonly kind: "damage"; readonly playerId: PlayerId; readonly amount: number }
  | { readonly kind: "dropCarriedTreasure"; readonly playerId: PlayerId; readonly position: Position }
  | { readonly kind: "applyTileEffect"; readonly playerId: PlayerId; readonly tileKind: TileKind; readonly ownTurn: boolean }
  | { readonly kind: "setEndsTurnImmediately"; readonly value: boolean }
  | { readonly kind: "removeFenceAt"; readonly position: Position }
  | { readonly kind: "setTile"; readonly position: Position; readonly tileKind: TileKind; readonly normalize: boolean }
  | {
      readonly kind: "applyTileEffectToOccupants";
      readonly position: Position;
      readonly tileKind: TileKind;
      readonly actorPlayerId: PlayerId;
    };

export interface ResolutionPolicies {
  readonly chooseTreasureDropPosition: (match: MatchState, player: PlayerState) => Position;
}

export interface RunResolutionPipelineInput {
  readonly match: MatchState;
  readonly actorPlayerId: PlayerId | null;
  readonly steps: readonly ResolutionStep[];
  readonly policies?: Partial<ResolutionPolicies>;
}

export interface ResolutionPipelineResult {
  readonly state: MatchState;
  readonly events: readonly DomainEvent[];
  readonly endsTurnImmediately: boolean;
}

interface MutableResolutionContext {
  match: MatchState;
  events: DomainEvent[];
  endsTurnImmediately: boolean;
  readonly actorPlayerId: PlayerId | null;
  readonly policies: ResolutionPolicies;
}

function getPlayerOrThrow(match: MatchState, playerId: PlayerId): PlayerState {
  const player = match.players[playerId];

  if (!player) {
    throw new DomainError("NOT_ACTIVE_PLAYER", "Unknown player.");
  }

  return player;
}

function updatePlayer(match: MatchState, player: PlayerState): MatchState {
  return {
    ...match,
    players: {
      ...match.players,
      [player.id]: player
    }
  };
}

function updateTreasure(match: MatchState, treasure: TreasureState): MatchState {
  return {
    ...match,
    treasures: {
      ...match.treasures,
      [treasure.id]: treasure
    }
  };
}

function updateBoard(match: MatchState, board: MatchState["board"]): MatchState {
  return {
    ...match,
    board
  };
}

function createStatusChangedEvent(player: PlayerState): DomainEvent {
  return {
    type: "playerStatusChanged",
    playerId: player.id,
    fire: player.status.fire,
    water: player.status.water,
    skipNextTurnCount: player.status.skipNextTurnCount,
    movementLimit: player.status.movementLimit
  };
}

function chooseDefaultTreasureDropPosition(_match: MatchState, player: PlayerState): Position {
  return DROP_DIRECTION_PRIORITY.map((direction) => movePosition(player.position, direction))
    .filter(isWithinBoard)
    .sort((left, right) => {
      return manhattanDistance(right, player.startPosition) - manhattanDistance(left, player.startPosition);
    })[0] ?? player.position;
}

function collectTileChangeEvents(
  before: MatchState["board"],
  after: MatchState["board"],
  positions: readonly Position[]
): readonly DomainEvent[] {
  const uniquePositions = new Map<string, Position>();

  for (const position of positions) {
    if (isWithinBoard(position)) {
      uniquePositions.set(positionKey(position), position);
    }
  }

  return [...uniquePositions.values()]
    .map((position): DomainEvent | null => {
      const from = getTileKind(before, position);
      const to = getTileKind(after, position);

      if (from === to) {
        return null;
      }

      return {
        type: "tileChanged",
        position,
        from,
        to
      };
    })
    .filter((event) => event !== null);
}

function dropCarriedTreasureAt(
  match: MatchState,
  player: PlayerState,
  position: Position
): { readonly state: MatchState; readonly events: readonly DomainEvent[] } {
  if (player.carriedTreasureId === null) {
    return {
      state: match,
      events: []
    };
  }

  const treasure = match.treasures[player.carriedTreasureId];

  if (!treasure) {
    throw new DomainError("TREASURE_NOT_FOUND", "Unknown treasure.");
  }

  let nextMatch = updatePlayer(match, {
    ...player,
    carriedTreasureId: null
  });
  const events: DomainEvent[] = [];
  const occupyingPlayer = Object.values(nextMatch.players).find((candidate) => {
    return !candidate.eliminated && candidate.id !== player.id && isSamePosition(candidate.position, position);
  });

  if (occupyingPlayer) {
    nextMatch = updatePlayer(nextMatch, {
      ...occupyingPlayer,
      carriedTreasureId: treasure.id
    });
    nextMatch = updateTreasure(nextMatch, {
      ...treasure,
      position: null,
      carriedByPlayerId: occupyingPlayer.id
    });
    events.push({
      type: "treasureDropped",
      playerId: player.id,
      treasureId: treasure.id,
      position
    });
    events.push({
      type: "treasurePickedUp",
      playerId: occupyingPlayer.id,
      treasureId: treasure.id,
      position
    });
  } else {
    nextMatch = updateTreasure(nextMatch, {
      ...treasure,
      position,
      carriedByPlayerId: null
    });
    events.push({
      type: "treasureDropped",
      playerId: player.id,
      treasureId: treasure.id,
      position
    });
  }

  return {
    state: nextMatch,
    events
  };
}

function applyDamageStep(context: MutableResolutionContext, playerId: PlayerId, amount: number): void {
  const player = getPlayerOrThrow(context.match, playerId);
  const nextHitPoints = Math.max(0, player.hitPoints - amount);
  let nextPlayer: PlayerState = {
    ...player,
    hitPoints: nextHitPoints
  };

  context.match = updatePlayer(context.match, nextPlayer);
  context.events.push({
    type: "playerDamaged",
    playerId,
    amount,
    remainingHitPoints: nextHitPoints
  });

  if (nextHitPoints !== 0 || player.eliminated) {
    return;
  }

  nextPlayer = {
    ...nextPlayer,
    eliminated: true
  };
  context.match = updatePlayer(context.match, nextPlayer);
  context.events.push({
    type: "playerEliminated",
    playerId,
    position: player.position
  });

  const dropped = dropCarriedTreasureAt(context.match, nextPlayer, player.position);
  context.match = dropped.state;
  context.events.push(...dropped.events);
}

function applyTileEffectStep(
  context: MutableResolutionContext,
  playerId: PlayerId,
  tileKind: TileKind,
  ownTurn: boolean
): void {
  if (tileKind === "plain" || tileKind === "river") {
    return;
  }

  let player = getPlayerOrThrow(context.match, playerId);

  if (tileKind === "fire" || tileKind === "giantFlame") {
    const updatedPlayer: PlayerState = {
      ...player,
      status: {
        ...player.status,
        fire: true
      }
    };
    context.match = updatePlayer(context.match, updatedPlayer);
    context.events.push(createStatusChangedEvent(updatedPlayer));
    return;
  }

  if (tileKind === "water") {
    const updatedPlayer: PlayerState = {
      ...player,
      status: {
        ...player.status,
        fire: false,
        water: true
      }
    };
    context.match = updatePlayer(context.match, updatedPlayer);
    context.events.push(createStatusChangedEvent(updatedPlayer));
    return;
  }

  if (tileKind === "electric") {
    applyDamageStep(context, playerId, 3);
    player = getPlayerOrThrow(context.match, playerId);

    if (player.status.water) {
      const updatedPlayer: PlayerState = {
        ...player,
        status: {
          ...player.status,
          skipNextTurnCount: player.status.skipNextTurnCount + 1
        }
      };
      context.match = updatePlayer(context.match, updatedPlayer);
      context.events.push(createStatusChangedEvent(updatedPlayer));
      context.endsTurnImmediately = context.endsTurnImmediately || ownTurn;
    }
    return;
  }

  if (tileKind === "ice" && player.carriedTreasureId !== null) {
    const dropped = dropCarriedTreasureAt(
      context.match,
      player,
      context.policies.chooseTreasureDropPosition(context.match, player)
    );
    context.match = dropped.state;
    context.events.push(...dropped.events);
  }
}

function applyResolutionStep(context: MutableResolutionContext, step: ResolutionStep): void {
  switch (step.kind) {
    case "damage":
      applyDamageStep(context, step.playerId, step.amount);
      return;
    case "dropCarriedTreasure": {
      const player = getPlayerOrThrow(context.match, step.playerId);
      const dropped = dropCarriedTreasureAt(context.match, player, step.position);
      context.match = dropped.state;
      context.events.push(...dropped.events);
      return;
    }
    case "applyTileEffect":
      applyTileEffectStep(context, step.playerId, step.tileKind, step.ownTurn);
      return;
    case "setEndsTurnImmediately":
      context.endsTurnImmediately = step.value;
      return;
    case "removeFenceAt": {
      const fence = findFenceAtPosition(context.match.board, step.position);

      if (!fence) {
        return;
      }

      context.match = updateBoard(context.match, removeFence(context.match.board, fence.id));
      context.events.push({
        type: "fenceRemoved",
        fenceId: fence.id
      });
      return;
    }
    case "setTile": {
      const beforeBoard = context.match.board;
      const mutatedBoard = setTileKind(beforeBoard, step.position, step.tileKind);
      const normalized = step.normalize
        ? normalizeBoardAfterMutation(mutatedBoard, [step.position])
        : { board: mutatedBoard, changes: [] };

      context.match = updateBoard(context.match, normalized.board);
      context.events.push(
        ...collectTileChangeEvents(beforeBoard, context.match.board, [
          step.position,
          ...normalized.changes.map((change) => change.position)
        ])
      );
      return;
    }
    case "applyTileEffectToOccupants": {
      const impactedPlayers = Object.values(context.match.players).filter((candidate) => {
        return !candidate.eliminated && isSamePosition(candidate.position, step.position);
      });

      for (const impactedPlayer of impactedPlayers) {
        applyTileEffectStep(
          context,
          impactedPlayer.id,
          step.tileKind,
          impactedPlayer.id === step.actorPlayerId
        );
      }
      return;
    }
  }
}

export function runResolutionPipeline(input: RunResolutionPipelineInput): ResolutionPipelineResult {
  const context: MutableResolutionContext = {
    match: input.match,
    events: [],
    endsTurnImmediately: false,
    actorPlayerId: input.actorPlayerId,
    policies: {
      chooseTreasureDropPosition: input.policies?.chooseTreasureDropPosition ?? chooseDefaultTreasureDropPosition
    }
  };

  for (const step of input.steps) {
    applyResolutionStep(context, step);
  }

  return {
    state: context.match,
    events: context.events,
    endsTurnImmediately: context.endsTurnImmediately
  };
}

export function createTileEffectResolutionStep(
  match: MatchState,
  playerId: PlayerId,
  ownTurn: boolean
): ResolutionStep {
  return {
    kind: "applyTileEffect",
    playerId,
    tileKind: getTileKind(match.board, getPlayerOrThrow(match, playerId).position),
    ownTurn
  };
}
