import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  createMatchState,
  resolvePriorityTurnOrder,
  type MatchState,
  type PlayerId,
  type PriorityCard
} from "./index.ts";
import { priorityCardArbitrary } from "../../testkit/src/index.ts";

interface PriorityCase {
  readonly cards: readonly PriorityCard[];
  readonly eliminatedSeats: readonly number[];
}

const priorityCaseArbitrary: fc.Arbitrary<PriorityCase> = fc
  .integer({ min: 2, max: 4 })
  .chain((playerCount) =>
    fc.record({
      cards: fc.array(priorityCardArbitrary, {
        minLength: playerCount,
        maxLength: playerCount
      }),
      eliminatedSeats: fc.uniqueArray(fc.integer({ min: 0, max: playerCount - 1 }), {
        maxLength: playerCount
      })
    })
  );

function withEliminatedSeats(match: MatchState, seats: readonly number[]): MatchState {
  const eliminatedSeatSet = new Set(seats);
  const players = Object.fromEntries(
    Object.entries(match.players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        eliminated: eliminatedSeatSet.has(player.seat)
      }
    ])
  );

  return {
    ...match,
    players
  };
}

function uniqueCardsFirst(
  cardsByPlayerId: Readonly<Record<PlayerId, PriorityCard>>,
  order: readonly PlayerId[]
): boolean {
  const counts = new Map<PriorityCard, number>();

  for (const card of Object.values(cardsByPlayerId)) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }

  const firstTiedIndex = order.findIndex(
    (playerId) => counts.get(cardsByPlayerId[playerId] as PriorityCard) !== 1
  );

  if (firstTiedIndex === -1) {
    return true;
  }

  return order
    .slice(firstTiedIndex)
    .every((playerId) => counts.get(cardsByPlayerId[playerId] as PriorityCard) !== 1);
}

test("priority resolution includes every active submitted player exactly once", () => {
  fc.assert(
    fc.property(priorityCaseArbitrary, ({ cards, eliminatedSeats }) => {
      const players = cards.map((_, index) => ({
        id: `player-${index + 1}`,
        name: `Player ${index + 1}`
      }));
      const match = withEliminatedSeats(
        createMatchState({
          matchId: "priority-property",
          players
        }),
        eliminatedSeats
      );
      const submissions = Object.fromEntries(
        cards.map((card, index) => [`player-${index + 1}`, card])
      ) as Readonly<Record<PlayerId, PriorityCard>>;
      const order = resolvePriorityTurnOrder(match, submissions);
      const expectedActive = match.playerOrder.filter(
        (playerId) => !match.players[playerId]?.eliminated
      );

      assert.deepEqual(new Set(order), new Set(expectedActive));
      assert.equal(order.length, expectedActive.length);
      assert.equal(new Set(order).size, order.length);
    }),
    { numRuns: 500 }
  );
});

test("priority resolution puts unique cards before tied cards and sorts unique cards descending", () => {
  fc.assert(
    fc.property(priorityCaseArbitrary, ({ cards, eliminatedSeats }) => {
      const players = cards.map((_, index) => ({
        id: `player-${index + 1}`,
        name: `Player ${index + 1}`
      }));
      const match = withEliminatedSeats(
        createMatchState({
          matchId: "priority-property",
          players
        }),
        eliminatedSeats
      );
      const submissions = Object.fromEntries(
        cards.map((card, index) => [`player-${index + 1}`, card])
      ) as Readonly<Record<PlayerId, PriorityCard>>;
      const order = resolvePriorityTurnOrder(match, submissions);
      const activeSubmissions = Object.fromEntries(
        Object.entries(submissions).filter(([playerId]) => !match.players[playerId]?.eliminated)
      ) as Readonly<Record<PlayerId, PriorityCard>>;
      const cardCounts = new Map<PriorityCard, number>();

      for (const card of Object.values(activeSubmissions)) {
        cardCounts.set(card, (cardCounts.get(card) ?? 0) + 1);
      }

      const uniquePrefix = order.filter(
        (playerId) => cardCounts.get(activeSubmissions[playerId] as PriorityCard) === 1
      );
      const uniqueCards = uniquePrefix.map(
        (playerId) => activeSubmissions[playerId] as PriorityCard
      );
      const sortedUniqueCards = [...uniqueCards].sort((left, right) => right - left);

      assert.equal(uniqueCardsFirst(activeSubmissions, order), true);
      assert.deepEqual(uniqueCards, sortedUniqueCards);
    }),
    { numRuns: 500 }
  );
});
