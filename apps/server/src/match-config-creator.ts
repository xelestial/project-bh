import { PROJECT_BH_TESTPLAY_CONFIG } from "../../../config/testplay-config.ts";
import type {
  CreateMatchStateInput,
  PlayerDefinition,
  TreasureDefinition,
  TileDefinition
} from "../../../packages/domain/src/index.ts";
import { DEFAULT_MATCH_SETTINGS, createPosition, positionKey } from "../../../packages/domain/src/index.ts";

interface RoomPlayerLike {
  readonly id: string;
  readonly name: string;
}

function createSeed(source: string): number {
  let hash = 1779033703 ^ source.length;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return hash >>> 0;
}

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeck<TValue>(items: readonly TValue[], seedSource: string): TValue[] {
  const shuffled = [...items];
  const random = createDeterministicRng(createSeed(seedSource));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const next = shuffled[swapIndex];

    if (current === undefined || next === undefined) {
      continue;
    }

    shuffled[index] = next;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function createBoardTiles(matchId: string): readonly TileDefinition[] {
  const tileCounts = PROJECT_BH_TESTPLAY_CONFIG.board.tileCounts;
  const totalTileCount = tileCounts.fire + tileCounts.water + tileCounts.electric;
  const allPositions: TileDefinition["position"][] = [];

  const rotationZone = PROJECT_BH_TESTPLAY_CONFIG.settings.rotationZone ?? DEFAULT_MATCH_SETTINGS.rotationZone;

  for (let y = rotationZone.origin.y; y < rotationZone.origin.y + rotationZone.height; y += 1) {
    for (let x = rotationZone.origin.x; x < rotationZone.origin.x + rotationZone.width; x += 1) {
      allPositions.push(createPosition(x, y));
    }
  }

  if (totalTileCount > allPositions.length) {
    throw new Error(
      `Requested ${totalTileCount} tiles but the board only has ${allPositions.length} cells.`
    );
  }

  const chosenPositions = shuffleDeck(allPositions, `board:${matchId}`).slice(0, totalTileCount);
  const tileKinds: Array<TileDefinition["kind"]> = [
    ...Array.from({ length: tileCounts.fire }, () => "fire" as const),
    ...Array.from({ length: tileCounts.water }, () => "water" as const),
    ...Array.from({ length: tileCounts.electric }, () => "electric" as const)
  ];
  const shuffledKinds = shuffleDeck(tileKinds, `board-kinds:${matchId}`);

  return chosenPositions
    .map((position, index) => ({
      position,
      kind: shuffledKinds[index] ?? "fire"
    }))
    .sort((left, right) => positionKey(left.position).localeCompare(positionKey(right.position)));
}

function createTreasureDefinitions(
  matchId: string,
  players: readonly PlayerDefinition[]
): {
  readonly treasures: readonly TreasureDefinition[];
  readonly openableTreasureCount: number;
} {
  const cardsPerPlayer = PROJECT_BH_TESTPLAY_CONFIG.treasureCardsPerPlayer;
  const requiredCardCount = players.length * cardsPerPlayer;

  if (requiredCardCount > PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck.length) {
    throw new Error(
      `Treasure deck has ${PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck.length} cards but ${requiredCardCount} are required.`
    );
  }

  const dealtCards = shuffleDeck(PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck, matchId).slice(0, requiredCardCount);
  const openableTreasureCount = dealtCards.filter((card) => card.slot !== null).length;

  const treasures = players.flatMap((player, seat) => {
    const startIndex = seat * cardsPerPlayer;
    const hand = dealtCards.slice(startIndex, startIndex + cardsPerPlayer);

    return hand
      .slice()
      .sort((left, right) => {
        const leftSlot = left?.slot ?? Number.POSITIVE_INFINITY;
        const rightSlot = right?.slot ?? Number.POSITIVE_INFINITY;
        return leftSlot - rightSlot;
      })
      .map((card, index) => ({
        id: card?.slot === null ? `treasure-fake-${seat + 1}-${index + 1}` : `treasure-slot-${card?.slot}`,
        slot: card?.slot ?? null,
        ownerPlayerId: player.id,
        points: card?.points ?? 0
      }));
  });

  return {
    treasures,
    openableTreasureCount
  };
}

export function createMatchInputFromConfig(
  matchId: string,
  roomPlayers: readonly RoomPlayerLike[]
): CreateMatchStateInput {
  const players: readonly PlayerDefinition[] = roomPlayers.map((player) => ({
    id: player.id,
    name: player.name
  }));

  const treasureDefinitions = createTreasureDefinitions(matchId, players);

  return {
    matchId,
    players,
    settings: {
      ...PROJECT_BH_TESTPLAY_CONFIG.settings,
      roundOpenTreasureTarget: treasureDefinitions.openableTreasureCount
    },
    specialCardDeck: PROJECT_BH_TESTPLAY_CONFIG.board.specialCardDeck,
    tiles: createBoardTiles(matchId),
    treasureBoardSlots: PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck
      .map((card) => card.slot)
      .filter((slot): slot is number => slot !== null)
      .sort((left, right) => left - right),
    treasures: treasureDefinitions.treasures
  };
}
