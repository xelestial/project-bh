import { DomainError } from "./errors.ts";
import type {
  MatchState,
  PlayerId,
  Position,
  SpecialCardType,
  TileKind
} from "./model.ts";
import { cardinalLineDistance } from "./position.ts";
import type { ResolutionStep } from "./resolution.ts";

export interface BombResolutionPlanInput {
  readonly playerId: PlayerId;
  readonly cardType: Extract<SpecialCardType, "flameBomb" | "electricBomb">;
  readonly targetPosition: Position;
}

function isBombTargetInRange(from: Position, to: Position): boolean {
  const distance = cardinalLineDistance(from, to);

  return distance !== null && distance >= 1 && distance <= 3;
}

export function createBombResolutionPlan(
  match: MatchState,
  input: BombResolutionPlanInput
): readonly ResolutionStep[] {
  const player = match.players[input.playerId];

  if (!player) {
    throw new DomainError("NOT_ACTIVE_PLAYER", "Unknown player.");
  }

  if (!isBombTargetInRange(player.position, input.targetPosition)) {
    throw new DomainError(
      "INVALID_SPECIAL_CARD_TARGET",
      "Bomb cards require a target within 3 tiles in a straight line."
    );
  }

  const tileKind: TileKind = input.cardType === "flameBomb" ? "fire" : "electric";

  return [
    {
      kind: "setTile",
      position: input.targetPosition,
      tileKind,
      normalize: true
    },
    {
      kind: "applyTileEffectToOccupants",
      position: input.targetPosition,
      tileKind,
      actorPlayerId: input.playerId
    }
  ];
}
