import type {
  Direction,
  PlayerId,
  Position,
  PriorityCard,
  RotationDirection,
  TreasureId,
  TurnStage,
  TileKind,
  SpecialCardType,
  AuctionBidState,
  MatchResult
} from "./model.ts";

export type DomainEvent =
  | {
      readonly type: "auctionBidSubmitted";
      readonly playerId: PlayerId;
      readonly bids: readonly AuctionBidState[];
    }
  | {
      readonly type: "auctionOfferRevealed";
      readonly offerSlot: number;
      readonly cardType: SpecialCardType;
    }
  | {
      readonly type: "auctionResolved";
      readonly winners: Readonly<Record<number, PlayerId | null>>;
    }
  | {
      readonly type: "prioritySubmitted";
      readonly playerId: PlayerId;
      readonly priorityCard: PriorityCard;
    }
  | {
      readonly type: "roundStarted";
      readonly roundNumber: number;
      readonly turnOrder: readonly PlayerId[];
      readonly firstPlayerId: PlayerId;
    }
  | {
      readonly type: "playerMoved";
      readonly playerId: PlayerId;
      readonly from: Position;
      readonly to: Position;
      readonly direction: Direction;
    }
  | {
      readonly type: "turnStageChanged";
      readonly playerId: PlayerId;
      readonly stage: TurnStage;
    }
  | {
      readonly type: "treasurePickedUp";
      readonly playerId: PlayerId;
      readonly treasureId: TreasureId;
      readonly position: Position;
    }
  | {
      readonly type: "treasurePlaced";
      readonly playerId: PlayerId;
      readonly treasureId: TreasureId;
      readonly position: Position;
    }
  | {
      readonly type: "treasureOpened";
      readonly playerId: PlayerId;
      readonly treasureId: TreasureId;
      readonly points: number;
    }
  | {
      readonly type: "tileThrown";
      readonly playerId: PlayerId;
      readonly source: Position;
      readonly target: Position;
      readonly tileKind: TileKind;
    }
  | {
      readonly type: "tileChanged";
      readonly position: Position;
      readonly from: TileKind;
      readonly to: TileKind;
    }
  | {
      readonly type: "boardRotated";
      readonly playerId: PlayerId;
      readonly selectionKind: "square2" | "cross5" | "rectangle6";
      readonly direction: RotationDirection;
      readonly positions: readonly Position[];
    }
  | {
      readonly type: "specialCardAwarded";
      readonly playerId: PlayerId;
      readonly cardType: SpecialCardType;
      readonly cost: number;
    }
  | {
      readonly type: "specialCardUsed";
      readonly playerId: PlayerId;
      readonly cardType: SpecialCardType;
    }
  | {
      readonly type: "fencePlaced";
      readonly fenceId: string;
      readonly positions: readonly [Position, Position];
    }
  | {
      readonly type: "fenceRemoved";
      readonly fenceId: string;
    }
  | {
      readonly type: "treasureMoved";
      readonly treasureId: TreasureId;
      readonly from: Position;
      readonly to: Position;
    }
  | {
      readonly type: "playerStatusChanged";
      readonly playerId: PlayerId;
      readonly fire: boolean;
      readonly water: boolean;
      readonly skipNextTurnCount: number;
      readonly movementLimit: number | null;
    }
  | {
      readonly type: "playerDamaged";
      readonly playerId: PlayerId;
      readonly amount: number;
      readonly remainingHitPoints: number;
    }
  | {
      readonly type: "playerEliminated";
      readonly playerId: PlayerId;
      readonly position: Position;
    }
  | {
      readonly type: "treasureDropped";
      readonly playerId: PlayerId;
      readonly treasureId: TreasureId;
      readonly position: Position;
    }
  | {
      readonly type: "turnSkipped";
      readonly playerId: PlayerId;
      readonly remainingSkipCount: number;
      readonly turnNumber: number;
    }
  | {
      readonly type: "turnEnded";
      readonly previousPlayerId: PlayerId;
      readonly nextPlayerId: PlayerId;
      readonly turnNumber: number;
    }
  | {
      readonly type: "roundCompleted";
      readonly roundNumber: number;
      readonly openedTreasureCount: number;
    }
  | {
      readonly type: "nextRoundPrepared";
      readonly roundNumber: number;
      readonly revealedAuctionCardTypes: readonly SpecialCardType[];
    }
  | {
      readonly type: "matchCompleted";
      readonly result: MatchResult;
    };
