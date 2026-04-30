import {
  getTileKind,
  isFenceBlockingPosition,
  normalizeBoardAfterMutation,
  removeFence,
  setTileKind,
  upsertFence
} from "./board.ts";
import { DomainError } from "./errors.ts";
import type { DomainEvent } from "./events.ts";
import type {
  AuctionOfferState,
  AuctionBidState,
  FencePositions,
  FenceState,
  Direction,
  MatchState,
  MatchResult,
  PlayerId,
  PlayerState,
  PlayerStatusState,
  Position,
  PriorityCard,
  RotationDirection,
  RotationSelection,
  SpecialCardType,
  TreasureId,
  TreasureState,
  TurnStage,
  TurnState,
  TileKind
} from "./model.ts";
import {
  EMPTY_SPECIAL_CARD_INVENTORY,
  PRIORITY_CARD_VALUES,
  SPECIAL_CARD_CHARGE_BUNDLE,
  type MatchSettings
} from "./model.ts";
import { resolvePriorityTurnOrder } from "./priority.ts";
import { runResolutionPipeline } from "./resolution.ts";
import {
  getRotationPositionMapping,
  getRotationSelectionPositions,
  isValidRotationSelection
} from "./rotation.ts";
import { createBombResolutionPlan } from "./special-card-resolution.ts";
import {
  areOrthogonallyAdjacent,
  cardinalLineDistance,
  cardinalDirectionBetween,
  isSamePosition,
  isWithinBoard,
  movePosition,
  movePositionByDistance,
  positionKey
} from "./position.ts";

const THROWABLE_TILE_KINDS: readonly TileKind[] = ["fire", "water", "electric"];
const SECONDARY_MOVE_DISTANCE = 2;

export interface DomainMutationResult {
  readonly state: MatchState;
  readonly events: readonly DomainEvent[];
}

export interface ThrowTileInput {
  readonly playerId: PlayerId;
  readonly source: Position;
  readonly target: Position;
}

export interface RotateTilesInput {
  readonly playerId: PlayerId;
  readonly selection: RotationSelection;
  readonly direction: RotationDirection;
}

export interface UseSpecialCardInput {
  readonly playerId: PlayerId;
  readonly cardType: SpecialCardType;
  readonly targetPosition?: Position;
  readonly targetPlayerId?: PlayerId;
  readonly fencePositions?: FencePositions;
  readonly selection?: RotationSelection;
  readonly direction?: RotationDirection;
}

export interface PlaceTreasureInput {
  readonly playerId: PlayerId;
  readonly treasureId: TreasureId;
  readonly position: Position;
}

export interface PrepareNextRoundInput {
  readonly treasurePlacements?: Readonly<Record<TreasureId, Position>>;
}

function createMandatoryTurn(playerId: PlayerId): TurnState {
  return {
    playerId,
    stage: "mandatoryStep",
    mandatoryStepDirection: null
  };
}

function assertMatchActive(match: MatchState): void {
  if (match.completed) {
    throw new DomainError(
      "MATCH_ALREADY_COMPLETED",
      "The match is already completed."
    );
  }
}

function getPlayerOrThrow(match: MatchState, playerId: PlayerId): PlayerState {
  const player = match.players[playerId];

  if (!player) {
    throw new DomainError("NOT_ACTIVE_PLAYER", "Unknown player.");
  }

  return player;
}

function updatePlayer(match: MatchState, player: PlayerState): MatchState {
  return {
    ...match,
    players: {
      ...match.players,
      [player.id]: player
    }
  };
}

function updateTreasure(match: MatchState, treasure: TreasureState): MatchState {
  return {
    ...match,
    treasures: {
      ...match.treasures,
      [treasure.id]: treasure
    }
  };
}

function updateBoard(match: MatchState, board: MatchState["board"]): MatchState {
  return {
    ...match,
    board
  };
}

function assertRoundCompleted(match: MatchState): void {
  assertMatchActive(match);

  if (match.round.phase === "completed") {
    throw new DomainError(
      "ROUND_ALREADY_COMPLETED",
      "The active round is already completed."
    );
  }
}

function assertAuctionPhase(match: MatchState): void {
  assertRoundCompleted(match);

  if (match.round.phase !== "auction") {
    throw new DomainError(
      "ROUND_NOT_READY",
      "Auction bids can only be submitted during the auction phase."
    );
  }
}

function assertTreasurePlacementPhase(match: MatchState): void {
  assertRoundCompleted(match);

  if (match.round.phase !== "treasurePlacement") {
    throw new DomainError(
      "ROUND_NOT_READY",
      "Treasures may only be placed during the treasure placement phase."
    );
  }
}

function assertPrioritySubmissionPhase(match: MatchState): void {
  assertRoundCompleted(match);

  if (match.round.phase !== "prioritySubmission") {
    throw new DomainError(
      "ROUND_NOT_READY",
      "Priority cards can only be submitted during the priority phase."
    );
  }
}

function assertRoundInTurn(match: MatchState): void {
  assertRoundCompleted(match);

  if (match.round.phase !== "inTurn" || match.round.activePlayerId === null) {
    throw new DomainError(
      "ROUND_NOT_READY",
      "The round is not ready for turn actions yet."
    );
  }
}

function assertActivePlayer(match: MatchState, playerId: PlayerId): PlayerState {
  assertRoundInTurn(match);

  if (match.round.activePlayerId !== playerId) {
    throw new DomainError("NOT_ACTIVE_PLAYER", "Only the active player may act.");
  }

  const player = getPlayerOrThrow(match, playerId);

  if (player.eliminated) {
    throw new DomainError("PLAYER_ELIMINATED", "Eliminated players cannot act.");
  }

  return player;
}

function isSecondaryMovementAvailable(player: PlayerState): boolean {
  return player.status.movementLimit === null || player.status.movementLimit > 1;
}

function getMoveDistanceForStage(stage: TurnStage): number {
  return stage === "secondaryAction" ? SECONDARY_MOVE_DISTANCE : 1;
}

function collectMovePath(
  from: Position,
  direction: Direction,
  distance: number
): readonly Position[] {
  return Array.from({ length: distance }, (_, index) =>
    movePositionByDistance(from, direction, index + 1)
  );
}

function assertMovePathEnterable(match: MatchState, path: readonly Position[]): void {
  for (const position of path) {
    if (!isWithinBoard(position)) {
      throw new DomainError("OUT_OF_BOUNDS", "Players cannot move outside the board.");
    }

    if (isFenceBlockingPosition(match.board, position)) {
      throw new DomainError(
        "MOVEMENT_BLOCKED_BY_FENCE",
        "Players cannot move onto fenced tiles."
      );
    }

    if (getTileKind(match.board, position) === "river") {
      throw new DomainError(
        "MOVEMENT_BLOCKED_BY_FENCE",
        "River tiles cannot be entered without a dedicated jump rule."
      );
    }
  }
}

function assertMovementTurn(
  match: MatchState,
  playerId: PlayerId
): {
  readonly player: PlayerState;
  readonly stage: TurnStage;
} {
  const player = assertActivePlayer(match, playerId);
  const stage = match.round.turn?.stage;

  if (stage !== "mandatoryStep" && stage !== "secondaryAction") {
    throw new DomainError(
      "SECONDARY_ACTION_NOT_AVAILABLE",
      "The active turn does not have any movement budget left."
    );
  }

  if (stage === "secondaryAction" && !isSecondaryMovementAvailable(player)) {
    throw new DomainError(
      "SECONDARY_ACTION_NOT_AVAILABLE",
      "The player's extra movement step is not available."
    );
  }

  return {
    player,
    stage
  };
}

function assertSecondaryActionTurn(match: MatchState, playerId: PlayerId): PlayerState {
  const player = assertActivePlayer(match, playerId);

  if (match.round.turn?.stage !== "secondaryAction") {
    throw new DomainError(
      "MANDATORY_STEP_REQUIRED",
      "The player must complete the mandatory step before using a secondary action."
    );
  }

  return player;
}

function assertTreasureOpenTurn(match: MatchState, playerId: PlayerId): PlayerState {
  const player = assertActivePlayer(match, playerId);
  const stage = match.round.turn?.stage;

  if (stage !== "mandatoryStep" && stage !== "secondaryAction") {
    throw new DomainError(
      "ROUND_NOT_READY",
      "Treasures may only be opened during an active turn."
    );
  }

  return player;
}

function assertPlayerCanUseBoardAction(player: PlayerState): void {
  if (player.carriedTreasureId !== null) {
    throw new DomainError(
      "ACTION_BLOCKED_BY_TREASURE",
      "Players carrying a treasure may only move and open the treasure at their start tile."
    );
  }
}

function collectNonEliminatedPlayers(match: MatchState): readonly PlayerId[] {
  return match.playerOrder.filter((playerId) => !getPlayerOrThrow(match, playerId).eliminated);
}

function drawAuctionOffers(
  match: MatchState
): {
  readonly offers: MatchState["round"]["auction"]["offers"];
  readonly nextDeckIndex: number;
} {
  const offers = Array.from({ length: match.settings.auctionCardDrawCount }, (_, slot) => {
    const deckIndex = (match.specialCardDeckIndex + slot) % match.specialCardDeck.length;
    const cardType = match.specialCardDeck[deckIndex];

    if (!cardType) {
      throw new DomainError("INVALID_POSITION", "Special card deck cannot be empty.");
    }

    return {
      slot,
      cardType
    };
  });

  return {
    offers,
    nextDeckIndex:
      (match.specialCardDeckIndex + match.settings.auctionCardDrawCount) %
      match.specialCardDeck.length
  };
}

function resetAuctionSubmissions(match: MatchState) {
  return Object.fromEntries(match.playerOrder.map((playerId) => [playerId, null]));
}

function createResolvedOffers(
  offers: readonly AuctionOfferState[]
): Readonly<Record<number, PlayerId | null>> {
  return Object.fromEntries(offers.map((offer) => [offer.slot, null]));
}

function getCurrentAuctionOffer(match: MatchState): AuctionOfferState | null {
  return match.round.auction.offers[match.round.auction.currentOfferIndex] ?? null;
}

function getPlayerOwnedTreasures(
  match: MatchState,
  playerId: PlayerId
): readonly TreasureState[] {
  return Object.values(match.treasures).filter((treasure) => treasure.ownerPlayerId === playerId);
}

function isTreasureInsideTreasurePlacementZone(
  settings: MatchSettings,
  position: Position
): boolean {
  const { origin, width, height } = settings.treasurePlacementZone;

  return (
    position.x >= origin.x &&
    position.x < origin.x + width &&
    position.y >= origin.y &&
    position.y < origin.y + height
  );
}

function areAllRoundTreasuresPlaced(match: MatchState): boolean {
  return Object.values(match.treasures).every((treasure) => {
    return treasure.slot === null || treasure.position !== null;
  });
}

function activateTurn(
  match: MatchState,
  startIndex: number,
  turnNumber: number
): DomainMutationResult {
  let nextMatch = match;
  let nextTurnNumber = turnNumber;
  const events: DomainEvent[] = [];
  const turnOrder = nextMatch.round.turnOrder;

  for (let checked = 0; checked < turnOrder.length; checked += 1) {
    const index = (startIndex + checked) % turnOrder.length;
    const candidateId = turnOrder[index];

    if (!candidateId) {
      continue;
    }

    const candidate = getPlayerOrThrow(nextMatch, candidateId);

    if (candidate.eliminated) {
      continue;
    }

    if (candidate.status.skipNextTurnCount > 0) {
      const updatedCandidate: PlayerState = {
        ...candidate,
        status: {
          ...candidate.status,
          skipNextTurnCount: candidate.status.skipNextTurnCount - 1
        }
      };

      nextMatch = updatePlayer(nextMatch, updatedCandidate);
      events.push({
        type: "turnSkipped",
        playerId: candidateId,
        remainingSkipCount: updatedCandidate.status.skipNextTurnCount,
        turnNumber: nextTurnNumber
      });
      nextTurnNumber += 1;
      continue;
    }

    return {
      state: {
        ...nextMatch,
        round: {
          ...nextMatch.round,
          phase: "inTurn",
          activePlayerId: candidateId,
          turnNumber: nextTurnNumber,
          turn: createMandatoryTurn(candidateId)
        }
      },
      events
    };
  }

  throw new DomainError(
    "ROUND_NOT_READY",
    "No non-eliminated player is available to receive the turn."
  );
}

function advanceTurn(match: MatchState, previousPlayerId: PlayerId): DomainMutationResult {
  const currentIndex = match.round.turnOrder.indexOf(previousPlayerId);

  if (currentIndex === -1) {
    throw new DomainError("NOT_ACTIVE_PLAYER", "Unknown player order entry.");
  }

  const activated = activateTurn(
    match,
    (currentIndex + 1) % match.round.turnOrder.length,
    match.round.turnNumber + 1
  );
  const nextPlayerId = activated.state.round.activePlayerId;

  if (nextPlayerId === null) {
    throw new DomainError("ROUND_NOT_READY", "Could not resolve the next player.");
  }

  return {
    state: activated.state,
    events: [
      {
        type: "turnEnded",
        previousPlayerId,
        nextPlayerId,
        turnNumber: activated.state.round.turnNumber
      },
      ...activated.events
    ]
  };
}

function findTreasureAtPosition(
  match: MatchState,
  position: Position
): TreasureState | undefined {
  return Object.values(match.treasures).find((treasure) => {
    return (
      treasure.position !== null &&
      treasure.carriedByPlayerId === null &&
      treasure.openedByPlayerId === null &&
      isSamePosition(treasure.position, position)
    );
  });
}

function collectTileChangeEvents(
  before: MatchState["board"],
  after: MatchState["board"],
  positions: readonly Position[]
): readonly DomainEvent[] {
  const uniquePositions = new Map<string, Position>();

  for (const position of positions) {
    if (isWithinBoard(position)) {
      uniquePositions.set(positionKey(position), position);
    }
  }

  return [...uniquePositions.values()]
    .map((position): DomainEvent | null => {
      const from = getTileKind(before, position);
      const to = getTileKind(after, position);

      if (from === to) {
        return null;
      }

      return {
        type: "tileChanged",
        position,
        from,
        to
      };
    })
    .filter((event) => event !== null);
}

function createStatusChangedEvent(player: PlayerState): DomainEvent {
  return {
    type: "playerStatusChanged",
    playerId: player.id,
    fire: player.status.fire,
    water: player.status.water,
    skipNextTurnCount: player.status.skipNextTurnCount,
    movementLimit: player.status.movementLimit
  };
}

function isBombTargetInRange(from: Position, to: Position): boolean {
  const distance = cardinalLineDistance(from, to);

  return distance !== null && distance >= 1 && distance <= 3;
}

function getDirectPurchaseCost(cardType: SpecialCardType): number | null {
  switch (cardType) {
    case "fence":
      return 1;
    case "largeFence":
      return 2;
    default:
      return null;
  }
}

function validateFencePlacement(
  positions: FencePositions,
  expectedLength: 2 | 3
): positions is FencePositions {
  if (positions.length !== expectedLength) {
    return false;
  }

  if (!positions.every((position) => isWithinBoard(position))) {
    return false;
  }

  let direction: Direction | null = null;

  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];

    if (!previous || !current || !areOrthogonallyAdjacent(previous, current)) {
      return false;
    }

    const stepDirection = cardinalDirectionBetween(previous, current);

    if (!stepDirection) {
      return false;
    }

    if (direction === null) {
      direction = stepDirection;
      continue;
    }

    if (direction !== stepDirection) {
      return false;
    }
  }

  return true;
}

function applyTileEffectToPlayer(
  match: MatchState,
  playerId: PlayerId,
  tileKind: TileKind,
  ownTurn: boolean
): { readonly state: MatchState; readonly events: readonly DomainEvent[]; readonly endsTurnImmediately: boolean } {
  const result = runResolutionPipeline({
    match,
    actorPlayerId: ownTurn ? playerId : null,
    steps: [
      {
        kind: "applyTileEffect",
        playerId,
        tileKind,
        ownTurn
      }
    ]
  });

  return {
    state: result.state,
    events: result.events,
    endsTurnImmediately: result.endsTurnImmediately
  };
}

function resolveThrownTileResult(targetKind: TileKind, thrownKind: TileKind): TileKind {
  if (thrownKind === "water" && targetKind === "giantFlame") {
    return "plain";
  }

  if (thrownKind === "electric" && targetKind === "water") {
    return "electric";
  }

  if (targetKind === "electric" && (thrownKind === "fire" || thrownKind === "water" || thrownKind === "ice")) {
    return thrownKind;
  }

  if (thrownKind === "water" && targetKind === "fire") {
    return "water";
  }

  return thrownKind;
}

function computeMatchResult(match: MatchState): MatchResult {
  const players = Object.values(match.players).filter((player) => !player.eliminated);

  if (players.length === 0) {
    return {
      winnerPlayerIds: [],
      highestScore: 0,
      tiedOpenedTreasureCount: 0
    };
  }

  const highestScore = players.reduce((max, player) => Math.max(max, player.score), 0);
  const highestScorePlayers = players.filter((player) => player.score === highestScore);
  const tiedOpenedTreasureCount = highestScorePlayers.reduce((max, player) => {
    return Math.max(max, player.openedTreasureIds.length);
  }, 0);

  return {
    winnerPlayerIds: highestScorePlayers
      .filter((player) => player.openedTreasureIds.length === tiedOpenedTreasureCount)
      .map((player) => player.id),
    highestScore,
    tiedOpenedTreasureCount
  };
}

export function placeTreasure(
  match: MatchState,
  input: PlaceTreasureInput
): DomainMutationResult {
  assertTreasurePlacementPhase(match);

  const player = getPlayerOrThrow(match, input.playerId);

  if (player.eliminated) {
    throw new DomainError("PLAYER_ELIMINATED", "Eliminated players cannot place treasures.");
  }

  const treasure = match.treasures[input.treasureId];

  if (!treasure) {
    throw new DomainError("TREASURE_NOT_FOUND", "Unknown treasure.");
  }

  if (treasure.ownerPlayerId !== input.playerId) {
    throw new DomainError(
      "TREASURE_PLACEMENT_NOT_ALLOWED",
      "Players may only place their own treasure cards."
    );
  }

  if (treasure.slot === null) {
    throw new DomainError(
      "TREASURE_PLACEMENT_NOT_ALLOWED",
      "Fake treasure cards do not have a matching board token to place."
    );
  }

  if (!isWithinBoard(input.position)) {
    throw new DomainError("OUT_OF_BOUNDS", "Treasure placement must stay inside the board.");
  }

  if (!isTreasureInsideTreasurePlacementZone(match.settings, input.position)) {
    throw new DomainError(
      "INVALID_POSITION",
      "Treasure placement must stay inside the configured treasure zone."
    );
  }

  if (Object.values(match.treasures).some((candidate) => {
    return (
      candidate.id !== treasure.id &&
      candidate.position !== null &&
      isSamePosition(candidate.position, input.position)
    );
  })) {
    throw new DomainError(
      "INVALID_POSITION",
      "Another treasure already occupies that placement tile."
    );
  }

  let nextMatch = updateTreasure(match, {
    ...treasure,
    position: input.position
  });

  const events: DomainEvent[] = [
    {
      type: "treasurePlaced",
      playerId: input.playerId,
      treasureId: input.treasureId,
      position: input.position
    }
  ];

  if (areAllRoundTreasuresPlaced(nextMatch)) {
    nextMatch = {
      ...nextMatch,
      round: {
        ...nextMatch.round,
        phase: "auction"
      }
    };

    const offer = getCurrentAuctionOffer(nextMatch);

    if (offer) {
      events.push({
        type: "auctionOfferRevealed",
        offerSlot: offer.slot,
        cardType: offer.cardType
      });
    }
  }

  return {
    state: nextMatch,
    events
  };
}

export function submitAuctionBids(
  match: MatchState,
  playerId: PlayerId,
  bids: readonly AuctionBidState[]
): DomainMutationResult {
  assertAuctionPhase(match);

  const player = getPlayerOrThrow(match, playerId);
  const currentOffer = getCurrentAuctionOffer(match);

  if (!currentOffer) {
    throw new DomainError("ROUND_NOT_READY", "No current auction offer is available.");
  }

  if (player.eliminated) {
    throw new DomainError("PLAYER_ELIMINATED", "Eliminated players cannot bid.");
  }

  if (match.round.auction.submittedBids[playerId] !== null) {
    throw new DomainError(
      "AUCTION_BID_ALREADY_SUBMITTED",
      "Auction bids were already submitted for this player."
    );
  }

  if (bids.length > 1) {
    throw new DomainError(
      "INVALID_AUCTION_BID",
      "Sequential auction accepts at most one bid for the currently revealed offer."
    );
  }

  const bidAmount = bids[0]?.amount ?? 0;

  if (!Number.isInteger(bidAmount) || bidAmount < 0) {
    throw new DomainError(
      "INVALID_AUCTION_BID",
      "Auction bids must be non-negative integers."
    );
  }

  if (bids[0] && "offerSlot" in bids[0] && bids[0].offerSlot !== currentOffer.slot) {
    throw new DomainError(
      "INVALID_AUCTION_BID",
      "Bids may only target the currently revealed offer."
    );
  }

  const maxAffordableBid = Math.max(player.score, 0);

  if (bidAmount > maxAffordableBid) {
    throw new DomainError(
      "INVALID_AUCTION_BID",
      "An auction bid cannot exceed the player's current score."
    );
  }

  let nextMatch: MatchState = {
    ...match,
    round: {
      ...match.round,
      auction: {
        ...match.round.auction,
        submittedBids: {
          ...match.round.auction.submittedBids,
          [playerId]: {
            amount: bidAmount
          }
        }
      }
    }
  };
  const events: DomainEvent[] = [
    {
      type: "auctionBidSubmitted",
      playerId,
      bids: [{ amount: bidAmount }]
    }
  ];
  const allSubmitted = collectNonEliminatedPlayers(nextMatch).every((candidateId) => {
    return nextMatch.round.auction.submittedBids[candidateId] !== null;
  });

  if (!allSubmitted) {
    return {
      state: nextMatch,
      events
    };
  }

  const rankedBids = collectNonEliminatedPlayers(nextMatch)
    .map((candidateId) => {
      const bid = nextMatch.round.auction.submittedBids[candidateId];

      if (!bid || bid.amount <= 0) {
        return null;
      }

      return {
        playerId: candidateId,
        amount: bid.amount,
        seat: getPlayerOrThrow(nextMatch, candidateId).seat
      };
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.seat - right.seat;
    });

  const winner = rankedBids[0] ?? null;
  let resolvedOffers = {
    ...nextMatch.round.auction.resolvedOffers,
    [currentOffer.slot]: winner?.playerId ?? null
  };

  if (winner) {
    const awardedPlayer = getPlayerOrThrow(nextMatch, winner.playerId);
    nextMatch = updatePlayer(
      nextMatch,
      addSpecialCardToPlayer(
        {
          ...awardedPlayer,
          score: awardedPlayer.score - winner.amount
        },
        currentOffer.cardType
      )
    );
    events.push({
      type: "specialCardAwarded",
      playerId: winner.playerId,
      cardType: currentOffer.cardType,
      cost: winner.amount
    });
  }

  const nextOfferIndex = nextMatch.round.auction.currentOfferIndex + 1;
  const isAuctionComplete = nextOfferIndex >= nextMatch.round.auction.offers.length;

  nextMatch = {
    ...nextMatch,
    round: {
      ...nextMatch.round,
      phase: isAuctionComplete ? "prioritySubmission" : "auction",
      auction: {
        ...nextMatch.round.auction,
        currentOfferIndex: isAuctionComplete ? nextMatch.round.auction.currentOfferIndex : nextOfferIndex,
        submittedBids: resetAuctionSubmissions(nextMatch),
        resolvedOffers,
        resolved: isAuctionComplete
      }
    }
  };

  events.push({
    type: "auctionResolved",
    winners: resolvedOffers
  });

  if (!isAuctionComplete) {
    const nextOffer = getCurrentAuctionOffer(nextMatch);

    if (nextOffer) {
      events.push({
        type: "auctionOfferRevealed",
        offerSlot: nextOffer.slot,
        cardType: nextOffer.cardType
      });
    }
  }

  return {
    state: nextMatch,
    events
  };
}

export function submitPriorityCard(
  match: MatchState,
  playerId: PlayerId,
  priorityCard: PriorityCard
): DomainMutationResult {
  assertPrioritySubmissionPhase(match);

  const player = getPlayerOrThrow(match, playerId);

  if (player.eliminated) {
    throw new DomainError("PLAYER_ELIMINATED", "Eliminated players cannot submit priority.");
  }

  if (match.round.submittedPriorityCards[playerId] !== null) {
    throw new DomainError(
      "PRIORITY_ALREADY_SUBMITTED",
      "This player already submitted a priority card."
    );
  }

  if (!player.availablePriorityCards.includes(priorityCard)) {
    throw new DomainError(
      "PRIORITY_CARD_NOT_AVAILABLE",
      "The chosen priority card is not available for this player."
    );
  }

  const remainingCards = player.availablePriorityCards.filter((card) => card !== priorityCard);
  const updatedPlayer: PlayerState = {
    ...player,
    availablePriorityCards:
      remainingCards.length === 0 ? [...PRIORITY_CARD_VALUES] : remainingCards
  };
  const submittedPriorityCards = {
    ...match.round.submittedPriorityCards,
    [playerId]: priorityCard
  };

  let nextMatch = updatePlayer(match, updatedPlayer);
  nextMatch = {
    ...nextMatch,
    round: {
      ...nextMatch.round,
      submittedPriorityCards
    }
  };

  const events: DomainEvent[] = [
    {
      type: "prioritySubmitted",
      playerId,
      priorityCard
    }
  ];

  const allSubmitted = collectNonEliminatedPlayers(nextMatch).every((candidateId) => {
    return nextMatch.round.submittedPriorityCards[candidateId] !== null;
  });

  if (!allSubmitted) {
    return {
      state: nextMatch,
      events
    };
  }

  const turnOrder = resolvePriorityTurnOrder(nextMatch, submittedPriorityCards);
  const preparedMatch: MatchState = {
    ...nextMatch,
    round: {
      ...nextMatch.round,
      phase: "inTurn",
      turnOrder,
      activePlayerId: null,
      turn: null
    }
  };
  const firstPlayerId = turnOrder[0];

  if (!firstPlayerId) {
    throw new DomainError("ROUND_NOT_READY", "No turn order could be resolved.");
  }

  const activated = activateTurn(preparedMatch, 0, preparedMatch.round.turnNumber);

  return {
    state: activated.state,
    events: [
      ...events,
      {
        type: "roundStarted",
        roundNumber: activated.state.round.roundNumber,
        turnOrder,
        firstPlayerId
      },
      ...activated.events
    ]
  };
}

export function moveActivePlayer(
  match: MatchState,
  playerId: PlayerId,
  direction: Direction
): DomainMutationResult {
  const { player, stage } = assertMovementTurn(match, playerId);
  const moveDistance = getMoveDistanceForStage(stage);
  const movePath = collectMovePath(player.position, direction, moveDistance);
  const nextPosition = movePath[movePath.length - 1];

  if (!nextPosition) {
    throw new DomainError("INVALID_POSITION", "Movement distance must be positive.");
  }

  assertMovePathEnterable(match, movePath);

  let nextMatch = updatePlayer(match, {
    ...player,
    position: nextPosition
  });
  const events: DomainEvent[] = [
    {
      type: "playerMoved",
      playerId,
      from: player.position,
      to: nextPosition,
      direction
    }
  ];

  const tileEffect = applyTileEffectToPlayer(
    nextMatch,
    playerId,
    getTileKind(nextMatch.board, nextPosition),
    true
  );
  nextMatch = tileEffect.state;
  events.push(...tileEffect.events);

  const treasure = findTreasureAtPosition(nextMatch, nextPosition);
  const movedPlayer = getPlayerOrThrow(nextMatch, playerId);

  if (treasure && !movedPlayer.eliminated && movedPlayer.carriedTreasureId === null) {
    const pickedUpTreasure: TreasureState = {
      ...treasure,
      position: null,
      carriedByPlayerId: playerId
    };
    nextMatch = updatePlayer(nextMatch, {
      ...movedPlayer,
      carriedTreasureId: pickedUpTreasure.id
    });
    nextMatch = updateTreasure(nextMatch, pickedUpTreasure);
    events.push({
      type: "treasurePickedUp",
      playerId,
      treasureId: pickedUpTreasure.id,
      position: nextPosition
    });

    const turnAdvance = advanceTurn(nextMatch, playerId);
    return {
      state: turnAdvance.state,
      events: [...events, ...turnAdvance.events]
    };
  }

  if (stage === "mandatoryStep") {
    nextMatch = {
      ...nextMatch,
      round: {
        ...nextMatch.round,
        turn: {
          playerId,
          stage: "secondaryAction",
          mandatoryStepDirection: direction
        }
      }
    };
    events.push({
      type: "turnStageChanged",
      playerId,
      stage: "secondaryAction"
    });
  }

  if (tileEffect.endsTurnImmediately || getPlayerOrThrow(nextMatch, playerId).eliminated) {
    const turnAdvance = advanceTurn(nextMatch, playerId);
    return {
      state: turnAdvance.state,
      events: [...events, ...turnAdvance.events]
    };
  }

  if (stage === "secondaryAction") {
    const turnAdvance = advanceTurn(nextMatch, playerId);
    return {
      state: turnAdvance.state,
      events: [...events, ...turnAdvance.events]
    };
  }

  return {
    state: nextMatch,
    events
  };
}

export function endTurn(match: MatchState, playerId: PlayerId): DomainMutationResult {
  assertSecondaryActionTurn(match, playerId);
  return advanceTurn(match, playerId);
}

export function openCarriedTreasure(
  match: MatchState,
  playerId: PlayerId
): DomainMutationResult {
  const player = assertTreasureOpenTurn(match, playerId);

  if (player.carriedTreasureId === null) {
    throw new DomainError(
      "PLAYER_NOT_CARRYING_TREASURE",
      "The player is not carrying a treasure."
    );
  }

  if (!isSamePosition(player.position, player.startPosition)) {
    throw new DomainError(
      "TREASURE_NOT_AT_START",
      "Treasures may only be opened at the owner's starting tile."
    );
  }

  const treasure = match.treasures[player.carriedTreasureId];

  if (!treasure) {
    throw new DomainError("TREASURE_NOT_FOUND", "Unknown treasure.");
  }

  if (treasure.openedByPlayerId !== null) {
    throw new DomainError(
      "TREASURE_ALREADY_OPENED",
      "This treasure was already opened."
    );
  }

  const updatedPlayer: PlayerState = {
    ...player,
    carriedTreasureId: null,
    score: player.score + treasure.points,
    openedTreasureIds: [...player.openedTreasureIds, treasure.id]
  };
  const openedTreasure: TreasureState = {
    ...treasure,
    carriedByPlayerId: null,
    openedByPlayerId: player.id
  };
  const openedTreasureCount = match.round.openedTreasureCount + 1;
  const completed = openedTreasureCount >= match.settings.roundOpenTreasureTarget;
  let nextMatch = updatePlayer(match, updatedPlayer);
  nextMatch = updateTreasure(nextMatch, openedTreasure);
  nextMatch = {
    ...nextMatch,
    round: {
      ...nextMatch.round,
      openedTreasureCount,
      phase: completed ? "completed" : nextMatch.round.phase,
      activePlayerId: completed ? null : nextMatch.round.activePlayerId,
      turn: completed ? null : nextMatch.round.turn
    }
  };
  const events: DomainEvent[] = [
    {
      type: "treasureOpened",
      playerId: player.id,
      treasureId: treasure.id,
      points: treasure.points
    }
  ];

  if (completed) {
    return {
      state: nextMatch,
      events: [
        ...events,
        {
          type: "roundCompleted",
          roundNumber: nextMatch.round.roundNumber,
          openedTreasureCount
        }
      ]
    };
  }

  const turnAdvance = advanceTurn(nextMatch, player.id);

  return {
    state: turnAdvance.state,
    events: [...events, ...turnAdvance.events]
  };
}

export function throwTile(
  match: MatchState,
  input: ThrowTileInput
): DomainMutationResult {
  const player = assertSecondaryActionTurn(match, input.playerId);
  assertPlayerCanUseBoardAction(player);

  if (!areOrthogonallyAdjacent(player.position, input.source)) {
    throw new DomainError(
      "INVALID_TILE_SOURCE",
      "The thrown tile must be orthogonally adjacent to the active player."
    );
  }

  if (!isWithinBoard(input.target)) {
    throw new DomainError(
      "INVALID_THROW_TARGET",
      "The throw target must stay inside the board."
    );
  }

  const throwDirection = cardinalDirectionBetween(input.source, input.target);
  const throwDistance = cardinalLineDistance(input.source, input.target);

  if (throwDirection === null || throwDistance === null || throwDistance < 1 || throwDistance > 3) {
    throw new DomainError(
      "INVALID_THROW_TARGET",
      "Thrown tiles must target a straight line up to three tiles away."
    );
  }

  const sourceKind = getTileKind(match.board, input.source);

  if (!THROWABLE_TILE_KINDS.includes(sourceKind)) {
    throw new DomainError(
      "TILE_NOT_THROWABLE",
      "Only elemental fire, water, and electric tiles are currently throwable."
    );
  }

  const beforeBoard = match.board;
  let nextBoard = setTileKind(beforeBoard, input.source, "plain");
  nextBoard = setTileKind(
    nextBoard,
    input.target,
    resolveThrownTileResult(getTileKind(beforeBoard, input.target), sourceKind)
  );
  const normalizedBoard = normalizeBoardAfterMutation(nextBoard, [input.source, input.target]);
  let nextMatch: MatchState = {
    ...match,
    board: normalizedBoard.board
  };
  const boardChangePositions = [
    input.source,
    input.target,
    ...normalizedBoard.changes.map((change) => change.position)
  ];
  const events: DomainEvent[] = [
    {
      type: "tileThrown",
      playerId: input.playerId,
      source: input.source,
      target: input.target,
      tileKind: sourceKind
    },
    ...collectTileChangeEvents(beforeBoard, normalizedBoard.board, boardChangePositions)
  ];

  const impactedPlayers = Object.values(nextMatch.players).filter((candidate) => {
    return !candidate.eliminated && isSamePosition(candidate.position, input.target);
  });

  for (const impactedPlayer of impactedPlayers) {
    const effect = applyTileEffectToPlayer(
      nextMatch,
      impactedPlayer.id,
      sourceKind,
      impactedPlayer.id === input.playerId
    );
    nextMatch = effect.state;
    events.push(...effect.events);
  }

  const turnAdvance = advanceTurn(nextMatch, input.playerId);

  return {
    state: turnAdvance.state,
    events: [...events, ...turnAdvance.events]
  };
}

function performRotation(match: MatchState, input: RotateTilesInput): DomainMutationResult {
  if (!isValidRotationSelection(input.selection)) {
    throw new DomainError(
      "INVALID_ROTATION_SELECTION",
      "The chosen rotation selection is invalid or out of bounds."
    );
  }

  const selectionPositions = getRotationSelectionPositions(input.selection);
  const occupied = Object.values(match.players).find((candidate) => {
    return (
      !candidate.eliminated &&
      selectionPositions.some((position) => isSamePosition(position, candidate.position))
    );
  });

  if (occupied) {
    throw new DomainError(
      "ROTATION_BLOCKED_BY_PLAYER",
      "Tiles occupied by a player cannot be rotated."
    );
  }

  for (const fence of Object.values(match.board.fences)) {
    const insideCount = fence.positions.filter((position) => {
      return selectionPositions.some((candidate) => isSamePosition(candidate, position));
    }).length;

    if (insideCount > 0 && insideCount < fence.positions.length) {
      throw new DomainError(
        "INVALID_ROTATION_SELECTION",
        "Fences cannot cross the boundary between rotated and non-rotated tiles."
      );
    }
  }

  const mapping = getRotationPositionMapping(input.selection, input.direction);
  const beforeBoard = match.board;
  const beforeTreasures = match.treasures;
  const outputPositions = [...mapping.values()];
  const affectedPositions = new Map<string, Position>();

  for (const position of [...selectionPositions, ...outputPositions]) {
    affectedPositions.set(positionKey(position), position);
  }

  let nextBoard = beforeBoard;

  for (const position of affectedPositions.values()) {
    nextBoard = setTileKind(nextBoard, position, "plain");
  }

  for (const position of selectionPositions) {
    const tileKind = getTileKind(beforeBoard, position);
    const mappedPosition = mapping.get(positionKey(position));

    if (!mappedPosition || tileKind === "plain") {
      continue;
    }

    nextBoard = setTileKind(nextBoard, mappedPosition, tileKind);
  }

  for (const fence of Object.values(beforeBoard.fences)) {
    const mappedFencePositions = fence.positions.map((position) => {
      return mapping.get(positionKey(position)) ?? position;
    }) as [Position, Position];

    nextBoard = removeFence(nextBoard, fence.id);
    nextBoard = upsertFence(nextBoard, {
      id: fence.id,
      positions: mappedFencePositions
    });
  }

  const normalizedBoard = normalizeBoardAfterMutation(nextBoard, [...affectedPositions.values()]);
  let nextMatch = updateBoard(match, normalizedBoard.board);
  const treasureEvents: DomainEvent[] = [];
  const fenceEvents: DomainEvent[] = [];

  for (const treasure of Object.values(beforeTreasures)) {
    if (
      treasure.position === null ||
      treasure.carriedByPlayerId !== null ||
      treasure.openedByPlayerId !== null ||
      treasure.removedFromRound
    ) {
      continue;
    }

    const mappedPosition = mapping.get(positionKey(treasure.position));

    if (!mappedPosition) {
      continue;
    }

    nextMatch = updateTreasure(nextMatch, {
      ...treasure,
      position: mappedPosition
    });
    treasureEvents.push({
      type: "treasureMoved",
      treasureId: treasure.id,
      from: treasure.position,
      to: mappedPosition
    });
  }

  for (const fence of Object.values(beforeBoard.fences)) {
    const insideCount = fence.positions.filter((position) => {
      return selectionPositions.some((candidate) => isSamePosition(candidate, position));
    }).length;

    if (insideCount === fence.positions.length) {
      fenceEvents.push({
        type: "fenceRemoved",
        fenceId: fence.id
      });
      fenceEvents.push({
        type: "fencePlaced",
        fenceId: fence.id,
        positions:
          nextMatch.board.fences[fence.id]?.positions ??
          fence.positions
      });
    }
  }

  const boardEvents = collectTileChangeEvents(
    beforeBoard,
    nextMatch.board,
    [...affectedPositions.values(), ...normalizedBoard.changes.map((change) => change.position)]
  );
  const turnAdvance = advanceTurn(nextMatch, input.playerId);

  return {
    state: turnAdvance.state,
    events: [
      {
        type: "boardRotated",
        playerId: input.playerId,
        selectionKind: input.selection.kind,
        direction: input.direction,
        positions: selectionPositions
      },
      ...boardEvents,
      ...fenceEvents,
      ...treasureEvents,
      ...turnAdvance.events
    ]
  };
}

export function rotateTiles(
  match: MatchState,
  input: RotateTilesInput
): DomainMutationResult {
  const player = assertSecondaryActionTurn(match, input.playerId);
  assertPlayerCanUseBoardAction(player);

  if (input.selection.kind !== "square2") {
    throw new DomainError(
      "INVALID_ROTATION_SELECTION",
      "Expanded 5-tile and 6-tile rotations require hammer special cards."
    );
  }

  return performRotation(match, input);
}

function removeSpecialCardFromPlayer(
  player: PlayerState,
  cardType: SpecialCardType,
  chargeCost = 1
): PlayerState {
  const currentCharges = player.specialInventory[cardType];

  if (currentCharges < chargeCost) {
    throw new DomainError(
      "SPECIAL_CARD_NOT_OWNED",
      "The player does not own the requested special card."
    );
  }

  return {
    ...player,
    specialInventory: {
      ...player.specialInventory,
      [cardType]: currentCharges - chargeCost
    }
  };
}

function addSpecialCardToPlayer(
  player: PlayerState,
  cardType: SpecialCardType
): PlayerState {
  return {
    ...player,
    specialInventory: {
      ...player.specialInventory,
      [cardType]: player.specialInventory[cardType] + SPECIAL_CARD_CHARGE_BUNDLE[cardType]
    }
  };
}

function createClearedStatusState(): PlayerStatusState {
  return {
    fire: false,
    water: false,
    skipNextTurnCount: 0,
    movementLimit: null
  };
}

function getOppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case "north":
      return "south";
    case "east":
      return "west";
    case "south":
      return "north";
    case "west":
      return "east";
  }
}

function resolveSpecialMovement(
  match: MatchState,
  playerId: PlayerId,
  nextPosition: Position
): DomainMutationResult {
  const player = getPlayerOrThrow(match, playerId);
  const direction = cardinalDirectionBetween(player.position, nextPosition);

  if (!direction || !isWithinBoard(nextPosition)) {
    throw new DomainError(
      "INVALID_SPECIAL_CARD_TARGET",
      "Special movement must resolve to an in-bounds straight-line destination."
    );
  }

  if (isFenceBlockingPosition(match.board, nextPosition)) {
    throw new DomainError(
      "MOVEMENT_BLOCKED_BY_FENCE",
      "Players cannot end special movement on a fenced tile."
    );
  }

  let nextMatch = updatePlayer(match, {
    ...player,
    position: nextPosition
  });
  const events: DomainEvent[] = [
    {
      type: "playerMoved",
      playerId,
      from: player.position,
      to: nextPosition,
      direction
    }
  ];

  const tileEffect = applyTileEffectToPlayer(
    nextMatch,
    playerId,
    getTileKind(nextMatch.board, nextPosition),
    true
  );
  nextMatch = tileEffect.state;
  events.push(...tileEffect.events);

  const movedPlayer = getPlayerOrThrow(nextMatch, playerId);
  const treasure = findTreasureAtPosition(nextMatch, nextPosition);

  if (treasure && !movedPlayer.eliminated && movedPlayer.carriedTreasureId === null) {
    const pickedUpTreasure: TreasureState = {
      ...treasure,
      position: null,
      carriedByPlayerId: playerId
    };
    nextMatch = updatePlayer(nextMatch, {
      ...movedPlayer,
      carriedTreasureId: pickedUpTreasure.id
    });
    nextMatch = updateTreasure(nextMatch, pickedUpTreasure);
    events.push({
      type: "treasurePickedUp",
      playerId,
      treasureId: pickedUpTreasure.id,
      position: nextPosition
    });

    const turnAdvance = advanceTurn(nextMatch, playerId);
    return {
      state: turnAdvance.state,
      events: [...events, ...turnAdvance.events]
    };
  }

  if (tileEffect.endsTurnImmediately || getPlayerOrThrow(nextMatch, playerId).eliminated) {
    const turnAdvance = advanceTurn(nextMatch, playerId);
    return {
      state: turnAdvance.state,
      events: [...events, ...turnAdvance.events]
    };
  }

  const turnAdvance = advanceTurn(nextMatch, playerId);
  return {
    state: turnAdvance.state,
    events: [...events, ...turnAdvance.events]
  };
}

export function purchaseSpecialCard(
  match: MatchState,
  playerId: PlayerId,
  cardType: SpecialCardType
): DomainMutationResult {
  assertAuctionPhase(match);

  const purchaseCost = getDirectPurchaseCost(cardType);

  if (purchaseCost === null) {
    throw new DomainError(
      "INVALID_SPECIAL_CARD_TARGET",
      "Only fence and large fence cards may be purchased directly during the auction phase."
    );
  }

  const player = getPlayerOrThrow(match, playerId);

  if (player.eliminated) {
    throw new DomainError("PLAYER_ELIMINATED", "Eliminated players cannot buy special cards.");
  }

  if (match.round.auction.submittedBids[playerId] !== null) {
    throw new DomainError(
      "AUCTION_BID_ALREADY_SUBMITTED",
      "Direct-purchase fence cards must be purchased before the current auction bid is submitted."
    );
  }

  if (player.score < purchaseCost) {
    throw new DomainError(
      "INVALID_AUCTION_BID",
      `A player needs at least ${purchaseCost} score to buy this card.`
    );
  }

  const updatedPlayer = addSpecialCardToPlayer(
    {
      ...player,
      score: player.score - purchaseCost
    },
    cardType
  );

  return {
    state: updatePlayer(match, updatedPlayer),
    events: [
      {
        type: "specialCardPurchased",
        playerId,
        cardType,
        cost: purchaseCost
      }
    ]
  };
}

export function useSpecialCard(
  match: MatchState,
  input: UseSpecialCardInput
): DomainMutationResult {
  const player = assertSecondaryActionTurn(match, input.playerId);
  assertPlayerCanUseBoardAction(player);

  let nextMatch = updatePlayer(match, removeSpecialCardFromPlayer(player, input.cardType));
  const events: DomainEvent[] = [
    {
      type: "specialCardUsed",
      playerId: input.playerId,
      cardType: input.cardType
    }
  ];

  if (input.cardType === "largeHammer") {
    if (!input.selection || !input.direction) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Large hammer cards require a rotation selection and direction."
      );
    }

    if (
      input.selection.kind !== "cross5" &&
      input.selection.kind !== "rectangle6"
    ) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Large hammer cards may only unlock cross5 or rectangle6 rotations."
      );
    }

    const rotation = performRotation(nextMatch, {
      playerId: input.playerId,
      selection: input.selection,
      direction: input.direction
    });

    return {
      state: rotation.state,
      events: [...events, ...rotation.events]
    };
  }

  if (input.cardType === "fence" || input.cardType === "largeFence") {
    const fencePositions = input.fencePositions;
    const expectedLength = input.cardType === "largeFence" ? 3 : 2;

    if (
      !fencePositions ||
      !validateFencePlacement(fencePositions, expectedLength)
    ) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        expectedLength === 3
          ? "Large fence cards require three straight orthogonally adjacent in-bounds positions."
          : "Fence cards require two orthogonally adjacent in-bounds positions."
      );
    }

    const fenceId = `${input.cardType}-${nextMatch.round.roundNumber}-${nextMatch.round.turnNumber}-${input.playerId}`;
    nextMatch = updateBoard(
      nextMatch,
      upsertFence(nextMatch.board, {
        id: fenceId,
        positions: fencePositions
      })
    );
    events.push({
      type: "fencePlaced",
      fenceId,
      positions: fencePositions
    });
    const turnAdvance = advanceTurn(nextMatch, input.playerId);
    return {
      state: turnAdvance.state,
      events: [...events, ...turnAdvance.events]
    };
  }

  if (input.cardType === "coldBomb") {
    if (input.targetPlayerId) {
      const target = getPlayerOrThrow(nextMatch, input.targetPlayerId);

      if (!isBombTargetInRange(player.position, target.position)) {
        throw new DomainError(
          "INVALID_SPECIAL_CARD_TARGET",
          "Cold bombs require a target within 3 tiles in a straight line."
        );
      }

      const updatedTarget: PlayerState = {
        ...target,
        status: {
          ...target.status,
          movementLimit: 1
        }
      };
      nextMatch = updatePlayer(nextMatch, updatedTarget);
      events.push(createStatusChangedEvent(updatedTarget));
    } else if (input.targetPosition) {
      if (!isBombTargetInRange(player.position, input.targetPosition)) {
        throw new DomainError(
          "INVALID_SPECIAL_CARD_TARGET",
          "Cold bombs require a target within 3 tiles in a straight line."
        );
      }

      if (getTileKind(nextMatch.board, input.targetPosition) !== "water") {
        throw new DomainError(
          "INVALID_SPECIAL_CARD_TARGET",
          "Cold bombs currently require a water tile target or a player target."
        );
      }

      const beforeBoard = nextMatch.board;
      nextMatch = updateBoard(nextMatch, setTileKind(nextMatch.board, input.targetPosition, "ice"));
      events.push(...collectTileChangeEvents(beforeBoard, nextMatch.board, [input.targetPosition]));
    } else {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Cold bombs require a target player or target position."
      );
    }
  }

  if (input.cardType === "recoveryPotion") {
    const refreshedPlayer = getPlayerOrThrow(nextMatch, input.playerId);
    const updatedPlayer: PlayerState = {
      ...refreshedPlayer,
      hitPoints: nextMatch.settings.startingHitPoints,
      status: createClearedStatusState()
    };
    nextMatch = updatePlayer(nextMatch, updatedPlayer);
    events.push({
      type: "playerDamaged",
      playerId: input.playerId,
      amount: 0,
      remainingHitPoints: updatedPlayer.hitPoints
    });
    events.push(createStatusChangedEvent(updatedPlayer));
  }

  if (input.cardType === "flameBomb" || input.cardType === "electricBomb") {
    if (!input.targetPosition) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Bomb cards require a target position."
      );
    }

    const resolution = runResolutionPipeline({
      match: nextMatch,
      actorPlayerId: input.playerId,
      steps: [
        {
          kind: "removeFenceAt",
          position: input.targetPosition
        },
        ...createBombResolutionPlan(nextMatch, {
          playerId: input.playerId,
          cardType: input.cardType,
          targetPosition: input.targetPosition
        })
      ]
    });

    nextMatch = resolution.state;
    events.push(...resolution.events);
  }

  if (input.cardType === "jump") {
    if (!input.targetPosition) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Jump cards require a target destination."
      );
    }

    const currentPlayer = getPlayerOrThrow(nextMatch, input.playerId);
    const jumpDirection = cardinalDirectionBetween(currentPlayer.position, input.targetPosition);

    if (
      !jumpDirection ||
      cardinalLineDistance(currentPlayer.position, input.targetPosition) !== 2
    ) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Jump cards must land exactly two tiles away in a straight line."
      );
    }

    const movement = resolveSpecialMovement(nextMatch, input.playerId, input.targetPosition);
    return {
      state: movement.state,
      events: [...events, ...movement.events]
    };
  }

  if (input.cardType === "hook") {
    if (!input.targetPlayerId) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Hook cards require a player target."
      );
    }

    const sourcePlayer = getPlayerOrThrow(nextMatch, input.playerId);
    const targetPlayer = getPlayerOrThrow(nextMatch, input.targetPlayerId);
    const hookDirection = cardinalDirectionBetween(sourcePlayer.position, targetPlayer.position);
    const targetDistance = cardinalLineDistance(sourcePlayer.position, targetPlayer.position);

    if (!hookDirection || targetDistance === null || targetDistance < 2 || targetDistance > 4) {
      throw new DomainError(
        "INVALID_SPECIAL_CARD_TARGET",
        "Hook cards require a player two to four tiles away in a straight line."
      );
    }

    const landingPosition = movePosition(
      targetPlayer.position,
      getOppositeDirection(hookDirection)
    );
    const movement = resolveSpecialMovement(nextMatch, input.playerId, landingPosition);
    return {
      state: movement.state,
      events: [...events, ...movement.events]
    };
  }

  const turnAdvance = advanceTurn(nextMatch, input.playerId);
  return {
    state: turnAdvance.state,
    events: [...events, ...turnAdvance.events]
  };
}

export function prepareNextRound(
  match: MatchState,
  input: PrepareNextRoundInput = {}
): DomainMutationResult {
  assertMatchActive(match);

  if (match.round.phase !== "completed") {
    throw new DomainError(
      "ROUND_NOT_READY",
      "The next round may only be prepared after the current round completes."
    );
  }

  if (match.round.roundNumber >= match.settings.totalRounds) {
    const result = computeMatchResult(match);
    const completedMatch: MatchState = {
      ...match,
      completed: true,
      result
    };
    return {
      state: completedMatch,
      events: [
        {
          type: "matchCompleted",
          result
        }
      ]
    };
  }

  let nextMatch = match;

  for (const player of Object.values(match.players)) {
    nextMatch = updatePlayer(nextMatch, {
      ...player,
      position: player.startPosition,
      carriedTreasureId: null,
      status: {
        fire: false,
        water: false,
        skipNextTurnCount: 0,
        movementLimit: null
      }
    });
  }

  for (const treasure of Object.values(match.treasures)) {
    const placement = input.treasurePlacements?.[treasure.id] ?? null;
    nextMatch = updateTreasure(nextMatch, {
      ...treasure,
      position: placement,
      carriedByPlayerId: null,
      openedByPlayerId: null,
      removedFromRound: false
    });
  }

  const auction = drawAuctionOffers(nextMatch);
  nextMatch = {
    ...nextMatch,
    round: {
      roundNumber: match.round.roundNumber + 1,
      turnNumber: 1,
      phase: Object.keys(nextMatch.treasures).length > 0 ? "treasurePlacement" : "auction",
      activePlayerId: null,
      openedTreasureCount: 0,
      turnOrder: [],
      submittedPriorityCards: Object.fromEntries(
        match.playerOrder.map((playerId) => [playerId, null])
      ),
      turn: null,
      auction: {
        offers: auction.offers,
        currentOfferIndex: 0,
        submittedBids: resetAuctionSubmissions(match),
        resolvedOffers: createResolvedOffers(auction.offers),
        resolved: false
      }
    },
    specialCardDeckIndex: auction.nextDeckIndex
  };

  return {
    state: nextMatch,
    events: [
      {
        type: "nextRoundPrepared",
        roundNumber: nextMatch.round.roundNumber,
        revealedAuctionCardTypes:
          nextMatch.round.phase === "auction"
            ? nextMatch.round.auction.offers
                .slice(0, 1)
                .map((offer) => offer.cardType)
            : []
      }
    ]
  };
}
