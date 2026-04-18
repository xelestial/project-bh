export const BOARD_SIZE = 20;
export const TOTAL_ROUNDS = 5;
export const ROUND_OPEN_TREASURE_TARGET = 4;
export const PRIORITY_CARD_VALUES = [1, 2, 3, 4, 5, 6] as const;
export const AUCTION_CARD_DRAW_COUNT = 4;
export const SPECIAL_CARD_TYPES = [
  "coldBomb",
  "flameBomb",
  "electricBomb",
  "largeHammer",
  "fence",
  "recoveryPotion",
  "jump",
  "hook"
] as const;
export const AUCTION_SPECIAL_CARD_TYPES = [
  "coldBomb",
  "flameBomb",
  "electricBomb",
  "largeHammer",
  "recoveryPotion",
  "jump",
  "hook"
] as const;
export const DEFAULT_SPECIAL_CARD_DECK = [
  "coldBomb",
  "flameBomb",
  "electricBomb",
  "largeHammer",
  "recoveryPotion",
  "jump",
  "hook",
  "coldBomb",
  "flameBomb",
  "electricBomb",
  "largeHammer",
  "jump",
  "hook"
] as const;
export const SPECIAL_CARD_CHARGE_BUNDLE = {
  coldBomb: 3,
  flameBomb: 3,
  electricBomb: 3,
  largeHammer: 3,
  fence: 3,
  recoveryPotion: 1,
  jump: 3,
  hook: 2
} as const;
export const EMPTY_SPECIAL_CARD_INVENTORY = Object.freeze(
  Object.fromEntries(SPECIAL_CARD_TYPES.map((cardType) => [cardType, 0]))
) as Readonly<Record<(typeof SPECIAL_CARD_TYPES)[number], number>>;

export interface RotationZone {
  readonly origin: Position;
  readonly width: number;
  readonly height: number;
}

export interface MatchSettings {
  readonly startingHitPoints: number;
  readonly startingScore: number;
  readonly totalRounds: number;
  readonly roundOpenTreasureTarget: number;
  readonly auctionCardDrawCount: number;
  readonly rotationZone: RotationZone;
}

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  startingHitPoints: 10,
  startingScore: 3,
  totalRounds: TOTAL_ROUNDS,
  roundOpenTreasureTarget: ROUND_OPEN_TREASURE_TARGET,
  auctionCardDrawCount: AUCTION_CARD_DRAW_COUNT,
  rotationZone: {
    origin: { x: 5, y: 5 },
    width: 10,
    height: 10
  }
};

export type PlayerId = string;
export type MatchId = string;
export type TreasureId = string;
export type Direction = "north" | "east" | "south" | "west";
export type RotationDirection = "clockwise" | "counterclockwise";
export type PriorityCard = (typeof PRIORITY_CARD_VALUES)[number];
export type SpecialCardType = (typeof SPECIAL_CARD_TYPES)[number];
export type AuctionSpecialCardType = (typeof AUCTION_SPECIAL_CARD_TYPES)[number];
export type TileKind =
  | "plain"
  | "fire"
  | "giantFlame"
  | "water"
  | "river"
  | "electric"
  | "ice";

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Square2RotationSelection {
  readonly kind: "square2";
  readonly origin: Position;
}

export interface Cross5RotationSelection {
  readonly kind: "cross5";
  readonly center: Position;
}

export interface Rectangle6RotationSelection {
  readonly kind: "rectangle6";
  readonly origin: Position;
  readonly orientation: "horizontal" | "vertical";
}

export type RotationSelection =
  | Square2RotationSelection
  | Cross5RotationSelection
  | Rectangle6RotationSelection;

export interface TileState {
  readonly kind: TileKind;
}

export interface TileDefinition {
  readonly position: Position;
  readonly kind: Exclude<TileKind, "plain">;
}

export interface FenceDefinition {
  readonly id: string;
  readonly positions: readonly [Position, Position];
}

export interface FenceState {
  readonly id: string;
  readonly positions: readonly [Position, Position];
}

export interface BoardState {
  readonly width: number;
  readonly height: number;
  readonly tiles: Readonly<Record<string, TileState>>;
  readonly fences: Readonly<Record<string, FenceState>>;
}

export interface PlayerStatusState {
  readonly fire: boolean;
  readonly water: boolean;
  readonly skipNextTurnCount: number;
  readonly movementLimit: number | null;
}

export type SpecialCardInventory = Readonly<Record<SpecialCardType, number>>;

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly seat: number;
  readonly startPosition: Position;
  readonly position: Position;
  readonly hitPoints: number;
  readonly score: number;
  readonly eliminated: boolean;
  readonly carriedTreasureId: TreasureId | null;
  readonly openedTreasureIds: readonly TreasureId[];
  readonly availablePriorityCards: readonly PriorityCard[];
  readonly specialInventory: SpecialCardInventory;
  readonly status: PlayerStatusState;
}

export interface TreasureState {
  readonly id: TreasureId;
  readonly slot: number | null;
  readonly ownerPlayerId: PlayerId;
  readonly points: number;
  readonly initialPosition: Position | null;
  readonly position: Position | null;
  readonly carriedByPlayerId: PlayerId | null;
  readonly openedByPlayerId: PlayerId | null;
  readonly removedFromRound: boolean;
}

export interface AuctionOfferState {
  readonly slot: number;
  readonly cardType: AuctionSpecialCardType;
}

export interface AuctionBidState {
  readonly offerSlot?: number;
  readonly amount: number;
}

export interface AuctionState {
  readonly offers: readonly AuctionOfferState[];
  readonly currentOfferIndex: number;
  readonly submittedBids: Readonly<Record<PlayerId, AuctionBidState | null>>;
  readonly resolvedOffers: Readonly<Record<number, PlayerId | null>>;
  readonly resolved: boolean;
}

export type RoundPhase =
  | "treasurePlacement"
  | "auction"
  | "prioritySubmission"
  | "inTurn"
  | "completed";
export type TurnStage = "mandatoryStep" | "secondaryAction";

export interface TurnState {
  readonly playerId: PlayerId;
  readonly stage: TurnStage;
  readonly mandatoryStepDirection: Direction | null;
}

export interface RoundState {
  readonly roundNumber: number;
  readonly turnNumber: number;
  readonly phase: RoundPhase;
  readonly activePlayerId: PlayerId | null;
  readonly openedTreasureCount: number;
  readonly turnOrder: readonly PlayerId[];
  readonly submittedPriorityCards: Readonly<Record<PlayerId, PriorityCard | null>>;
  readonly turn: TurnState | null;
  readonly auction: AuctionState;
}

export interface MatchResult {
  readonly winnerPlayerIds: readonly PlayerId[];
  readonly highestScore: number;
  readonly tiedOpenedTreasureCount: number;
}

export interface MatchState {
  readonly matchId: MatchId;
  readonly settings: MatchSettings;
  readonly board: BoardState;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly playerOrder: readonly PlayerId[];
  readonly treasureBoardSlots: readonly number[];
  readonly treasures: Readonly<Record<TreasureId, TreasureState>>;
  readonly round: RoundState;
  readonly specialCardDeck: readonly AuctionSpecialCardType[];
  readonly specialCardDeckIndex: number;
  readonly completed: boolean;
  readonly result: MatchResult | null;
}

export interface PlayerDefinition {
  readonly id: PlayerId;
  readonly name: string;
}

export interface TreasureDefinition {
  readonly id: TreasureId;
  readonly slot: number | null;
  readonly ownerPlayerId?: PlayerId;
  readonly points: number;
  readonly position?: Position;
}

export interface CreateMatchStateInput {
  readonly matchId: MatchId;
  readonly players: readonly PlayerDefinition[];
  readonly fences?: readonly FenceDefinition[];
  readonly settings?: Partial<MatchSettings>;
  readonly specialCardDeck?: readonly AuctionSpecialCardType[];
  readonly tiles?: readonly TileDefinition[];
  readonly treasureBoardSlots?: readonly number[];
  readonly treasures?: readonly TreasureDefinition[];
}
