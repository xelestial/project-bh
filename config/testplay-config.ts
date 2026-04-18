import type {
  MatchSettings,
  SpecialCardType,
  TileDefinition
} from "../packages/domain/src/index.ts";

export interface TestplayConfig {
  readonly settings: Partial<MatchSettings>;
  readonly board: {
    readonly tiles: readonly TileDefinition[];
    readonly specialCardDeck: readonly SpecialCardType[];
  };
  readonly treasureCardsByPlayerCount: Readonly<Record<number, readonly (readonly number[])[]>>;
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
      "hammer5",
      "hammer6",
      "fence",
      "coldBomb",
      "flameBomb",
      "electricBomb",
      "hammer5",
      "hammer6",
      "fence"
    ]
  },
  treasureCardsByPlayerCount: {
    2: [
      [3, -1],
      [4, 1]
    ],
    3: [
      [3, -1],
      [4, 1],
      [6, 0]
    ],
    4: [
      [3, -1],
      [1, 0],
      [4, 1],
      [6, -2]
    ]
  }
};
