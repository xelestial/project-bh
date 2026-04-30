import {
  createMatchState,
  createPosition,
  placeTreasure,
  submitAuctionBids,
  submitPriorityCard,
  type MatchState,
  type PriorityCard,
  type TileDefinition,
  type TreasureDefinition
} from "../../domain/src/index.ts";

export interface TwoPlayerMatchFixtureOptions {
  readonly auctionBids?: readonly [readonly { readonly offerSlot: number; readonly amount: number }[], readonly { readonly offerSlot: number; readonly amount: number }[]];
  readonly started?: boolean;
  readonly priorityCards?: readonly [PriorityCard, PriorityCard];
  readonly tiles?: readonly TileDefinition[];
  readonly treasures?: readonly TreasureDefinition[];
}

const DEFAULT_TREASURES: readonly TreasureDefinition[] = [
  {
    id: "treasure-1",
    slot: 1,
    points: 3,
    ownerPlayerId: "player-1",
    position: createPosition(1, 0)
  },
  {
    id: "treasure-2",
    slot: 2,
    points: 1,
    ownerPlayerId: "player-1",
    position: createPosition(18, 0)
  },
  {
    id: "treasure-3",
    slot: 3,
    points: 4,
    ownerPlayerId: "player-2",
    position: createPosition(19, 18)
  },
  {
    id: "treasure-4",
    slot: 4,
    points: 6,
    ownerPlayerId: "player-2",
    position: createPosition(0, 18)
  }
];

function placeAllTreasures(match: MatchState): MatchState {
  let nextMatch = match;

  for (const treasure of Object.values(nextMatch.treasures)) {
    if (!treasure.initialPosition) {
      continue;
    }

    try {
      nextMatch = placeTreasure(nextMatch, {
        playerId: treasure.ownerPlayerId,
        treasureId: treasure.id,
        position: treasure.initialPosition
      }).state;
    } catch {
      nextMatch = {
        ...nextMatch,
        treasures: {
          ...nextMatch.treasures,
          [treasure.id]: {
            ...treasure,
            position: treasure.initialPosition
          }
        },
        round: {
          ...nextMatch.round,
          phase: "auction"
        }
      };
    }
  }

  return nextMatch;
}

function resolveAuctionPhase(
  match: MatchState,
  auctionBids: TwoPlayerMatchFixtureOptions["auctionBids"] = [[], []]
): MatchState {
  let nextMatch = match;
  const [firstBids, secondBids] = auctionBids;

  while (nextMatch.round.phase === "auction") {
    const offer = nextMatch.round.auction.offers[nextMatch.round.auction.currentOfferIndex];

    if (!offer) {
      break;
    }

    const firstBid = firstBids.find((bid) => bid.offerSlot === offer.slot);
    const secondBid = secondBids.find((bid) => bid.offerSlot === offer.slot);

    nextMatch = submitAuctionBids(nextMatch, "player-1", firstBid ? [firstBid] : []).state;
    nextMatch = submitAuctionBids(nextMatch, "player-2", secondBid ? [secondBid] : []).state;
  }

  return nextMatch;
}

export function createTwoPlayerMatchFixture(
  options: TwoPlayerMatchFixtureOptions = {}
): MatchState {
  const input = {
    matchId: "match-fixture",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ],
    treasures: options.treasures ?? DEFAULT_TREASURES
  } as const;
  let match = createMatchState(
    options.tiles
      ? {
          ...input,
          tiles: options.tiles
        }
      : input
  );

  if (options.started ?? true) {
    match = placeAllTreasures(match);
    match = resolveAuctionPhase(match, options.auctionBids);
    const [firstCard, secondCard] = options.priorityCards ?? [6, 5];
    match = submitPriorityCard(match, "player-1", firstCard).state;
    match = submitPriorityCard(match, "player-2", secondCard).state;
  }

  return match;
}

export function createPrioritySubmissionFixture(
  options: Omit<TwoPlayerMatchFixtureOptions, "started"> = {}
): MatchState {
  let match = createTwoPlayerMatchFixture({
    ...options,
    started: false
  });
  match = placeAllTreasures(match);
  match = resolveAuctionPhase(match, options.auctionBids);
  return match;
}

export function createAuctionFixture(
  options: Omit<TwoPlayerMatchFixtureOptions, "started"> = {}
): MatchState {
  return placeAllTreasures(createTwoPlayerMatchFixture({
    ...options,
    started: false
  }));
}

export * from "./property-arbitraries.ts";
