import { PROJECT_BH_TESTPLAY_CONFIG } from "../../../config/testplay-config.ts";
import type {
  CreateMatchStateInput,
  PlayerDefinition,
  TreasureDefinition
} from "../../../packages/domain/src/index.ts";

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

function createTreasureDefinitions(
  matchId: string,
  players: readonly PlayerDefinition[]
): readonly TreasureDefinition[] {
  const cardsPerPlayer = PROJECT_BH_TESTPLAY_CONFIG.treasureCardsPerPlayer;
  const requiredCardCount = players.length * cardsPerPlayer;

  if (requiredCardCount > PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck.length) {
    throw new Error(
      `Treasure deck has ${PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck.length} cards but ${requiredCardCount} are required.`
    );
  }

  const dealtCards = shuffleDeck(PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck, matchId).slice(0, requiredCardCount);

  return players.flatMap((player, seat) => {
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
}

export function createMatchInputFromConfig(
  matchId: string,
  roomPlayers: readonly RoomPlayerLike[]
): CreateMatchStateInput {
  const players: readonly PlayerDefinition[] = roomPlayers.map((player) => ({
    id: player.id,
    name: player.name
  }));

  return {
    matchId,
    players,
    settings: PROJECT_BH_TESTPLAY_CONFIG.settings,
    specialCardDeck: PROJECT_BH_TESTPLAY_CONFIG.board.specialCardDeck,
    tiles: PROJECT_BH_TESTPLAY_CONFIG.board.tiles,
    treasureBoardSlots: PROJECT_BH_TESTPLAY_CONFIG.treasureCardDeck
      .map((card) => card.slot)
      .filter((slot): slot is number => slot !== null)
      .sort((left, right) => left - right),
    treasures: createTreasureDefinitions(matchId, players)
  };
}
