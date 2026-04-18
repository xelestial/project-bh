# 2026-04-18 GUI Playtest Overhaul Plan

## Goal

Turn the current form-based React test shell into a compact human-vs-human GUI playtest client that:

- keeps the full map visible
- uses right-click contextual actions validated by the backend
- moves special-card interaction into a bottom overlay
- fixes the auction flow to resolve one revealed card at a time
- adds the missing per-player treasure-card placement phase
- loads test settings from a project config file that the creator layer translates into engine inputs

## Non-negotiable invariants

- Rules stay domain-first and renderer-agnostic.
- Action legality remains server-authoritative.
- Hidden information is projected per player, not solved in React.
- Config is translated through an explicit creator layer before reaching the engine.
- The web client remains a shell over protocol and authoritative state.

## Requested changes checklist

- [ ] GUI map interaction replaces the manual controls panel
- [ ] right-click on a cell asks the backend for allowed actions
- [ ] backend validator returns action candidates for the current player and cell
- [ ] frontend shows returned actions such as move, rotate, throw
- [ ] frontend submits the chosen action as an authoritative request
- [ ] special cards move into a bottom overlay
- [ ] special cards glow on the active player's turn
- [ ] special cards are greyed out and disabled off-turn
- [ ] header and room metadata become compact horizontal layout
- [ ] entire map stays on screen with minimal dead space
- [ ] scoreboard supports five-round play visibility
- [ ] inner `10 x 10` rotation zone is visually marked with a distinct boundary
- [ ] player markers become larger and faster to read
- [ ] auction resolves one revealed card at a time
- [ ] next auction card stays hidden until the previous card finishes
- [ ] each player places their own treasure-card set by reading their own card values
- [ ] treasure placement phase is added to the round flow
- [ ] a configurable test settings file is added
- [ ] creator code translates config into engine-understood variables

## Omission scan

The user request implicitly adds these secondary work items. They must be tracked too.

- [ ] player-specific snapshot projection for hidden treasure information
- [ ] new protocol messages for action-query and treasure-placement flow
- [ ] new application/domain query helpers for GUI action validation
- [ ] regression tests for sequential auction and treasure placement
- [ ] updated manual playtest guide for the new GUI flow

## Delivery slices

### Slice A. Config and creator pipeline

Goal:
Move test configuration out of hardcoded server helpers and into an editable project config plus a creator adapter.

Touching:

- `config/`
- `apps/server`
- `packages/domain`

Deliverables:

- `testplay` config file
- creator module that converts config into `CreateMatchStateInput`
- engine settings model for configurable values that should not stay hardcoded

Proof:

- config parser or creator tests
- live room creation still works

### Slice B. Round-flow corrections

Goal:
Correct the rule flow so treasure placement happens before action play and auction cards resolve sequentially.

Touching:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `apps/server`

Deliverables:

- treasure placement phase
- per-player treasure ownership model
- sequential single-card auction resolution
- hidden future auction offers in projected client state

Proof:

- domain tests for round bootstrap
- protocol tests for new commands
- application tests for phase transitions

### Slice C. Authoritative GUI action query

Goal:
Support context-menu interactions without moving legality checks into React.

Touching:

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `apps/server`

Deliverables:

- cell action query model
- backend endpoint for action candidates
- pending targeting support for multi-step actions such as throw, hammer, and fence

Proof:

- domain or application tests for action candidate generation
- server tests for the query endpoint

### Slice D. React GUI shell

Goal:
Replace form controls with a compact board-first interface.

Touching:

- `apps/web`

Deliverables:

- compact header
- scoreboard
- board-first layout with full-map visibility
- right-click context menu
- bottom special-card overlay
- highlighted inner `10 x 10` zone
- larger player markers
- treasure placement and action-targeting states

Proof:

- web tests for transport/config helpers
- manual local playtest path

### Slice E. Documentation and verification

Goal:
Bring docs and tests up to date with the new authoritative GUI flow.

Touching:

- `docs/rules`
- `docs/networking`
- `docs/testing`
- `docs/implementation-log`

Deliverables:

- updated rules and protocol docs
- updated manual playtest guide
- implementation log for the delivered slices

Proof:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build:web`

## Current implementation order

1. Add config file plus creator pipeline.
2. Correct round phases and auction behavior in the domain.
3. Add protocol and server support for treasure placement and action queries.
4. Rebuild the React shell around board-first GUI interactions.
5. Update docs and rerun verification.
