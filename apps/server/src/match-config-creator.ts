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

function createTreasureDefinitions(players: readonly PlayerDefinition[]): readonly TreasureDefinition[] {
  const cardsBySeat = PROJECT_BH_TESTPLAY_CONFIG.treasureCardsByPlayerCount[players.length];

  if (!cardsBySeat) {
    throw new Error(`Missing treasure card config for player count ${players.length}.`);
  }

  return cardsBySeat.flatMap((cards, seat) => {
    const player = players[seat];

    if (!player) {
      throw new Error(`Missing player for seat ${seat}.`);
    }

    return cards.map((points, index) => ({
      id: `treasure-${seat + 1}-${index + 1}`,
      slot: seat * 10 + index + 1,
      ownerPlayerId: player.id,
      points
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
    treasures: createTreasureDefinitions(players)
  };
}
