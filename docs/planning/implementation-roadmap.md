# Project. BH Implementation Roadmap

## Purpose

This document is the execution plan for turning Project. BH from a headless rules baseline into a playable authoritative multiplayer game.

It exists to answer four questions:

1. What must be built next.
2. In what order it should be built.
3. Which layers each slice may touch.
4. What proof is required before a slice is considered done.

## Planning levels

Use three planning levels together instead of one giant checklist.

- Product roadmap
  - Multi-phase delivery order across domain, server, and web.
- Implementation slice plan
  - The next concrete vertical slices that can be built now.
- Slice completion record
  - The implementation result entry created after each completed slice.

Do not skip directly from idea to code without updating the slice plan.

## Global invariants

Every phase below must preserve these invariants.

- Game rules remain renderer-agnostic.
- Server authority remains the source of truth for legality and outcomes.
- Protocol changes are schema-first.
- Tests are added at the same layer as the rule that changed.
- React stays a shell over shared rules and contracts.
- Unity migration becomes easier, not harder.

## Current baseline

Already implemented:

- monorepo workspace and package boundaries
- deterministic match bootstrap
- auction offers and bid resolution baseline
- player corner start positions
- priority-card submission and turn-order resolution
- active-player turn ownership
- mandatory-step plus secondary-action turn structure
- treasure pickup with immediate turn end
- treasure opening at the start tile
- throwable fire, water, and electric tiles
- fire, water, electric, ice, giant flame, and river baseline interactions
- special-card use for bombs, hammers, and fences
- charged special-card inventory plus recovery, jump, hook, and fence purchase flows
- fence-aware movement and rotation legality
- 4-tile, 5-tile, and 6-tile rotation transforms
- round completion after the fourth opened treasure
- next-round preparation and final match resolution
- protocol validation baseline
- granular selector contracts for public state, viewer-private state, turn hints, and snapshot bundles
- replay export schema and five-round command-log fixture
- Redis-backed runtime-store adapter, stream transport, reconnect hydration, engine worker, and event fanout
- online-game benchmark profiles for selector latency, reconnect latency, and Redis stream throughput
- CI coverage for Redis runtime integration and visual browser smoke
- domain/application/protocol tests
- server/session/reconnect baseline
- local client adapter and view-model baseline

## Active focused plan

The current implementation focus is tracked in:

- `docs/planning/2026-04-18-gui-playtest-overhaul.md`

That plan supersedes the old test-shell assumptions for the next slices.

## Delivery order

### Phase 1. Rules engine foundation

Goal:
Stabilize enough domain and application behavior that the server can become a thin authoritative shell instead of inventing gameplay.

#### Slice 1. Match bootstrap baseline

Status:
Completed.

Delivered:

- match state creation
- board and player state model
- treasure pickup/open flow
- turn advancement baseline

#### Slice 2. Round bootstrap and priority resolution

Status:
Completed.

Goal:
Model how a round starts and how turn order is resolved before action execution begins.

Layers:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`

Deliverables:

- priority card definitions
- player submitted priority state
- tie-break resolution rules
- round bootstrap use case
- authoritative domain events for round start and turn order

Tests:

- highest priority acts first
- tied priorities move to the back
- tie ordering follows clockwise distance rule
- used priority cards are tracked correctly

Docs to update:

- `docs/rules/game-rules.md`
- `docs/networking/protocol.md`
- `docs/testing/test-strategy.md`

Exit criteria:

- turn order is reproducible from state and submissions alone
- no UI-only ordering logic exists

#### Slice 3. Movement budget and carry restrictions

Status:
Completed.

Goal:
Implement the rulebook's `1+2` action structure without leaking action rules into the client.

Layers:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`

Deliverables:

- explicit turn action budget
- mandatory first step
- second action choice model
- carry-state restrictions on throw/rotate/special-card actions

Tests:

- player must take the first step before second action
- picking up treasure on the first step ends the turn immediately
- carrying treasure blocks throw, rotate, and special-card actions

Docs to update:

- `docs/rules/game-rules.md`
- `docs/networking/protocol.md`

Exit criteria:

- turn legality is enforceable without React context or socket state

#### Slice 4. Tile throw legality and board mutation

Status:
Completed for the current throwable tile set.

Goal:
Make tile throwing a first-class domain action with legal targeting and deterministic board updates.

Layers:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`

Deliverables:

- tile adjacency check
- straight-line range check up to three tiles
- non-throwable tile restrictions
- origin tile replacement with plain tile
- target tile mutation events

Tests:

- only adjacent held tile may be thrown
- non-element tiles cannot be thrown
- giant flame, river, and ice non-throw rules are enforced
- out-of-range throws are rejected

Exit criteria:

- throw legality and board mutation are fully domain-owned

#### Slice 5. Tile interaction engine

Status:
Completed for the currently documented interaction set.

Goal:
Encode fire, water, electric, ice, river, and giant flame interactions as deterministic state transitions.

Layers:

- `packages/domain`
- `packages/application`
- `packages/testkit`

Deliverables:

- player status model
- tile cluster detection for giant flame and river
- interaction resolvers
- damage and action-skip state

Tests:

- fire plus water resolution
- water plus electric stun and damage
- three-fire giant flame formation and breakdown
- three-water river formation and displacement
- ice treasure drop behavior

Docs to update:

- `docs/rules/game-rules.md`
- `docs/testing/test-strategy.md`
- `docs/migration/unity-parity.md`

Exit criteria:

- interaction outcomes depend only on state and command input

#### Slice 6. Rotation engine

Status:
Completed for the currently documented rotation set.

Goal:
Implement 4-tile, 5-tile, and 6-tile rotation as deterministic board transforms.

Layers:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`

Deliverables:

- rotation shape model
- clockwise/counterclockwise transforms
- player-on-tile restriction
- fence crossing restriction placeholder or full fence model if ready

Tests:

- 2x2 rotation example from the rulebook
- 5-tile cross rotation example
- 6-tile rectangle rotation example
- occupied tile rotation rejection

Exit criteria:

- rotation examples in docs match test fixtures exactly

#### Slice 7. Elimination, treasure drop, and round resolution

Status:
Completed for the current per-round lifecycle.

Goal:
Complete the per-round lifecycle.

Layers:

- `packages/domain`
- `packages/application`
- `packages/testkit`

Deliverables:

- HP reduction and elimination
- treasure drop on elimination
- dropped treasure recapture
- round end bookkeeping

Tests:

- HP reaching zero eliminates player for the round
- carried treasure drops at elimination position
- dropped treasure can be reclaimed by another player

Exit criteria:

- round lifecycle can be simulated headlessly end to end

#### Slice 8. Scoring, auction, and match end

Status:
Completed with documented assumptions around auction ties and round reset inputs.

Goal:
Close the full five-round game loop.

Layers:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`

Deliverables:

- opened treasure score accounting
- special-card auction model
- carry-over cards between rounds
- total score and tie-break winner calculation

Tests:

- round score calculation from opened treasures
- auction bidding legality
- carry-over special cards between rounds
- five-round winner tie-break resolution

Exit criteria:

- a full match can be replayed from command history

### Phase 2. Authoritative server

Status:
Completed as an in-memory baseline.

Goal:
Wrap the rules engine in a reconnectable authoritative room server.

Slices:

1. room and player session model
2. command validation boundary
3. snapshot plus event broadcast flow
4. reconnect and resync flow
5. match event log and replay export

Exit criteria:

- illegal commands are rejected on the server
- reconnect restores authoritative state
- event stream is traceable by match id and command id

### Phase 3. React multiplayer shell

Goal:
Make the game playable in the browser without moving rules into the client.

Status:
Completed for the current playable browser-first prototype shell.

Slices:

1. lobby and room shell
2. board renderer and HUD
3. intent dispatch and reconciliation
4. selector-driven private/public projection
5. browser smoke coverage for the current critical GUI path

Exit criteria:

- user input only emits commands or local presentation intent
- UI can recover from authoritative resync without undefined behavior

### Phase 4. Observability, replay, and parity

Goal:
Turn the implementation into a durable reference system for Unity and long-term maintenance.

Slices:

1. replay fixture catalog
2. selector, rule, rotation, protocol, runtime, and scenario fixture catalogs
3. parity-oriented scenario suites
4. benchmark profiles for online-game scalability checks
5. ADR set for future critical architecture decisions

Exit criteria:

- the project can explain why a rule behaves as it does
- known bugs and ambiguities are searchable in docs and tests

## Immediate implementation plan

The next recommended order is:

1. Keep browser-smoke CI reliable as the GUI expands.
2. Add resolved scenario fixtures for any newly finalized special-card combinations.
3. Add ADRs when an architecture decision changes protocol, runtime storage, replay compatibility, or Unity migration assumptions.
4. Expand benchmark profiles only when a new online-game bottleneck or service topology needs a stable measurement.

Reason:

- the domain loop, Redis runtime, selector contracts, replay export, React shell, and current parity fixtures now exist end to end
- the remaining near-term work is mostly operational hardening and fixture expansion as rules stabilize
- new work should preserve the current server-authoritative, selector-projected, Unity-portable boundaries

## Working rule for future planning

Every new slice must be written in this document before implementation starts, with:

- goal
- touched layers
- deliverables
- tests
- docs to update
- exit criteria

If a slice cannot be described this way, it is too vague to implement safely.
