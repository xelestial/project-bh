import { DomainError } from "./errors.ts";
import {
  BOARD_SIZE,
  EMPTY_SPECIAL_CARD_INVENTORY,
  DEFAULT_MATCH_SETTINGS,
  DEFAULT_SPECIAL_CARD_DECK,
  PRIORITY_CARD_VALUES,
  type BoardState,
  type CreateMatchStateInput,
  type MatchState,
  type MatchSettings,
  type PlayerState,
  type Position,
  type TreasureState
} from "./model.ts";
import { createPosition, isWithinBoard, positionKey } from "./position.ts";

function drawAuctionOffers(
  deck: readonly NonNullable<CreateMatchStateInput["specialCardDeck"]>[number][],
  startIndex: number,
  drawCount: number
) {
  const offers = Array.from({ length: drawCount }, (_, index) => {
    const deckIndex = (startIndex + index) % deck.length;
    const cardType = deck[deckIndex];

    if (!cardType) {
      throw new DomainError("INVALID_POSITION", "Special card deck cannot be empty.");
    }

    return {
      slot: index,
      cardType
    };
  });

  return {
    offers,
    nextDeckIndex: (startIndex + drawCount) % deck.length
  };
}

const START_POSITIONS: readonly Position[] = [
  createPosition(0, 0),
  createPosition(BOARD_SIZE - 1, 0),
  createPosition(BOARD_SIZE - 1, BOARD_SIZE - 1),
  createPosition(0, BOARD_SIZE - 1)
];

export function createMatchState(input: CreateMatchStateInput): MatchState {
  if (input.players.length < 2 || input.players.length > 4) {
    throw new DomainError(
      "INVALID_PLAYER_COUNT",
      "Project. BH currently supports matches with 2 to 4 players."
    );
  }

  const firstPlayer = input.players[0];

  if (!firstPlayer) {
    throw new DomainError(
      "INVALID_PLAYER_COUNT",
      "Project. BH requires at least one player."
    );
  }

  const board: BoardState = {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    tiles: Object.fromEntries(
      (input.tiles ?? []).map((tile) => {
        if (!isWithinBoard(tile.position)) {
          throw new DomainError(
            "INVALID_POSITION",
            "Board tile definitions must stay inside the board."
          );
        }

        return [
          positionKey(tile.position),
          {
            kind: tile.kind
          }
        ];
      })
    ),
    fences: Object.fromEntries(
      (input.fences ?? []).map((fence) => {
        for (const position of fence.positions) {
          if (!isWithinBoard(position)) {
            throw new DomainError(
              "INVALID_POSITION",
              "Fence definitions must stay inside the board."
            );
          }
        }

        return [
          fence.id,
          {
            id: fence.id,
            positions: fence.positions
          }
        ];
      })
    )
  };

  const settings: MatchSettings = {
    ...DEFAULT_MATCH_SETTINGS,
    ...input.settings,
    rotationZone: {
      ...DEFAULT_MATCH_SETTINGS.rotationZone,
      ...input.settings?.rotationZone
    },
    treasurePlacementZone: {
      ...DEFAULT_MATCH_SETTINGS.treasurePlacementZone,
      ...input.settings?.treasurePlacementZone
    }
  };

  const players = Object.fromEntries(
    input.players.map((player, index): [string, PlayerState] => {
      const startPosition = START_POSITIONS[index];

      if (!startPosition) {
        throw new DomainError(
          "INVALID_PLAYER_COUNT",
          "No start position is available for the given seat index."
        );
      }

      return [
        player.id,
        {
          id: player.id,
          name: player.name,
          seat: index,
          startPosition,
          position: startPosition,
          hitPoints: settings.startingHitPoints,
          score: settings.startingScore,
          eliminated: false,
          carriedTreasureId: null,
          openedTreasureIds: [],
          availablePriorityCards: [...PRIORITY_CARD_VALUES],
          specialInventory: EMPTY_SPECIAL_CARD_INVENTORY,
          status: {
            fire: false,
            water: false,
            skipNextTurnCount: 0,
            movementLimit: null
          }
        }
      ];
    })
  );

  const configuredTreasureBoardSlots = [...(input.treasureBoardSlots ?? [])];

  for (const slot of configuredTreasureBoardSlots) {
    if (!Number.isInteger(slot) || slot <= 0) {
      throw new DomainError(
        "INVALID_POSITION",
        "Treasure board slots must use positive integer ids."
      );
    }
  }

  if (new Set(configuredTreasureBoardSlots).size !== configuredTreasureBoardSlots.length) {
    throw new DomainError(
      "INVALID_POSITION",
      "Treasure board slots must be unique."
    );
  }

  const seenTreasureSlots = new Set<number>();
  const treasures = Object.fromEntries(
    (input.treasures ?? []).map((treasure, index): [string, TreasureState] => {
      const ownerPlayerId =
        treasure.ownerPlayerId ?? input.players[index % input.players.length]?.id;

      if (!ownerPlayerId) {
        throw new DomainError(
          "INVALID_PLAYER_COUNT",
          "Treasures require an owning player."
        );
      }

      if (treasure.slot !== null) {
        if (!Number.isInteger(treasure.slot) || treasure.slot <= 0) {
          throw new DomainError(
            "INVALID_POSITION",
            `Treasure ${treasure.id} must use a positive integer slot id or null for a fake card.`
          );
        }

        if (seenTreasureSlots.has(treasure.slot)) {
          throw new DomainError(
            "INVALID_POSITION",
            `Treasure slot ${treasure.slot} is duplicated.`
          );
        }

        seenTreasureSlots.add(treasure.slot);
      }

      if (treasure.position && !isWithinBoard(treasure.position)) {
        throw new DomainError(
          "INVALID_POSITION",
          `Treasure ${treasure.id} must start inside the board.`
        );
      }

      return [
        treasure.id,
        {
          id: treasure.id,
          slot: treasure.slot,
          ownerPlayerId,
          points: treasure.points,
          initialPosition: treasure.position ?? null,
          position: null,
          carriedByPlayerId: null,
          openedByPlayerId: null,
          removedFromRound: false
        }
      ];
    })
  );
  const treasureBoardSlots = (
    configuredTreasureBoardSlots.length > 0
      ? configuredTreasureBoardSlots
      : [...seenTreasureSlots]
  ).slice().sort((left, right) => left - right);

  for (const slot of seenTreasureSlots) {
    if (!treasureBoardSlots.includes(slot)) {
      throw new DomainError(
        "INVALID_POSITION",
        `Treasure slot ${slot} is not registered on the treasure board.`
      );
    }
  }
  const specialCardDeck = input.specialCardDeck ?? [...DEFAULT_SPECIAL_CARD_DECK];

  if (specialCardDeck.length === 0) {
    throw new DomainError("INVALID_POSITION", "Special card deck cannot be empty.");
  }

  const initialAuction = drawAuctionOffers(
    specialCardDeck,
    0,
    settings.auctionCardDrawCount
  );
  const requiresTreasurePlacement = Object.keys(treasures).length > 0;

  return {
    matchId: input.matchId,
    settings,
    board,
    players,
    playerOrder: input.players.map((player) => player.id),
    treasureBoardSlots,
    treasures,
    round: {
      roundNumber: 1,
      turnNumber: 1,
      phase: requiresTreasurePlacement ? "treasurePlacement" : "auction",
      activePlayerId: null,
      openedTreasureCount: 0,
      turnOrder: [],
      submittedPriorityCards: Object.fromEntries(
        input.players.map((player) => [player.id, null])
      ),
      turn: null,
      auction: {
        offers: initialAuction.offers,
        currentOfferIndex: 0,
        submittedBids: Object.fromEntries(
          input.players.map((player) => [player.id, null])
        ),
        resolvedOffers: Object.fromEntries(
          initialAuction.offers.map((offer) => [offer.slot, null])
        ),
        resolved: false
      }
    },
    specialCardDeck,
    specialCardDeckIndex: initialAuction.nextDeckIndex,
    completed: false,
    result: null
  };
}
