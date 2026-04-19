import {
  type FencePositions,
  SPECIAL_CARD_TYPES,
  type Position,
  type RotationDirection,
  type RotationSelection,
  type SpecialCardType,
  type TreasureId
} from "../../domain/src/index.ts";

export interface PendingThrowAction {
  readonly kind: "throw";
  readonly source: Position;
}

export interface PendingTreasurePlacementAction {
  readonly kind: "treasurePlacement";
  readonly treasureId: TreasureId;
}

export interface PendingSpecialCardAction {
  readonly kind: "specialCard";
  readonly cardType: SpecialCardType;
  readonly firstPosition?: Position;
}

export type PendingCellAction =
  | PendingThrowAction
  | PendingTreasurePlacementAction
  | PendingSpecialCardAction;

export interface ActionQueryRequest {
  readonly version: 1;
  readonly sessionToken: string;
  readonly cell: Position;
  readonly pendingAction?: PendingCellAction;
}

export interface ActionCommandPayload {
  readonly type:
    | "match.submitAuctionBids"
    | "match.submitPriority"
    | "match.placeTreasure"
    | "match.movePlayer"
    | "match.throwTile"
    | "match.rotateTiles"
    | "match.useSpecialCard"
    | "match.purchaseSpecialCard"
    | "match.openTreasure"
    | "match.endTurn"
    | "match.prepareNextRound";
  readonly treasureId?: TreasureId;
  readonly position?: Position;
  readonly bids?: readonly { readonly amount: number; readonly offerSlot?: number }[];
  readonly priorityCard?: number;
  readonly direction?: RotationDirection | "north" | "east" | "south" | "west";
  readonly source?: Position;
  readonly target?: Position;
  readonly selection?: RotationSelection;
  readonly cardType?: SpecialCardType;
  readonly targetPosition?: Position;
  readonly targetPlayerId?: string;
  readonly fencePositions?: FencePositions;
}

export interface ActionCandidate {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly command?: ActionCommandPayload;
  readonly nextPendingAction?: PendingCellAction;
  readonly clearPendingAction?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSpecialCardType(value: unknown): value is SpecialCardType {
  return typeof value === "string" && SPECIAL_CARD_TYPES.includes(value as SpecialCardType);
}

function validatePosition(value: unknown): Position | null {
  if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number") {
    return null;
  }

  return {
    x: value.x,
    y: value.y
  };
}

function validatePendingAction(value: unknown): PendingCellAction | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || !isString(value.kind)) {
    return undefined;
  }

  switch (value.kind) {
    case "throw": {
      const source = validatePosition(value.source);
      return source ? { kind: "throw", source } : undefined;
    }
    case "treasurePlacement":
      return isString(value.treasureId)
        ? { kind: "treasurePlacement", treasureId: value.treasureId }
        : undefined;
    case "specialCard": {
      if (!isSpecialCardType(value.cardType)) {
        return undefined;
      }

      const firstPosition =
        value.firstPosition === undefined ? undefined : validatePosition(value.firstPosition);

      if (value.firstPosition !== undefined && !firstPosition) {
        return undefined;
      }

      return {
        kind: "specialCard",
        cardType: value.cardType,
        ...(firstPosition ? { firstPosition } : {})
      };
    }
    default:
      return undefined;
  }
}

export function validateActionQueryRequest(value: unknown):
  | { readonly ok: true; readonly value: ActionQueryRequest }
  | { readonly ok: false; readonly message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Action query payload must be an object." };
  }

  if (value.version !== 1) {
    return { ok: false, message: "Unsupported action query version." };
  }

  if (!isString(value.sessionToken)) {
    return { ok: false, message: "sessionToken must be a non-empty string." };
  }

  const cell = validatePosition(value.cell);

  if (!cell) {
    return { ok: false, message: "cell must include numeric x and y values." };
  }

  const pendingAction = validatePendingAction(value.pendingAction);

  if (value.pendingAction !== undefined && pendingAction === undefined) {
    return { ok: false, message: "pendingAction is invalid." };
  }

  return {
    ok: true,
    value: {
      version: 1,
      sessionToken: value.sessionToken,
      cell,
      ...(pendingAction ? { pendingAction } : {})
    }
  };
}
