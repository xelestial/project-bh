import type {
  AuctionBidState,
  Direction,
  MatchState,
  PlayerId,
  Position,
  PriorityCard,
  RotationDirection,
  RotationSelection,
  SpecialCardType,
  TreasureId
} from "../../domain/src/index.ts";

export interface SubmitAuctionBidsCommand {
  readonly type: "match.submitAuctionBids";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly bids: readonly AuctionBidState[];
}

export interface SubmitPriorityCommand {
  readonly type: "match.submitPriority";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly priorityCard: PriorityCard;
}

export interface PlaceTreasureCommand {
  readonly type: "match.placeTreasure";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly treasureId: TreasureId;
  readonly position: Position;
}

export interface MovePlayerCommand {
  readonly type: "match.movePlayer";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly direction: Direction;
}

export interface ThrowTileCommand {
  readonly type: "match.throwTile";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly source: Position;
  readonly target: Position;
}

export interface RotateTilesCommand {
  readonly type: "match.rotateTiles";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly selection: RotationSelection;
  readonly direction: RotationDirection;
}

export interface UseSpecialCardCommand {
  readonly type: "match.useSpecialCard";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly cardType: SpecialCardType;
  readonly targetPosition?: Position;
  readonly targetPlayerId?: PlayerId;
  readonly fencePositions?: readonly [Position, Position];
  readonly selection?: RotationSelection;
  readonly direction?: RotationDirection;
}

export interface OpenTreasureCommand {
  readonly type: "match.openTreasure";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
}

export interface EndTurnCommand {
  readonly type: "match.endTurn";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
}

export interface PrepareNextRoundCommand {
  readonly type: "match.prepareNextRound";
  readonly version: 1;
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly treasurePlacements?: Readonly<Record<TreasureId, Position>>;
}

export type MatchCommand =
  | SubmitAuctionBidsCommand
  | SubmitPriorityCommand
  | PlaceTreasureCommand
  | MovePlayerCommand
  | ThrowTileCommand
  | RotateTilesCommand
  | UseSpecialCardCommand
  | OpenTreasureCommand
  | EndTurnCommand
  | PrepareNextRoundCommand;

export interface CommandRejection {
  readonly code: string;
  readonly message: string;
}

export interface CommandHandlingResult {
  readonly state: MatchState;
  readonly events: readonly unknown[];
  readonly rejection: CommandRejection | null;
}
