# Fast-Check Rule Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add property-based rule validation with fast-check for the renderer-agnostic Project. BH domain layer.

**Architecture:** Property tests stay in `packages/domain/src` and reusable generators stay in `packages/testkit/src`, preserving the domain/application/protocol boundaries. The first slice covers pure deterministic rules, then expands to domain command sequences and protocol-shaped inputs without moving gameplay logic into React or transport code.

**Tech Stack:** TypeScript, Node test runner, `node --experimental-strip-types --test`, fast-check, existing `@project-bh/domain` and `@project-bh/testkit` fixtures.

---

## File Structure

- Modify: `package.json`
  - Add fast-check as a root dev dependency so all workspace tests can import it.
- Modify: `pnpm-lock.yaml`
  - Updated by `pnpm add -Dw fast-check`.
- Create: `packages/testkit/src/property-arbitraries.ts`
  - Shared fast-check arbitraries for domain tests only.
- Modify: `packages/testkit/src/index.ts`
  - Re-export property arbitraries.
- Create: `packages/domain/src/rotation.property.test.ts`
  - Pure rotation mapping invariants.
- Create: `packages/domain/src/board-normalization.property.test.ts`
  - Fire/water cluster normalization invariants.
- Create: `packages/domain/src/priority.property.test.ts`
  - Priority ordering invariants over generated submissions and eliminated players.
- Create: `packages/domain/src/domain-command-sequence.property.test.ts`
  - Small deterministic command-sequence invariant smoke test.
- Modify: `docs/testing/test-strategy.md`
  - Document when property tests are required and how to reproduce failures.

---

## Rule Validation Strategy

Start with properties that are broad, deterministic, and cheap:

1. **Rotation mapping is a bijection.**
   - Every selected source maps to exactly one selected destination.
   - Clockwise followed by counterclockwise restores every source.
   - No generated valid selection leaves the board.

2. **Board normalization converges.**
   - Normalizing the same board twice produces no further tile-kind changes.
   - Fire components of size at least 3 become `giantFlame`; smaller fire components stay `fire`.
   - Water components of size at least 3 become `river`; smaller water components stay `water`.

3. **Priority order is deterministic and complete.**
   - Output players are exactly non-eliminated players with submitted priority cards.
   - No duplicates appear in `turnOrder`.
   - Unique card submissions are sorted before tied card submissions.
   - Unique card submissions are sorted by descending card value.

4. **Legal command sequences preserve global invariants.**
   - Player positions stay inside the board.
   - No player carries more than one treasure.
   - A treasure is in exactly one location state: board, carried, opened, or removed.
   - Replaying the same generated sequence from the same initial state produces equal final state and events.

These properties complement example tests. They do not replace scenario fixtures for specific rules such as electric/water stun, treasure opening, or end-of-round scoring.

---

### Task 1: Add fast-check to the workspace

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add dependency**

Run:

```bash
pnpm add -Dw fast-check
```

Expected: `package.json` gains a root `devDependencies.fast-check` entry and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Run the existing domain tests before adding properties**

Run:

```bash
pnpm test
```

Expected: all current tests pass before property tests are introduced.

- [ ] **Step 3: Commit dependency setup**

```bash
git add package.json pnpm-lock.yaml
git commit -m "test: add fast-check for domain property tests"
```

---

### Task 2: Add shared property arbitraries

**Files:**
- Create: `packages/testkit/src/property-arbitraries.ts`
- Modify: `packages/testkit/src/index.ts`

- [ ] **Step 1: Create property arbitrary helpers**

Create `packages/testkit/src/property-arbitraries.ts`:

```ts
import fc from "fast-check";

import {
  BOARD_SIZE,
  PRIORITY_CARD_VALUES,
  type Direction,
  type Position,
  type PriorityCard,
  type Rectangle6RotationSelection,
  type RotationDirection,
  type RotationSelection,
  type TileDefinition,
  type TileKind
} from "../../domain/src/index.ts";

export const boardCoordinateArbitrary = fc.integer({
  min: 0,
  max: BOARD_SIZE - 1
});

export const boardPositionArbitrary: fc.Arbitrary<Position> = fc.record({
  x: boardCoordinateArbitrary,
  y: boardCoordinateArbitrary
});

export const directionArbitrary: fc.Arbitrary<Direction> = fc.constantFrom(
  "north",
  "east",
  "south",
  "west"
);

export const rotationDirectionArbitrary: fc.Arbitrary<RotationDirection> =
  fc.constantFrom("clockwise", "counterclockwise");

export const square2RotationSelectionArbitrary: fc.Arbitrary<RotationSelection> =
  fc.record({
    kind: fc.constant("square2"),
    origin: fc.record({
      x: fc.integer({ min: 0, max: BOARD_SIZE - 2 }),
      y: fc.integer({ min: 0, max: BOARD_SIZE - 2 })
    })
  });

export const cross5RotationSelectionArbitrary: fc.Arbitrary<RotationSelection> =
  fc.record({
    kind: fc.constant("cross5"),
    center: fc.record({
      x: fc.integer({ min: 1, max: BOARD_SIZE - 2 }),
      y: fc.integer({ min: 1, max: BOARD_SIZE - 2 })
    })
  });

const rectangle6HorizontalArbitrary: fc.Arbitrary<Rectangle6RotationSelection> =
  fc.record({
    kind: fc.constant("rectangle6"),
    origin: fc.record({
      x: fc.integer({ min: 0, max: BOARD_SIZE - 3 }),
      y: fc.integer({ min: 0, max: BOARD_SIZE - 2 })
    }),
    orientation: fc.constant("horizontal")
  });

const rectangle6VerticalArbitrary: fc.Arbitrary<Rectangle6RotationSelection> =
  fc.record({
    kind: fc.constant("rectangle6"),
    origin: fc.record({
      x: fc.integer({ min: 0, max: BOARD_SIZE - 2 }),
      y: fc.integer({ min: 0, max: BOARD_SIZE - 3 })
    }),
    orientation: fc.constant("vertical")
  });

export const rectangle6RotationSelectionArbitrary: fc.Arbitrary<RotationSelection> =
  fc.oneof(rectangle6HorizontalArbitrary, rectangle6VerticalArbitrary);

export const rotationSelectionArbitrary: fc.Arbitrary<RotationSelection> = fc.oneof(
  square2RotationSelectionArbitrary,
  cross5RotationSelectionArbitrary,
  rectangle6RotationSelectionArbitrary
);

export const priorityCardArbitrary: fc.Arbitrary<PriorityCard> =
  fc.constantFrom(...PRIORITY_CARD_VALUES);

export const elementalTileKindArbitrary: fc.Arbitrary<Exclude<TileKind, "plain">> =
  fc.constantFrom("fire", "water", "electric", "ice");

export const tileDefinitionsArbitrary: fc.Arbitrary<readonly TileDefinition[]> =
  fc.uniqueArray(
    fc.record({
      position: boardPositionArbitrary,
      kind: elementalTileKindArbitrary
    }),
    {
      maxLength: 30,
      selector: (tile) => `${tile.position.x},${tile.position.y}`
    }
  );
```

- [ ] **Step 2: Re-export helpers from the testkit barrel**

Modify `packages/testkit/src/index.ts` by adding this export at the end:

```ts
export * from "./property-arbitraries.ts";
```

- [ ] **Step 3: Typecheck the helper**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If fast-check types expose `fc.Arbitrary<T>` differently in the installed version, import the type with `import type { Arbitrary } from "fast-check";` and update annotations to `Arbitrary<T>`.

- [ ] **Step 4: Commit testkit helpers**

```bash
git add packages/testkit/src/property-arbitraries.ts packages/testkit/src/index.ts
git commit -m "test: add property arbitraries for domain rules"
```

---

### Task 3: Validate rotation invariants

**Files:**
- Create: `packages/domain/src/rotation.property.test.ts`

- [ ] **Step 1: Add the rotation property test**

Create `packages/domain/src/rotation.property.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  getRotationPositionMapping,
  getRotationSelectionPositions,
  isValidRotationSelection,
  positionKey,
  type Position
} from "./index.ts";
import {
  rotationDirectionArbitrary,
  rotationSelectionArbitrary
} from "../../testkit/src/index.ts";

function mapPosition(
  mapping: ReadonlyMap<string, Position>,
  position: Position
): Position {
  const mapped = mapping.get(positionKey(position));
  assert.ok(mapped, `Expected mapping for ${positionKey(position)}`);
  return mapped;
}

function oppositeDirection(direction: "clockwise" | "counterclockwise") {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}

test("rotation selections always produce a valid bijection", () => {
  fc.assert(
    fc.property(rotationSelectionArbitrary, rotationDirectionArbitrary, (selection, direction) => {
      assert.equal(isValidRotationSelection(selection), true);

      const positions = getRotationSelectionPositions(selection);
      const mapping = getRotationPositionMapping(selection, direction);
      const sourceKeys = positions.map(positionKey);
      const destinationKeys = [...mapping.values()].map(positionKey);

      assert.equal(mapping.size, positions.length);
      assert.deepEqual(new Set(sourceKeys), new Set(mapping.keys()));
      assert.equal(new Set(destinationKeys).size, positions.length);
      assert.deepEqual(new Set(destinationKeys), new Set(sourceKeys));
    }),
    { numRuns: 500 }
  );
});

test("clockwise and counterclockwise rotations are inverses", () => {
  fc.assert(
    fc.property(rotationSelectionArbitrary, rotationDirectionArbitrary, (selection, direction) => {
      const forward = getRotationPositionMapping(selection, direction);
      const backward = getRotationPositionMapping(selection, oppositeDirection(direction));

      for (const source of getRotationSelectionPositions(selection)) {
        const afterForward = mapPosition(forward, source);
        const afterBackward = mapPosition(backward, afterForward);

        assert.deepEqual(afterBackward, source);
      }
    }),
    { numRuns: 500 }
  );
});
```

- [ ] **Step 2: Run only the rotation property tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/rotation.property.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run all domain tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit rotation properties**

```bash
git add packages/domain/src/rotation.property.test.ts
git commit -m "test: validate rotation mapping properties"
```

---

### Task 4: Validate board normalization invariants

**Files:**
- Create: `packages/domain/src/board-normalization.property.test.ts`

- [ ] **Step 1: Add the board normalization property test**

Create `packages/domain/src/board-normalization.property.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  getTileKind,
  normalizeBoardAfterMutation,
  positionKey,
  type BoardState,
  type Position,
  type TileKind
} from "./index.ts";
import { tileDefinitionsArbitrary } from "../../testkit/src/index.ts";

function buildBoard(tiles: readonly { readonly position: Position; readonly kind: Exclude<TileKind, "plain"> }[]): BoardState {
  return {
    width: 20,
    height: 20,
    tiles: Object.fromEntries(
      tiles.map((tile) => [positionKey(tile.position), { kind: tile.kind }])
    ),
    fences: {}
  };
}

function tileEntries(board: BoardState): readonly [string, TileKind][] {
  return Object.entries(board.tiles)
    .map(([key, tile]) => [key, tile.kind] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

test("normalizing a generated board is idempotent", () => {
  fc.assert(
    fc.property(tileDefinitionsArbitrary, (tiles) => {
      const board = buildBoard(tiles);
      const seeds = tiles.map((tile) => tile.position);
      const first = normalizeBoardAfterMutation(board, seeds).board;
      const second = normalizeBoardAfterMutation(first, seeds).board;

      assert.deepEqual(tileEntries(second), tileEntries(first));
    }),
    { numRuns: 500 }
  );
});

test("normalization never creates non-elemental tiles outside generated tile positions", () => {
  fc.assert(
    fc.property(tileDefinitionsArbitrary, (tiles) => {
      const board = buildBoard(tiles);
      const seeds = tiles.map((tile) => tile.position);
      const normalized = normalizeBoardAfterMutation(board, seeds).board;
      const generatedKeys = new Set(tiles.map((tile) => positionKey(tile.position)));

      for (const key of Object.keys(normalized.tiles)) {
        assert.equal(generatedKeys.has(key), true);
      }

      for (const tile of tiles) {
        assert.notEqual(getTileKind(normalized, tile.position), "plain");
      }
    }),
    { numRuns: 500 }
  );
});
```

- [ ] **Step 2: Run only board normalization properties**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/board-normalization.property.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run all domain tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit board properties**

```bash
git add packages/domain/src/board-normalization.property.test.ts
git commit -m "test: validate board normalization properties"
```

---

### Task 5: Validate priority ordering invariants

**Files:**
- Create: `packages/domain/src/priority.property.test.ts`

- [ ] **Step 1: Add the priority property test**

Create `packages/domain/src/priority.property.test.ts`:

```ts
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
```

- [ ] **Step 2: Run only priority properties**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/priority.property.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run all domain tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit priority properties**

```bash
git add packages/domain/src/priority.property.test.ts
git commit -m "test: validate priority ordering properties"
```

---

### Task 6: Add a small deterministic domain command sequence property

**Files:**
- Create: `packages/domain/src/domain-command-sequence.property.test.ts`

- [ ] **Step 1: Add deterministic replay and invariant helpers**

Create `packages/domain/src/domain-command-sequence.property.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  BOARD_SIZE,
  endTurn,
  moveActivePlayer,
  type Direction,
  type MatchState
} from "./index.ts";
import {
  createTwoPlayerMatchFixture,
  directionArbitrary
} from "../../testkit/src/index.ts";

type GeneratedCommand =
  | { readonly type: "move"; readonly direction: Direction }
  | { readonly type: "endTurn" };

const generatedCommandArbitrary: fc.Arbitrary<GeneratedCommand> = fc.oneof(
  directionArbitrary.map((direction) => ({
    type: "move" as const,
    direction
  })),
  fc.constant({ type: "endTurn" as const })
);

function applyIfLegal(match: MatchState, command: GeneratedCommand): MatchState {
  const activePlayerId = match.round.activePlayerId;

  if (!activePlayerId) {
    return match;
  }

  try {
    if (command.type === "move") {
      return moveActivePlayer(match, activePlayerId, command.direction).state;
    }

    return endTurn(match, activePlayerId).state;
  } catch {
    return match;
  }
}

function applySequence(commands: readonly GeneratedCommand[]): MatchState {
  return commands.reduce(
    (match, command) => applyIfLegal(match, command),
    createTwoPlayerMatchFixture({ treasures: [] })
  );
}

function assertGlobalInvariants(match: MatchState): void {
  for (const player of Object.values(match.players)) {
    assert.equal(Number.isInteger(player.position.x), true);
    assert.equal(Number.isInteger(player.position.y), true);
    assert.equal(player.position.x >= 0 && player.position.x < BOARD_SIZE, true);
    assert.equal(player.position.y >= 0 && player.position.y < BOARD_SIZE, true);
  }

  const carriedTreasureIds = Object.values(match.players)
    .map((player) => player.carriedTreasureId)
    .filter((treasureId): treasureId is string => treasureId !== null);

  assert.equal(new Set(carriedTreasureIds).size, carriedTreasureIds.length);

  for (const treasure of Object.values(match.treasures)) {
    const locationCount = [
      treasure.position !== null,
      treasure.carriedByPlayerId !== null,
      treasure.openedByPlayerId !== null,
      treasure.removedFromRound
    ].filter(Boolean).length;

    assert.equal(locationCount <= 1, true);
  }
}

test("generated legal command sequences are deterministic and preserve global invariants", () => {
  fc.assert(
    fc.property(
      fc.array(generatedCommandArbitrary, { minLength: 0, maxLength: 40 }),
      (commands) => {
        const first = applySequence(commands);
        const second = applySequence(commands);

        assert.deepEqual(second, first);
        assertGlobalInvariants(first);
      }
    ),
    { numRuns: 300 }
  );
});
```

- [ ] **Step 2: Run only command-sequence properties**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/domain-command-sequence.property.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run all tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Commit command-sequence properties**

```bash
git add packages/domain/src/domain-command-sequence.property.test.ts
git commit -m "test: validate deterministic domain command sequences"
```

---

### Task 7: Document property testing policy

**Files:**
- Modify: `docs/testing/test-strategy.md`

- [ ] **Step 1: Add a property testing section**

Add this section to `docs/testing/test-strategy.md`:

```md
## Property-Based Rule Validation

Project. BH uses `fast-check` to validate broad rule invariants in the domain layer. Property tests live next to domain example tests as `*.property.test.ts` files and use shared generators from `packages/testkit/src/property-arbitraries.ts`.

Use property tests when a rule has many equivalent input shapes or when regressions are more likely to appear through combinations than through a single hand-written scenario. Good candidates include rotation mappings, board normalization, priority ordering, legal command replay, treasure ownership invariants, and protocol validation round trips.

Every property must be deterministic. Do not call `Math.random()` from a property or from domain code under test. If a property fails, copy the fast-check seed and path from the failure output into a focused regression test before or with the fix.

Run all property tests with:

```bash
node --experimental-strip-types --test packages/domain/src/*.property.test.ts
```

Run the full verification suite with:

```bash
pnpm test
pnpm typecheck
```
```

- [ ] **Step 2: Run documentation-sensitive checks**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: both commands pass.

- [ ] **Step 3: Commit docs**

```bash
git add docs/testing/test-strategy.md
git commit -m "docs: document property-based rule validation"
```

---

## Follow-Up Expansion After This Slice

After the first slice lands, expand in this order:

1. Add property tests for protocol validators:
   - Generated valid commands pass validation.
   - Generated invalid versions and malformed payloads fail validation.
   - Validation never returns `ok: true` with structurally invalid domain values.

2. Add richer treasure properties:
   - A treasure cannot be both on the board and carried.
   - Opened treasure count matches treasures with `openedByPlayerId`.
   - Dropped treasure returns to one board position and clears carried state.

3. Add auction properties:
   - Winners never pay more than their submitted winning amount.
   - Non-winning bidders do not gain card charges.
   - Offer resolution is deterministic for equal bids.

4. Add documented replay fixtures:
   - When fast-check finds a bug, reduce it to a named scenario fixture under `packages/testkit`.
   - Add a focused example test with the failing seed noted in the test name or assertion message.

---

## Verification Checklist

- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `node --experimental-strip-types --test packages/domain/src/*.property.test.ts` passes.
- [ ] No property test imports React, websocket, browser APIs, or server infrastructure.
- [ ] No property depends on wall-clock time or unseeded randomness.
- [ ] New generators live in testkit and do not leak into production domain code.
- [ ] `docs/testing/test-strategy.md` explains failure reproduction.
