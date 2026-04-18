import type {
  AuctionSpecialCardType,
  MatchSettings,
  TileDefinition
} from "../packages/domain/src/index.ts";

export interface TreasureCardConfig {
  readonly slot: number | null;
  readonly points: number;
}

export interface TestplayConfig {
  readonly settings: Partial<MatchSettings>;
  readonly board: {
    readonly tiles: readonly TileDefinition[];
    readonly specialCardDeck: readonly AuctionSpecialCardType[];
  };
  readonly treasureCardsPerPlayer: number;
  readonly treasureCardDeck: readonly TreasureCardConfig[];
}

export const PROJECT_BH_TESTPLAY_CONFIG: TestplayConfig = {
  settings: {
    startingHitPoints: 10,
    startingScore: 3,
    totalRounds: 5,
    roundOpenTreasureTarget: 4,
    auctionCardDrawCount: 4,
    rotationZone: {
      origin: { x: 5, y: 5 },
      width: 10,
      height: 10
    }
  },
  board: {
    tiles: [
      { position: { x: 6, y: 6 }, kind: "fire" },
      { position: { x: 7, y: 6 }, kind: "water" },
      { position: { x: 8, y: 6 }, kind: "electric" },
      { position: { x: 10, y: 10 }, kind: "fire" },
      { position: { x: 10, y: 11 }, kind: "fire" },
      { position: { x: 11, y: 10 }, kind: "water" },
      { position: { x: 11, y: 11 }, kind: "electric" }
    ],
    specialCardDeck: [
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
    ]
  },
  treasureCardsPerPlayer: 2,
  treasureCardDeck: [
    { slot: 1, points: 3 },
    { slot: 2, points: -1 },
    { slot: 3, points: 1 },
    { slot: 4, points: 0 },
    { slot: 5, points: 4 },
    { slot: 6, points: 1 },
    { slot: 7, points: 6 },
    { slot: null, points: -2 }
  ]
};
