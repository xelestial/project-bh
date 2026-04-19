import {
  type FencePositions,
  SPECIAL_CARD_TYPES,
  type AuctionBidState,
  type Direction,
  type Position,
  type PriorityCard,
  type RotationDirection,
  type RotationSelection,
  type SpecialCardType
} from "../../domain/src/index.ts";
import type {
  EndTurnCommand,
  MatchCommand,
  MovePlayerCommand,
  OpenTreasureCommand,
  PlaceTreasureCommand,
  PurchaseSpecialCardCommand,
  PrepareNextRoundCommand,
  RotateTilesCommand,
  SubmitAuctionBidsCommand,
  SubmitPriorityCommand,
  ThrowTileCommand,
  UseSpecialCardCommand
} from "../../application/src/index.ts";

const COMMAND_VERSION = 1;
const DIRECTIONS: readonly Direction[] = ["north", "east", "south", "west"];
const PRIORITY_CARDS: readonly PriorityCard[] = [1, 2, 3, 4, 5, 6];
const ROTATION_DIRECTIONS: readonly RotationDirection[] = [
  "clockwise",
  "counterclockwise"
];
const SPECIAL_CARDS: readonly SpecialCardType[] = SPECIAL_CARD_TYPES;

export interface ValidationFailure {
  readonly ok: false;
  readonly message: string;
}

export interface ValidationSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

export type ValidationResult<TValue> = ValidationFailure | ValidationSuccess<TValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isVersion(value: unknown): value is 1 {
  return value === COMMAND_VERSION;
}

function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && DIRECTIONS.includes(value as Direction);
}

function isPriorityCard(value: unknown): value is PriorityCard {
  return typeof value === "number" && PRIORITY_CARDS.includes(value as PriorityCard);
}

function isRotationDirection(value: unknown): value is RotationDirection {
  return (
    typeof value === "string" &&
    ROTATION_DIRECTIONS.includes(value as RotationDirection)
  );
}

function isSpecialCardType(value: unknown): value is SpecialCardType {
  return typeof value === "string" && SPECIAL_CARDS.includes(value as SpecialCardType);
}

function validatePosition(value: unknown): ValidationResult<Position> {
  if (!isRecord(value)) {
    return { ok: false, message: "Position must be an object." };
  }

  if (typeof value.x !== "number" || typeof value.y !== "number") {
    return { ok: false, message: "Position requires numeric x and y values." };
  }

  return {
    ok: true,
    value: {
      x: value.x,
      y: value.y
    }
  };
}

function validateAuctionBids(value: unknown): ValidationResult<readonly AuctionBidState[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Auction bids must be an array." };
  }

  const bids: AuctionBidState[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      return { ok: false, message: "Auction bids must be objects." };
    }

    if (
      typeof entry.offerSlot !== "number" ||
      typeof entry.amount !== "number" ||
      !Number.isInteger(entry.offerSlot) ||
      !Number.isInteger(entry.amount)
    ) {
      return {
        ok: false,
        message: "Auction bids require integer offerSlot and amount values."
      };
    }

    bids.push({
      offerSlot: entry.offerSlot,
      amount: entry.amount
    });
  }

  return {
    ok: true,
    value: bids
  };
}

function validateRotationSelection(value: unknown): ValidationResult<RotationSelection> {
  if (!isRecord(value) || !isString(value.kind)) {
    return { ok: false, message: "Rotation selection must include a kind." };
  }

  switch (value.kind) {
    case "square2": {
      const origin = validatePosition(value.origin);

      if (!origin.ok) {
        return origin;
      }

      return {
        ok: true,
        value: {
          kind: "square2",
          origin: origin.value
        }
      };
    }
    case "cross5": {
      const center = validatePosition(value.center);

      if (!center.ok) {
        return center;
      }

      return {
        ok: true,
        value: {
          kind: "cross5",
          center: center.value
        }
      };
    }
    case "rectangle6": {
      const origin = validatePosition(value.origin);

      if (!origin.ok) {
        return origin;
      }

      if (value.orientation !== "horizontal" && value.orientation !== "vertical") {
        return {
          ok: false,
          message: "rectangle6 selections require a horizontal or vertical orientation."
        };
      }

      return {
        ok: true,
        value: {
          kind: "rectangle6",
          origin: origin.value,
          orientation: value.orientation
        }
      };
    }
    default:
      return {
        ok: false,
        message: `Unknown rotation selection kind: ${String(value.kind)}.`
      };
  }
}

function validateFencePositions(
  value: unknown
): ValidationResult<FencePositions> {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    return { ok: false, message: "Fence positions must be a two-item or three-item array." };
  }

  const positions: Position[] = [];

  for (const entry of value) {
    const position = validatePosition(entry);

    if (!position.ok) {
      return position;
    }

    positions.push(position.value);
  }

  return {
    ok: true,
    value:
      positions.length === 2
        ? [positions[0]!, positions[1]!]
        : [positions[0]!, positions[1]!, positions[2]!]
  };
}

function validateTreasurePlacements(
  value: unknown
): ValidationResult<PrepareNextRoundCommand["treasurePlacements"]> {
  if (value === undefined) {
    return {
      ok: true,
      value: undefined
    };
  }

  if (!isRecord(value)) {
    return { ok: false, message: "treasurePlacements must be an object." };
  }

  const placements: Record<string, Position> = {};

  for (const [key, positionValue] of Object.entries(value)) {
    const position = validatePosition(positionValue);

    if (!position.ok) {
      return position;
    }

    placements[key] = position.value;
  }

  return {
    ok: true,
    value: placements
  };
}

function validateCommandEnvelope(
  value: unknown
): ValidationResult<{
  readonly type: string;
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: string;
}> {
  if (!isRecord(value)) {
    return { ok: false, message: "Command payload must be an object." };
  }

  if (!isString(value.type)) {
    return { ok: false, message: "Command type must be a non-empty string." };
  }

  if (!isVersion(value.version)) {
    return { ok: false, message: "Unsupported command version." };
  }

  if (!isString(value.matchId)) {
    return { ok: false, message: "matchId must be a non-empty string." };
  }

  if (!isString(value.playerId)) {
    return { ok: false, message: "playerId must be a non-empty string." };
  }

  return {
    ok: true,
    value: {
      type: value.type,
      version: value.version,
      matchId: value.matchId,
      playerId: value.playerId
    }
  };
}

function validateSubmitAuctionBidsCommand(
  value: unknown
): ValidationResult<SubmitAuctionBidsCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.submitAuctionBids") {
    return { ok: false, message: "Expected a match.submitAuctionBids command." };
  }

  if (!isRecord(value)) {
    return { ok: false, message: "Auction commands must be objects." };
  }

  const bids = validateAuctionBids(value.bids);

  if (!bids.ok) {
    return bids;
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.submitAuctionBids",
      bids: bids.value
    }
  };
}

function validateSubmitPriorityCommand(
  value: unknown
): ValidationResult<SubmitPriorityCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.submitPriority") {
    return { ok: false, message: "Expected a match.submitPriority command." };
  }

  if (!isRecord(value) || !isPriorityCard(value.priorityCard)) {
    return { ok: false, message: "priorityCard must be a value from 1 to 6." };
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.submitPriority",
      priorityCard: value.priorityCard
    }
  };
}

function validateMovePlayerCommand(
  value: unknown
): ValidationResult<MovePlayerCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.movePlayer") {
    return { ok: false, message: "Expected a match.movePlayer command." };
  }

  if (!isRecord(value) || !isDirection(value.direction)) {
    return { ok: false, message: "direction must be a valid cardinal value." };
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.movePlayer",
      direction: value.direction
    }
  };
}

function validatePlaceTreasureCommand(
  value: unknown
): ValidationResult<PlaceTreasureCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.placeTreasure") {
    return { ok: false, message: "Expected a match.placeTreasure command." };
  }

  if (!isRecord(value) || !isString(value.treasureId)) {
    return { ok: false, message: "treasureId must be a non-empty string." };
  }

  const position = validatePosition(value.position);

  if (!position.ok) {
    return position;
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.placeTreasure",
      treasureId: value.treasureId,
      position: position.value
    }
  };
}

function validateThrowTileCommand(
  value: unknown
): ValidationResult<ThrowTileCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.throwTile") {
    return { ok: false, message: "Expected a match.throwTile command." };
  }

  if (!isRecord(value)) {
    return { ok: false, message: "Throw commands must be objects." };
  }

  const source = validatePosition(value.source);
  const target = validatePosition(value.target);

  if (!source.ok) {
    return source;
  }

  if (!target.ok) {
    return target;
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.throwTile",
      source: source.value,
      target: target.value
    }
  };
}

function validateRotateTilesCommand(
  value: unknown
): ValidationResult<RotateTilesCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.rotateTiles") {
    return { ok: false, message: "Expected a match.rotateTiles command." };
  }

  if (!isRecord(value) || !isRotationDirection(value.direction)) {
    return {
      ok: false,
      message: "direction must be clockwise or counterclockwise for rotations."
    };
  }

  const selection = validateRotationSelection(value.selection);

  if (!selection.ok) {
    return selection;
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.rotateTiles",
      selection: selection.value,
      direction: value.direction
    }
  };
}

function validateUseSpecialCardCommand(
  value: unknown
): ValidationResult<UseSpecialCardCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.useSpecialCard") {
    return { ok: false, message: "Expected a match.useSpecialCard command." };
  }

  if (!isRecord(value) || !isSpecialCardType(value.cardType)) {
    return { ok: false, message: "cardType must be a valid special card name." };
  }

  const base: {
    type: "match.useSpecialCard";
    version: 1;
    matchId: string;
    playerId: string;
    cardType: SpecialCardType;
    targetPosition?: Position;
    targetPlayerId?: string;
    fencePositions?: FencePositions;
    selection?: RotationSelection;
    direction?: RotationDirection;
  } = {
    ...envelope.value,
    type: "match.useSpecialCard",
    cardType: value.cardType
  };

  if (value.targetPosition !== undefined) {
    const targetPosition = validatePosition(value.targetPosition);

    if (!targetPosition.ok) {
      return targetPosition;
    }

    base.targetPosition = targetPosition.value;
  }

  if (value.targetPlayerId !== undefined) {
    if (!isString(value.targetPlayerId)) {
      return { ok: false, message: "targetPlayerId must be a non-empty string." };
    }

    base.targetPlayerId = value.targetPlayerId;
  }

  if (value.fencePositions !== undefined) {
    const fencePositions = validateFencePositions(value.fencePositions);

    if (!fencePositions.ok) {
      return fencePositions;
    }

    base.fencePositions = fencePositions.value;
  }

  if (value.selection !== undefined) {
    const selection = validateRotationSelection(value.selection);

    if (!selection.ok) {
      return selection;
    }

    base.selection = selection.value;
  }

  if (value.direction !== undefined) {
    if (!isRotationDirection(value.direction)) {
      return { ok: false, message: "direction must be a valid rotation direction." };
    }

    base.direction = value.direction;
  }

  return {
    ok: true,
    value: base as UseSpecialCardCommand
  };
}

function validatePurchaseSpecialCardCommand(
  value: unknown
): ValidationResult<PurchaseSpecialCardCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.purchaseSpecialCard") {
    return { ok: false, message: "Expected a match.purchaseSpecialCard command." };
  }

  if (!isRecord(value) || !isSpecialCardType(value.cardType)) {
    return { ok: false, message: "cardType must be a valid special card name." };
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.purchaseSpecialCard",
      cardType: value.cardType
    }
  };
}

function validateOpenTreasureCommand(
  value: unknown
): ValidationResult<OpenTreasureCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.openTreasure") {
    return { ok: false, message: "Expected a match.openTreasure command." };
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.openTreasure"
    }
  };
}

function validateEndTurnCommand(value: unknown): ValidationResult<EndTurnCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.endTurn") {
    return { ok: false, message: "Expected a match.endTurn command." };
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      type: "match.endTurn"
    }
  };
}

function validatePrepareNextRoundCommand(
  value: unknown
): ValidationResult<PrepareNextRoundCommand> {
  const envelope = validateCommandEnvelope(value);

  if (!envelope.ok) {
    return envelope;
  }

  if (envelope.value.type !== "match.prepareNextRound") {
    return { ok: false, message: "Expected a match.prepareNextRound command." };
  }

  if (!isRecord(value)) {
    return { ok: false, message: "Prepare next round commands must be objects." };
  }

  const treasurePlacements = validateTreasurePlacements(value.treasurePlacements);

  if (!treasurePlacements.ok) {
    return treasurePlacements;
  }

  return {
    ok: true,
    value:
      treasurePlacements.value === undefined
        ? {
            ...envelope.value,
            type: "match.prepareNextRound"
          }
        : {
            ...envelope.value,
            type: "match.prepareNextRound",
            treasurePlacements: treasurePlacements.value
          }
  };
}

export function validateMatchCommand(value: unknown): ValidationResult<MatchCommand> {
  if (!isRecord(value) || !isString(value.type)) {
    return { ok: false, message: "Command payload must include a type." };
  }

  switch (value.type) {
    case "match.submitAuctionBids":
      return validateSubmitAuctionBidsCommand(value);
    case "match.submitPriority":
      return validateSubmitPriorityCommand(value);
    case "match.placeTreasure":
      return validatePlaceTreasureCommand(value);
    case "match.movePlayer":
      return validateMovePlayerCommand(value);
    case "match.throwTile":
      return validateThrowTileCommand(value);
    case "match.rotateTiles":
      return validateRotateTilesCommand(value);
    case "match.useSpecialCard":
      return validateUseSpecialCardCommand(value);
    case "match.purchaseSpecialCard":
      return validatePurchaseSpecialCardCommand(value);
    case "match.openTreasure":
      return validateOpenTreasureCommand(value);
    case "match.endTurn":
      return validateEndTurnCommand(value);
    case "match.prepareNextRound":
      return validatePrepareNextRoundCommand(value);
    default:
      return {
        ok: false,
        message: `Unknown command type: ${String(value.type)}.`
      };
  }
}

export function getCommandVersion(): number {
  return COMMAND_VERSION;
}
