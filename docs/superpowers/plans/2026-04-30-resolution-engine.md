# Resolution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic domain-level resolution engine so future complex skills can compose damage, push, tile effects, treasure drops, elimination, and turn advancement without growing more hardcoded branches inside `rules.ts`.

**Architecture:** Keep the public domain command API unchanged for this slice. Add a small, serializable `ResolutionStep[]` pipeline inside `packages/domain`, then migrate existing damage, tile-effect, and bomb impact behavior onto it while preserving current event order and state outcomes. Dependency injection is limited to deterministic domain policies such as treasure-drop selection; React, server transport, clocks, logging, and persistence stay outside this layer.

**Tech Stack:** TypeScript strict mode, Node built-in test runner, existing Project BH domain/application/protocol packages, no new runtime dependencies.

---

## Overall Review

The idea is sound and fits Project BH's architecture.

Current pressure points:

- `packages/domain/src/rules.ts` owns correct behavior, but action after-effects are embedded directly inside `moveActivePlayer`, `throwTile`, `useSpecialCard`, `applyDamage`, `applyTileEffectToPlayer`, and `resolveSpecialMovement`.
- The current special-card logic is still manageable, but future skills that combine damage, push, collision, tile effects, treasure drop, and turn interruption will make `useSpecialCard` hard to reason about.
- `packages/application/src/query-turn-affordances.ts` and `packages/application/src/query-cell-actions.ts` dry-run domain commands to ask what is legal. This is a useful existing pattern and should keep working.
- No protocol or React change is required for the first slice because the command surface can remain unchanged.

Decision:

- Add a narrow domain resolution pipeline now.
- Do not create a generic game scripting DSL.
- Do not replace the turn model in this first slice.
- Keep `moveActivePlayer`, `throwTile`, and `useSpecialCard` as public domain entry points.
- Move reusable after-effect sequencing behind explicit `ResolutionStep` data and deterministic resolvers.

## Target File Structure

- Create `packages/domain/src/resolution.ts`
  - Owns `ResolutionContext`, `ResolutionStep`, `ResolutionPolicies`, and `runResolutionPipeline`.
  - Contains deterministic state update helpers needed by resolution steps.
  - Does not import `rules.ts`.
- Create `packages/domain/src/resolution.test.ts`
  - Focused tests for damage, elimination, treasure drop, electric wet stun, and event ordering.
- Modify `packages/domain/src/rules.ts`
  - Keeps public command functions stable.
  - Replaces private `applyDamage`, `applyTileEffectToPlayer`, and bomb-impact sequencing with resolution pipeline calls.
  - Keeps existing command validation and turn-budget checks in place.
- Modify `packages/domain/src/index.ts`
  - Exports resolution types/functions only if tests and future domain modules need them.
- Modify `docs/architecture/overview.md`
  - Documents that complex action after-effects now flow through a domain resolution pipeline.
- Modify `docs/rules/game-rules.md`
  - Documents current resolution order for damage/tile effects without claiming new gameplay behavior.
- Modify `docs/testing/test-strategy.md`
  - Adds resolution pipeline regression coverage as a required layer for future skills.
- Modify `docs/migration/unity-parity.md`
  - Names `ResolutionStep` sequences as future Unity parity fixtures.
- Create `docs/implementation-log/2026-04-30-resolution-engine.md`
  - Records the refactor and verification.

## Resolution Model

Use data-first steps:

```ts
export type ResolutionStep =
  | { readonly kind: "damage"; readonly playerId: PlayerId; readonly amount: number }
  | { readonly kind: "dropCarriedTreasure"; readonly playerId: PlayerId; readonly position: Position }
  | { readonly kind: "applyTileEffect"; readonly playerId: PlayerId; readonly tileKind: TileKind; readonly ownTurn: boolean }
  | { readonly kind: "setEndsTurnImmediately"; readonly value: boolean };
```

The first implementation intentionally excludes push. Push belongs in the same model, but adding it before any rule uses it would create dead abstraction. The model leaves a clear place for a future step:

```ts
| {
    readonly kind: "push";
    readonly playerId: PlayerId;
    readonly direction: Direction;
    readonly distance: number;
    readonly collisionDamage: number;
  }
```

That future step should be added with the first real skill that uses push.

## Task 1: Add Regression Tests For Current Resolution Behavior

**Files:**

- Modify: `packages/domain/src/domain.test.ts`

- [ ] **Step 1: Add a regression test for bomb impact on a wet player**

Add this test near the existing special-card bomb tests in `packages/domain/src/domain.test.ts`:

```ts
test("electric bomb damage and wet stun resolve before turn advancement", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(
    replacePlayer(stepped, "player-1", (player) => ({
      ...player,
      specialInventory: {
        ...player.specialInventory,
        electricBomb: 1
      }
    })),
    "player-2",
    (player) => ({
      ...player,
      position: createPosition(0, 3),
      status: {
        ...player.status,
        water: true
      }
    })
  );

  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "electricBomb",
    targetPosition: createPosition(0, 3)
  });
  const target = mustPlayer(result.state, "player-2");

  assert.equal(target.hitPoints, 7);
  assert.equal(target.status.skipNextTurnCount, 0);
  assert.equal(result.state.round.activePlayerId, "player-1");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "specialCardUsed",
      "tileChanged",
      "playerDamaged",
      "playerStatusChanged",
      "turnEnded",
      "turnSkipped"
    ]
  );
});
```

- [ ] **Step 2: Add a regression test for elimination dropping carried treasure**

Add this test in `packages/domain/src/domain.test.ts` near the tile-effect tests:

```ts
test("lethal electric tile damage eliminates the player and drops carried treasure", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 1), kind: "electric" }]
  });
  const carrying: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        hitPoints: 3,
        carriedTreasureId: "treasure-x"
      }
    },
    treasures: {
      ...match.treasures,
      "treasure-x": {
        id: "treasure-x",
        slot: 1,
        ownerPlayerId: "player-1",
        points: 1,
        initialPosition: null,
        position: null,
        carriedByPlayerId: "player-1",
        openedByPlayerId: null,
        removedFromRound: false
      }
    }
  };

  const result = moveActivePlayer(carrying, "player-1", "south");
  const eliminated = mustPlayer(result.state, "player-1");
  const dropped = mustTreasure(result.state, "treasure-x");

  assert.equal(eliminated.hitPoints, 0);
  assert.equal(eliminated.eliminated, true);
  assert.equal(eliminated.carriedTreasureId, null);
  assert.deepEqual(dropped.position, createPosition(0, 1));
  assert.equal(result.state.round.activePlayerId, "player-2");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "playerMoved",
      "playerDamaged",
      "playerEliminated",
      "treasureDropped",
      "turnStageChanged",
      "turnEnded"
    ]
  );
});
```

- [ ] **Step 3: Run the focused domain tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/domain.test.ts
```

Expected:

- PASS.
- These tests should pass before the refactor. They lock in current behavior.

- [ ] **Step 4: Commit the regression tests**

Run:

```bash
git add packages/domain/src/domain.test.ts
git commit -m "test: lock current resolution behavior"
```

## Task 2: Introduce The Domain Resolution Pipeline

**Files:**

- Create: `packages/domain/src/resolution.ts`
- Create: `packages/domain/src/resolution.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write focused tests for the new pipeline**

Create `packages/domain/src/resolution.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  createPosition,
  runResolutionPipeline,
  type MatchState,
  type PlayerState,
  type TreasureState
} from "./index.ts";
import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";

function mustPlayer(match: MatchState, playerId: string): PlayerState {
  const player = match.players[playerId];
  assert.ok(player, `Expected player ${playerId} to exist.`);
  return player;
}

function mustTreasure(match: MatchState, treasureId: string): TreasureState {
  const treasure = match.treasures[treasureId];
  assert.ok(treasure, `Expected treasure ${treasureId} to exist.`);
  return treasure;
}

test("resolution pipeline applies lethal damage, elimination, and carried treasure drop", () => {
  const match = createTwoPlayerMatchFixture({ treasures: [] });
  const prepared: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        hitPoints: 3,
        carriedTreasureId: "treasure-x"
      }
    },
    treasures: {
      ...match.treasures,
      "treasure-x": {
        id: "treasure-x",
        slot: 1,
        ownerPlayerId: "player-1",
        points: 1,
        initialPosition: null,
        position: null,
        carriedByPlayerId: "player-1",
        openedByPlayerId: null,
        removedFromRound: false
      }
    }
  };

  const result = runResolutionPipeline({
    match: prepared,
    actorPlayerId: "player-1",
    steps: [{ kind: "damage", playerId: "player-1", amount: 3 }]
  });
  const player = mustPlayer(result.state, "player-1");
  const treasure = mustTreasure(result.state, "treasure-x");

  assert.equal(player.hitPoints, 0);
  assert.equal(player.eliminated, true);
  assert.equal(player.carriedTreasureId, null);
  assert.deepEqual(treasure.position, createPosition(0, 0));
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["playerDamaged", "playerEliminated", "treasureDropped"]
  );
  assert.equal(result.endsTurnImmediately, false);
});

test("resolution pipeline applies electric wet stun and own-turn interruption", () => {
  const match = createTwoPlayerMatchFixture({ treasures: [] });
  const prepared: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        status: {
          ...mustPlayer(match, "player-1").status,
          water: true
        }
      }
    }
  };

  const result = runResolutionPipeline({
    match: prepared,
    actorPlayerId: "player-1",
    steps: [
      {
        kind: "applyTileEffect",
        playerId: "player-1",
        tileKind: "electric",
        ownTurn: true
      }
    ]
  });
  const player = mustPlayer(result.state, "player-1");

  assert.equal(player.hitPoints, 7);
  assert.equal(player.status.skipNextTurnCount, 1);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["playerDamaged", "playerStatusChanged"]
  );
  assert.equal(result.endsTurnImmediately, true);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/resolution.test.ts
```

Expected:

- FAIL with an export/module error for `runResolutionPipeline`.

- [ ] **Step 3: Add `packages/domain/src/resolution.ts`**

Create `packages/domain/src/resolution.ts`:

```ts
import { getTileKind } from "./board.ts";
import type { DomainEvent } from "./events.ts";
import type {
  MatchState,
  PlayerId,
  PlayerState,
  Position,
  TileKind,
  TreasureState
} from "./model.ts";
import {
  isSamePosition,
  isWithinBoard,
  manhattanDistance,
  movePosition
} from "./position.ts";

const DROP_DIRECTION_PRIORITY = ["north", "east", "south", "west"] as const;

export type ResolutionStep =
  | { readonly kind: "damage"; readonly playerId: PlayerId; readonly amount: number }
  | { readonly kind: "dropCarriedTreasure"; readonly playerId: PlayerId; readonly position: Position }
  | { readonly kind: "applyTileEffect"; readonly playerId: PlayerId; readonly tileKind: TileKind; readonly ownTurn: boolean }
  | { readonly kind: "setEndsTurnImmediately"; readonly value: boolean };

export interface ResolutionPolicies {
  readonly chooseTreasureDropPosition: (match: MatchState, player: PlayerState) => Position;
}

export interface RunResolutionPipelineInput {
  readonly match: MatchState;
  readonly actorPlayerId: PlayerId | null;
  readonly steps: readonly ResolutionStep[];
  readonly policies?: Partial<ResolutionPolicies>;
}

export interface ResolutionPipelineResult {
  readonly state: MatchState;
  readonly events: readonly DomainEvent[];
  readonly endsTurnImmediately: boolean;
}

interface MutableResolutionContext {
  match: MatchState;
  events: DomainEvent[];
  endsTurnImmediately: boolean;
  readonly policies: ResolutionPolicies;
}

function getPlayerOrThrow(match: MatchState, playerId: PlayerId): PlayerState {
  const player = match.players[playerId];

  if (!player) {
    throw new Error(`Unknown player ${playerId}.`);
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

function chooseDefaultTreasureDropPosition(_match: MatchState, player: PlayerState): Position {
  return DROP_DIRECTION_PRIORITY.map((direction) => movePosition(player.position, direction))
    .filter(isWithinBoard)
    .sort((left, right) => {
      return manhattanDistance(right, player.startPosition) - manhattanDistance(left, player.startPosition);
    })[0] ?? player.position;
}

function dropCarriedTreasureAt(
  match: MatchState,
  player: PlayerState,
  position: Position
): { readonly state: MatchState; readonly events: readonly DomainEvent[] } {
  if (player.carriedTreasureId === null) {
    return {
      state: match,
      events: []
    };
  }

  const treasure = match.treasures[player.carriedTreasureId];

  if (!treasure) {
    throw new Error(`Unknown treasure ${player.carriedTreasureId}.`);
  }

  let nextMatch = updatePlayer(match, {
    ...player,
    carriedTreasureId: null
  });
  const events: DomainEvent[] = [];
  const occupyingPlayer = Object.values(nextMatch.players).find((candidate) => {
    return !candidate.eliminated && candidate.id !== player.id && isSamePosition(candidate.position, position);
  });

  if (occupyingPlayer) {
    nextMatch = updatePlayer(nextMatch, {
      ...occupyingPlayer,
      carriedTreasureId: treasure.id
    });
    nextMatch = updateTreasure(nextMatch, {
      ...treasure,
      position: null,
      carriedByPlayerId: occupyingPlayer.id
    });
    events.push({
      type: "treasureDropped",
      playerId: player.id,
      treasureId: treasure.id,
      position
    });
    events.push({
      type: "treasurePickedUp",
      playerId: occupyingPlayer.id,
      treasureId: treasure.id,
      position
    });
  } else {
    nextMatch = updateTreasure(nextMatch, {
      ...treasure,
      position,
      carriedByPlayerId: null
    });
    events.push({
      type: "treasureDropped",
      playerId: player.id,
      treasureId: treasure.id,
      position
    });
  }

  return {
    state: nextMatch,
    events
  };
}

function applyDamageStep(context: MutableResolutionContext, playerId: PlayerId, amount: number): void {
  const player = getPlayerOrThrow(context.match, playerId);
  const nextHitPoints = Math.max(0, player.hitPoints - amount);
  let nextPlayer: PlayerState = {
    ...player,
    hitPoints: nextHitPoints
  };

  context.match = updatePlayer(context.match, nextPlayer);
  context.events.push({
    type: "playerDamaged",
    playerId,
    amount,
    remainingHitPoints: nextHitPoints
  });

  if (nextHitPoints !== 0 || player.eliminated) {
    return;
  }

  nextPlayer = {
    ...nextPlayer,
    eliminated: true
  };
  context.match = updatePlayer(context.match, nextPlayer);
  context.events.push({
    type: "playerEliminated",
    playerId,
    position: player.position
  });

  const dropped = dropCarriedTreasureAt(context.match, nextPlayer, player.position);
  context.match = dropped.state;
  context.events.push(...dropped.events);
}

function applyTileEffectStep(
  context: MutableResolutionContext,
  playerId: PlayerId,
  tileKind: TileKind,
  ownTurn: boolean
): void {
  if (tileKind === "plain" || tileKind === "river") {
    return;
  }

  let player = getPlayerOrThrow(context.match, playerId);

  if (tileKind === "fire" || tileKind === "giantFlame") {
    const updatedPlayer: PlayerState = {
      ...player,
      status: {
        ...player.status,
        fire: true
      }
    };
    context.match = updatePlayer(context.match, updatedPlayer);
    context.events.push(createStatusChangedEvent(updatedPlayer));
    return;
  }

  if (tileKind === "water") {
    const updatedPlayer: PlayerState = {
      ...player,
      status: {
        ...player.status,
        fire: false,
        water: true
      }
    };
    context.match = updatePlayer(context.match, updatedPlayer);
    context.events.push(createStatusChangedEvent(updatedPlayer));
    return;
  }

  if (tileKind === "electric") {
    applyDamageStep(context, playerId, 3);
    player = getPlayerOrThrow(context.match, playerId);

    if (player.status.water) {
      const updatedPlayer: PlayerState = {
        ...player,
        status: {
          ...player.status,
          skipNextTurnCount: player.status.skipNextTurnCount + 1
        }
      };
      context.match = updatePlayer(context.match, updatedPlayer);
      context.events.push(createStatusChangedEvent(updatedPlayer));
      context.endsTurnImmediately = context.endsTurnImmediately || ownTurn;
    }
    return;
  }

  if (tileKind === "ice" && player.carriedTreasureId !== null) {
    const dropped = dropCarriedTreasureAt(
      context.match,
      player,
      context.policies.chooseTreasureDropPosition(context.match, player)
    );
    context.match = dropped.state;
    context.events.push(...dropped.events);
  }
}

function applyResolutionStep(context: MutableResolutionContext, step: ResolutionStep): void {
  switch (step.kind) {
    case "damage":
      applyDamageStep(context, step.playerId, step.amount);
      return;
    case "dropCarriedTreasure": {
      const player = getPlayerOrThrow(context.match, step.playerId);
      const dropped = dropCarriedTreasureAt(context.match, player, step.position);
      context.match = dropped.state;
      context.events.push(...dropped.events);
      return;
    }
    case "applyTileEffect":
      applyTileEffectStep(context, step.playerId, step.tileKind, step.ownTurn);
      return;
    case "setEndsTurnImmediately":
      context.endsTurnImmediately = step.value;
      return;
  }
}

export function runResolutionPipeline(input: RunResolutionPipelineInput): ResolutionPipelineResult {
  const context: MutableResolutionContext = {
    match: input.match,
    events: [],
    endsTurnImmediately: false,
    policies: {
      chooseTreasureDropPosition: input.policies?.chooseTreasureDropPosition ?? chooseDefaultTreasureDropPosition
    }
  };

  for (const step of input.steps) {
    applyResolutionStep(context, step);
  }

  return {
    state: context.match,
    events: context.events,
    endsTurnImmediately: context.endsTurnImmediately
  };
}

export function createTileEffectResolutionStep(
  match: MatchState,
  playerId: PlayerId,
  ownTurn: boolean
): ResolutionStep {
  return {
    kind: "applyTileEffect",
    playerId,
    tileKind: getTileKind(match.board, getPlayerOrThrow(match, playerId).position),
    ownTurn
  };
}
```

- [ ] **Step 4: Export the resolution module**

Modify `packages/domain/src/index.ts`:

```ts
export * from "./board.ts";
export * from "./create-match-state.ts";
export * from "./errors.ts";
export * from "./events.ts";
export * from "./model.ts";
export * from "./position.ts";
export * from "./priority.ts";
export * from "./resolution.ts";
export * from "./rotation.ts";
export * from "./rules.ts";
```

- [ ] **Step 5: Run the focused resolution tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/resolution.test.ts
```

Expected:

- PASS.

- [ ] **Step 6: Run all domain tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/*.test.ts
```

Expected:

- PASS.

- [ ] **Step 7: Commit the pipeline scaffold**

Run:

```bash
git add packages/domain/src/index.ts packages/domain/src/resolution.ts packages/domain/src/resolution.test.ts
git commit -m "feat: add domain resolution pipeline"
```

## Task 3: Rewire Existing Damage And Tile Effects To Use The Pipeline

**Files:**

- Modify: `packages/domain/src/rules.ts`
- Modify: `packages/domain/src/domain.test.ts`

- [ ] **Step 1: Import `runResolutionPipeline`**

Modify the import block in `packages/domain/src/rules.ts`:

```ts
import { resolvePriorityTurnOrder } from "./priority.ts";
import { runResolutionPipeline, type ResolutionStep } from "./resolution.ts";
import {
  getRotationPositionMapping,
  getRotationSelectionPositions,
  isValidRotationSelection
} from "./rotation.ts";
```

- [ ] **Step 2: Replace private `applyDamage` with a pipeline wrapper**

In `packages/domain/src/rules.ts`, replace the current `applyDamage` function with:

```ts
function applyDamage(
  match: MatchState,
  playerId: PlayerId,
  amount: number
): DomainMutationResult {
  const result = runResolutionPipeline({
    match,
    actorPlayerId: playerId,
    steps: [{ kind: "damage", playerId, amount }]
  });

  return {
    state: result.state,
    events: result.events
  };
}
```

- [ ] **Step 3: Replace private `applyTileEffectToPlayer` internals with the pipeline**

In `packages/domain/src/rules.ts`, replace the current `applyTileEffectToPlayer` function with:

```ts
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
```

- [ ] **Step 4: Remove duplicated private helpers that are no longer used**

In `packages/domain/src/rules.ts`, remove these functions only if TypeScript confirms they are unused after Step 3:

```ts
function chooseTreasureDropPosition(player: PlayerState): Position {
  return DROP_DIRECTION_PRIORITY.map((direction) => movePosition(player.position, direction))
    .filter(isWithinBoard)
    .sort((left, right) => {
      return (
        manhattanDistance(right, player.startPosition) -
        manhattanDistance(left, player.startPosition)
      );
    })[0] ?? player.position;
}
```

Keep `dropCarriedTreasure` in `rules.ts` if `openCarriedTreasure`, round preparation, or existing command code still uses it. Remove `DROP_DIRECTION_PRIORITY` from `rules.ts` only if no remaining function references it.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

- PASS.
- No unused import errors from `manhattanDistance`, `ResolutionStep`, or `DROP_DIRECTION_PRIORITY`.

- [ ] **Step 6: Run domain tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/*.test.ts
```

Expected:

- PASS.
- The event-order assertions added in Task 1 still pass.

- [ ] **Step 7: Commit the rewiring**

Run:

```bash
git add packages/domain/src/rules.ts packages/domain/src/domain.test.ts
git commit -m "refactor: route tile effects through resolution pipeline"
```

## Task 4: Add A Minimal Special-Card Resolution Plan Boundary

**Files:**

- Create: `packages/domain/src/special-card-resolution.ts`
- Modify: `packages/domain/src/rules.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/domain.test.ts`

- [ ] **Step 1: Create a failing test that describes bomb plan creation**

Add this test near the bomb tests in `packages/domain/src/domain.test.ts`:

```ts
test("bomb special cards build explicit board-impact resolution plans", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 2), kind: "water" }]
  });
  const plan = createBombResolutionPlan(match, {
    playerId: "player-1",
    cardType: "flameBomb",
    targetPosition: createPosition(0, 2)
  });

  assert.deepEqual(plan, [
    {
      kind: "setTile",
      position: createPosition(0, 2),
      tileKind: "fire",
      normalize: true
    },
    {
      kind: "applyTileEffectToOccupants",
      position: createPosition(0, 2),
      tileKind: "fire",
      actorPlayerId: "player-1"
    }
  ]);
});
```

Also add this import to the top of `packages/domain/src/domain.test.ts`:

```ts
import { createBombResolutionPlan } from "./special-card-resolution.ts";
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/domain.test.ts --test-name-pattern "bomb special cards build explicit board-impact resolution plans"
```

Expected:

- FAIL with a missing module or missing export for `createBombResolutionPlan`.

- [ ] **Step 3: Extend `ResolutionStep` with board-impact steps**

Modify `packages/domain/src/resolution.ts`:

```ts
import {
  findFenceAtPosition,
  getTileKind,
  normalizeBoardAfterMutation,
  removeFence,
  setTileKind
} from "./board.ts";
```

Extend `ResolutionStep`:

```ts
export type ResolutionStep =
  | { readonly kind: "damage"; readonly playerId: PlayerId; readonly amount: number }
  | { readonly kind: "dropCarriedTreasure"; readonly playerId: PlayerId; readonly position: Position }
  | { readonly kind: "applyTileEffect"; readonly playerId: PlayerId; readonly tileKind: TileKind; readonly ownTurn: boolean }
  | { readonly kind: "setEndsTurnImmediately"; readonly value: boolean }
  | { readonly kind: "removeFenceAt"; readonly position: Position }
  | { readonly kind: "setTile"; readonly position: Position; readonly tileKind: TileKind; readonly normalize: boolean }
  | {
      readonly kind: "applyTileEffectToOccupants";
      readonly position: Position;
      readonly tileKind: TileKind;
      readonly actorPlayerId: PlayerId;
    };
```

Add this helper to `resolution.ts`:

```ts
function updateBoard(match: MatchState, board: MatchState["board"]): MatchState {
  return {
    ...match,
    board
  };
}

function collectTileChangeEvents(
  before: MatchState["board"],
  after: MatchState["board"],
  positions: readonly Position[]
): readonly DomainEvent[] {
  const uniquePositions = new Map<string, Position>();

  for (const position of positions) {
    if (isWithinBoard(position)) {
      uniquePositions.set(`${position.x},${position.y}`, position);
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
```

Add these cases to `applyResolutionStep`:

```ts
case "removeFenceAt": {
  const fence = findFenceAtPosition(context.match.board, step.position);

  if (!fence) {
    return;
  }

  context.match = updateBoard(context.match, removeFence(context.match.board, fence.id));
  context.events.push({
    type: "fenceRemoved",
    fenceId: fence.id
  });
  return;
}
case "setTile": {
  const beforeBoard = context.match.board;
  const mutatedBoard = setTileKind(beforeBoard, step.position, step.tileKind);
  const normalized = step.normalize
    ? normalizeBoardAfterMutation(mutatedBoard, [step.position])
    : { board: mutatedBoard, changes: [] };

  context.match = updateBoard(context.match, normalized.board);
  context.events.push(
    ...collectTileChangeEvents(beforeBoard, context.match.board, [
      step.position,
      ...normalized.changes.map((change) => change.position)
    ])
  );
  return;
}
case "applyTileEffectToOccupants": {
  const impactedPlayers = Object.values(context.match.players).filter((candidate) => {
    return !candidate.eliminated && isSamePosition(candidate.position, step.position);
  });

  for (const impactedPlayer of impactedPlayers) {
    applyTileEffectStep(
      context,
      impactedPlayer.id,
      step.tileKind,
      impactedPlayer.id === step.actorPlayerId
    );
  }
  return;
}
```

- [ ] **Step 4: Create `packages/domain/src/special-card-resolution.ts`**

Create `packages/domain/src/special-card-resolution.ts`:

```ts
import { DomainError } from "./errors.ts";
import type { MatchState, PlayerId, Position, SpecialCardType, TileKind } from "./model.ts";
import { cardinalLineDistance } from "./position.ts";
import type { ResolutionStep } from "./resolution.ts";

export interface BombResolutionPlanInput {
  readonly playerId: PlayerId;
  readonly cardType: Extract<SpecialCardType, "flameBomb" | "electricBomb">;
  readonly targetPosition: Position;
}

function isBombTargetInRange(from: Position, to: Position): boolean {
  const distance = cardinalLineDistance(from, to);

  return distance !== null && distance >= 1 && distance <= 3;
}

export function createBombResolutionPlan(
  match: MatchState,
  input: BombResolutionPlanInput
): readonly ResolutionStep[] {
  const player = match.players[input.playerId];

  if (!player) {
    throw new DomainError("NOT_ACTIVE_PLAYER", "Unknown player.");
  }

  if (!isBombTargetInRange(player.position, input.targetPosition)) {
    throw new DomainError(
      "INVALID_SPECIAL_CARD_TARGET",
      "Bomb cards require a target within 3 tiles in a straight line."
    );
  }

  const tileKind: TileKind = input.cardType === "flameBomb" ? "fire" : "electric";

  return [
    {
      kind: "setTile",
      position: input.targetPosition,
      tileKind,
      normalize: true
    },
    {
      kind: "applyTileEffectToOccupants",
      position: input.targetPosition,
      tileKind,
      actorPlayerId: input.playerId
    }
  ];
}
```

- [ ] **Step 5: Export the special-card resolution module**

Modify `packages/domain/src/index.ts`:

```ts
export * from "./board.ts";
export * from "./create-match-state.ts";
export * from "./errors.ts";
export * from "./events.ts";
export * from "./model.ts";
export * from "./position.ts";
export * from "./priority.ts";
export * from "./resolution.ts";
export * from "./rotation.ts";
export * from "./rules.ts";
export * from "./special-card-resolution.ts";
```

- [ ] **Step 6: Run the focused plan test**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/domain.test.ts --test-name-pattern "bomb special cards build explicit board-impact resolution plans"
```

Expected:

- PASS.

- [ ] **Step 7: Commit the special-card plan boundary**

Run:

```bash
git add packages/domain/src/index.ts packages/domain/src/resolution.ts packages/domain/src/special-card-resolution.ts packages/domain/src/domain.test.ts
git commit -m "feat: model bomb effects as resolution plans"
```

## Task 5: Migrate Flame And Electric Bomb Execution Onto Resolution Plans

**Files:**

- Modify: `packages/domain/src/rules.ts`
- Modify: `packages/domain/src/domain.test.ts`

- [ ] **Step 1: Import the bomb plan builder**

Modify `packages/domain/src/rules.ts`:

```ts
import { createBombResolutionPlan } from "./special-card-resolution.ts";
```

- [ ] **Step 2: Replace the bomb branch in `useSpecialCard`**

In `packages/domain/src/rules.ts`, replace the current branch:

```ts
if (input.cardType === "flameBomb" || input.cardType === "electricBomb") {
  if (!input.targetPosition) {
    throw new DomainError(
      "INVALID_SPECIAL_CARD_TARGET",
      "Bomb cards require a target position."
    );
  }

  if (!isBombTargetInRange(player.position, input.targetPosition)) {
    throw new DomainError(
      "INVALID_SPECIAL_CARD_TARGET",
      "Bomb cards require a target within 3 tiles in a straight line."
    );
  }

  const targetPosition = input.targetPosition;
  const targetTileKind: TileKind =
    input.cardType === "flameBomb" ? "fire" : "electric";
  const beforeBoard = nextMatch.board;
  const fence = findFenceAtPosition(beforeBoard, targetPosition);

  let mutatedBoard = beforeBoard;

  if (fence) {
    mutatedBoard = removeFence(mutatedBoard, fence.id);
    events.push({
      type: "fenceRemoved",
      fenceId: fence.id
    });
  }

  mutatedBoard = setTileKind(mutatedBoard, targetPosition, targetTileKind);
  const normalized = normalizeBoardAfterMutation(mutatedBoard, [targetPosition]);
  nextMatch = updateBoard(nextMatch, normalized.board);
  events.push(
    ...collectTileChangeEvents(beforeBoard, nextMatch.board, [
      targetPosition,
      ...normalized.changes.map((change) => change.position)
    ])
  );

  const impactedPlayers = Object.values(nextMatch.players).filter((candidate) => {
    return !candidate.eliminated && isSamePosition(candidate.position, targetPosition);
  });

  for (const impactedPlayer of impactedPlayers) {
    const effect = applyTileEffectToPlayer(
      nextMatch,
      impactedPlayer.id,
      targetTileKind,
      impactedPlayer.id === input.playerId
    );
    nextMatch = effect.state;
    events.push(...effect.events);
  }
}
```

with:

```ts
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
```

- [ ] **Step 3: Remove imports that the bomb branch no longer uses**

In `packages/domain/src/rules.ts`, remove these imports if TypeScript reports them unused:

```ts
findFenceAtPosition,
removeFence,
setTileKind
```

Keep `normalizeBoardAfterMutation` if `throwTile`, `performRotation`, or `coldBomb` still uses it.

- [ ] **Step 4: Run focused special-card tests**

Run:

```bash
node --experimental-strip-types --test packages/domain/src/domain.test.ts --test-name-pattern "special card|bomb|electric bomb"
```

Expected:

- PASS.
- The existing fence-removal bomb test still passes.
- The Task 1 electric bomb event-order test still passes.

- [ ] **Step 5: Run full tests and typecheck**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected:

- Both commands PASS.

- [ ] **Step 6: Commit the bomb migration**

Run:

```bash
git add packages/domain/src/rules.ts packages/domain/src/domain.test.ts
git commit -m "refactor: execute bomb effects through resolution plans"
```

## Task 6: Document The Resolution Boundary

**Files:**

- Modify: `docs/architecture/overview.md`
- Modify: `docs/rules/game-rules.md`
- Modify: `docs/testing/test-strategy.md`
- Modify: `docs/migration/unity-parity.md`
- Create: `docs/implementation-log/2026-04-30-resolution-engine.md`

- [ ] **Step 1: Update architecture overview**

Add this bullet under the current implemented slices in `docs/architecture/overview.md`:

```md
- domain-level resolution pipeline for reusable action after-effects such as damage, tile effects, elimination, carried-treasure drops, and bomb impact sequencing
```

Add this paragraph under "Why this shape":

```md
Complex action after-effects are modeled as explicit domain `ResolutionStep` sequences. This keeps future skills from embedding damage, tile effects, treasure drops, and turn interruption directly inside React, transport handlers, or one large special-card branch.
```

- [ ] **Step 2: Update rules notes**

Add this bullet group near the tile interaction section in `docs/rules/game-rules.md`:

```md
- Action after-effects that can chain across damage, status, tile effects, elimination, and treasure drops now resolve through an explicit domain resolution pipeline.
- Current resolution order for bomb impact is:
  - consume the special-card charge
  - remove a fence on the target tile when present
  - mutate and normalize the target tile
  - apply the resulting tile effect to players on that tile
  - advance the turn or process skipped turns using the existing turn advancement rules
```

- [ ] **Step 3: Update test strategy**

Add this bullet to the current coverage list in `docs/testing/test-strategy.md`:

```md
- resolution pipeline coverage for damage, electric wet stun, elimination, carried-treasure drop, and bomb impact sequencing
```

Add this bullet to the regression policy section:

```md
- New complex skills should add a resolution-plan test that asserts the ordered `ResolutionStep` sequence before or with command-level behavior tests.
```

- [ ] **Step 4: Update Unity parity notes**

Add this bullet under expected future parity assets in `docs/migration/unity-parity.md`:

```md
- resolution-step fixtures for complex skills so Unity can verify damage, push, collision, tile effects, treasure drops, and turn interruption in the same order as the TypeScript reference
```

- [ ] **Step 5: Create the implementation log**

Create `docs/implementation-log/2026-04-30-resolution-engine.md`:

```md
# 2026-04-30 Resolution Engine

## Summary

Added a deterministic domain resolution pipeline for reusable action after-effects. The first migrated behavior preserves existing damage, tile-effect, elimination, treasure-drop, and bomb-impact outcomes while making future complex skills express their effects as ordered domain steps.

## Scope

- packages/domain
- docs

## Changed areas

- added `packages/domain/src/resolution.ts` for explicit `ResolutionStep` execution
- added focused resolution tests for damage, electric wet stun, elimination, and treasure drop
- moved bomb board-impact sequencing onto a special-card resolution plan
- preserved existing public command functions such as `moveActivePlayer`, `throwTile`, and `useSpecialCard`

## Preserved invariants

- rules remain renderer-agnostic
- command validation and server authority remain unchanged
- the React client still does not invent action legality
- resolution remains deterministic from match state plus command input
- no protocol shape changed in this slice

## Tests and verification

- ran `node --experimental-strip-types --test packages/domain/src/*.test.ts`
- ran `pnpm typecheck`
- ran `pnpm test`

## Documentation updated

- docs/architecture/overview.md
- docs/rules/game-rules.md
- docs/testing/test-strategy.md
- docs/migration/unity-parity.md
- docs/implementation-log/2026-04-30-resolution-engine.md

## Open questions

- Push and collision damage should be added as concrete `ResolutionStep` variants with the first skill that uses them.
- Turn-plan data can be introduced after one or two more complex skill flows prove which turn hooks are needed.

## Next recommended slice

- Add the first push-based skill using `ResolutionStep` variants for push, collision damage, tile effect after landing, and turn interruption.
```

- [ ] **Step 6: Commit documentation**

Run:

```bash
git add docs/architecture/overview.md docs/rules/game-rules.md docs/testing/test-strategy.md docs/migration/unity-parity.md docs/implementation-log/2026-04-30-resolution-engine.md
git commit -m "docs: describe domain resolution pipeline"
```

## Task 7: Final Verification

**Files:**

- No file edits.

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

- PASS.

- [ ] **Step 2: Run unit and integration tests**

Run:

```bash
pnpm test
```

Expected:

- PASS.

- [ ] **Step 3: Build the web shell**

Run:

```bash
pnpm build:web
```

Expected:

- PASS.
- This confirms the domain exports and existing web/application imports still compile through the browser package.

- [ ] **Step 4: Run browser smoke if the environment supports Chrome debugging**

Run:

```bash
pnpm test:browser-smoke
```

Expected:

- PASS in a normal local shell with Chrome debugging available.
- SKIP is acceptable in restricted environments that cannot expose a Chrome debugging endpoint.

- [ ] **Step 5: Inspect the diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- packages/domain/src/rules.ts packages/domain/src/resolution.ts packages/domain/src/special-card-resolution.ts
```

Expected:

- `rules.ts` has less direct after-effect sequencing in the bomb and tile-effect paths.
- `resolution.ts` owns reusable after-effect execution.
- `special-card-resolution.ts` owns bomb effect-plan creation.
- No React, protocol, or server file changed.

## Execution Notes

- Keep commits small. The suggested commits map to reviewable checkpoints.
- Do not change protocol schemas in this slice.
- Do not move command legality into application or presentation code.
- Do not add push until a real skill requires it.
- If an event order changes, either restore the order or update the relevant regression test and docs in the same task with a written reason.

## Self-Review

- Spec coverage: The plan covers the requested extensible skill/combat resolution direction by adding explicit ordered resolution steps, deterministic policy injection, bomb plan creation, and documentation for future push/collision extensions.
- Placeholder scan: The plan contains no placeholder markers or empty "add tests" instructions.
- Type consistency: The introduced names are consistent across tasks: `ResolutionStep`, `runResolutionPipeline`, `ResolutionPolicies`, and `createBombResolutionPlan`.
- Scope check: The first slice is intentionally limited to existing damage, tile effects, treasure drops, and bomb impacts. Push/collision and a full turn-plan engine are named as follow-up slices because no current rule exercises them yet.
