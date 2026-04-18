# AGENTS.md

> Project charter and execution rules for coding agents working on **Project. BH**.
> This repository is expected to be developed with **Codex** and **Claude Code**.
> The immediate target is a **multiplayer React-based game**. The long-term shipping target is **Unity**.
> Every implementation decision must preserve maintainability, explicit architecture, and portability of the game rules.

---

## 1. Mission

Build Project. BH as a **browser-first multiplayer prototype** with professional engineering discipline.

The React version is **not** a throwaway demo. It is the first production-grade implementation of:

- the game rules,
- the multiplayer protocol,
- the domain model,
- the test strategy,
- and the design vocabulary that will later be carried into Unity.

Agents must optimize for:

1. **Long-term maintainability**
2. **Explicit architecture and boundaries**
3. **Deterministic game logic**
4. **Server-authoritative multiplayer correctness**
5. **Ease of migration from React to Unity**
6. **High testability and low hidden coupling**

---

## 2. Non-negotiable architectural principles

### 2.1 Domain first
The game rules are the product. UI is only a projection of state.

Agents must keep all core rules in a **renderer-agnostic domain layer**.

Never bury game logic in:

- React components
- CSS/UI event handlers
- websocket callbacks
- animation code
- scene/view code
- framework-specific state containers

If a rule affects gameplay, scoring, turn order, movement, tile transformation, combat, status effects, treasure ownership, elimination, or round resolution, it belongs in the domain/application layers, not the presentation layer.

### 2.2 Server authoritative multiplayer
The multiplayer model must be **server authoritative**.

Clients may:

- collect input,
- predict small UX interactions when explicitly allowed,
- render local feedback,
- and reconcile.

Clients must not be the source of truth for:

- legal move validation
- damage resolution
- tile transformation outcomes
- turn sequencing
- auction results
- treasure ownership
- victory calculation

### 2.3 Deterministic rules engine
Core simulation code must be deterministic given the same:

- initial state
- command sequence
- seed(s)
- timing model used by the server

Avoid hidden randomness, time-dependent branching, and side effects inside reducers/use-cases.

### 2.4 Explicit dependency injection
Use **explicit DI** and composition roots.

Do not use hidden globals or magical runtime service discovery for core systems.

Allowed:

- constructor injection
- factory injection
- explicit module wiring
- React providers only as composition/injection boundaries

Disallowed for core logic:

- ad hoc singletons
- service locator patterns hidden behind hooks
- implicit imports of mutable shared state
- directly reaching across layers “because it is easier”

### 2.5 Boundaries over convenience
Prefer slightly more ceremony if it creates:

- clear dependencies
- stable interfaces
- isolated tests
- easier refactors
- easier Unity migration

---

## 3. Target architecture

Use a **domain-centric modular monolith** for the first serious version.

Default architecture style:

- **Domain layer**: entities, value objects, rule policies, pure state transitions
- **Application layer**: use cases, commands, orchestration, transaction boundaries
- **Infrastructure layer**: transport, persistence, websocket server, timers, logging, serialization
- **Presentation layer**: React UI, view models, input mapping, animation/display concerns

This is effectively a **Clean Architecture / Hexagonal Architecture** style with explicit ports and adapters.

### 3.1 Preferred high-level package split
If using a monorepo, prefer a structure similar to:

```text
/apps
  /web                # React client
  /server             # authoritative multiplayer server
/packages
  /domain             # pure game rules and models
  /application        # command handlers / use cases
  /protocol           # message schemas, DTOs, contracts
  /infra              # adapters, persistence, transport helpers
  /ui                 # reusable presentation primitives
  /tooling            # lint, config, scripts, test utilities
/docs
  /architecture
  /rules
```

If the repo stays single-package initially, keep the same logical separation in directories.

### 3.2 Bounded contexts
As the project grows, prefer splitting by domain capability instead of by framework artifact.

Good domain-oriented modules include:

- board
- tiles
- player
- treasure
- auction
- turn-order
- round-flow
- combat-and-status
- victory-scoring
- networking

Avoid “misc”, “utils”, or giant catch-all directories.

---

## 4. Layer responsibilities

### 4.1 Domain layer
Must contain:

- entities and value objects
- board state
- player state
- tile state and tile transformations
- status effects
- treasure and scoring rules
- elimination rules
- round lifecycle rules
- invariant checks
- deterministic pure transition functions

Must not contain:

- React types/components
- browser APIs
- websocket code
- database code
- timers from framework runtimes
- rendering details

### 4.2 Application layer
Must contain:

- command handling
- use-case orchestration
- validation that coordinates domain rules
- transactional sequencing
- domain event emission
- anti-corruption mapping between protocol DTOs and domain commands

Examples:

- `submitPriorityCard`
- `placeTreasure`
- `movePlayer`
- `throwTile`
- `rotateTiles`
- `useSpecialCard`
- `resolveRoundEnd`

### 4.3 Infrastructure layer
Must contain:

- websocket or realtime transport adapters
- persistence adapters
- logging/metrics adapters
- random seed provider implementation
- clock/timer implementation
- matchmaking/session management
- auth/session transport concerns

Infrastructure may depend on application and domain.
Domain must never depend on infrastructure.

### 4.4 Presentation layer
Must contain:

- React components
- input handlers
- local UI state
- view model mapping
- animation and effects
- accessibility behavior
- optimistic UX only when approved by the protocol

Presentation must never be the place where rules are invented.

---

## 5. Multiplayer rules and protocol principles

### 5.1 Command/event model
Prefer a **command + authoritative state update** model.

Recommended shape:

- Client sends **commands**
- Server validates and applies use-cases
- Server emits **events** and/or canonical updated state
- Client reconciles to authoritative state

### 5.2 Shared protocol contract
All network payloads must be schema-defined and versioned.

Use a shared contract package. Prefer runtime-validation schemas (for example Zod or equivalent) for:

- client-to-server commands
- server-to-client events
- snapshots
- lobby/session metadata
- persistence DTOs

No `any` in protocol boundaries.
No unvalidated external payloads entering application logic.

### 5.3 Versioning
All protocol messages must include a stable message type and version strategy.

If the message system changes, update schemas first.

### 5.4 Reconnection support
Design early for reconnectability.

The server should be able to restore or resend enough state for a reconnecting client to recover the session.

### 5.5 Randomness
All gameplay randomness must be server-owned and reproducible via explicit seeds or logged random draws.

Never use `Math.random()` inside domain logic without an injected RNG abstraction.

---

## 6. React client principles

### 6.1 React is the shell, not the rules engine
React should orchestrate rendering, user interaction, and client composition.
It should not become the real game engine.

### 6.2 State separation
Separate clearly:

1. **Domain state**: canonical game state from server/domain
2. **Application state**: command progress, session state, reconnect state
3. **UI state**: hover, selection, panel visibility, drag preview, modal state

Do not mix these categories casually.

### 6.3 Presenter/view-model boundary
For non-trivial screens, map domain/application data into view models.

Components should render already-prepared values rather than interpret raw domain state deeply in JSX.

### 6.4 Keep React context narrow
React Context may be used for:

- composition roots
- dependency injection
- theme/session/view services

Do not turn Context into a hidden global game-state bag.

### 6.5 Rendering abstraction
Rendering choices should stay replaceable.

If a board renderer becomes complex, isolate rendering strategy behind an adapter or component boundary so the domain model does not care whether the front-end uses:

- DOM
- Canvas
- Pixi
- another renderer

This preserves migration freedom.

---

## 7. Unity migration principles

The React implementation must intentionally prepare for a future Unity implementation.

### 7.1 Preserve engine-independent rules
The authoritative rules must be described in engine-neutral terms.

Unity should later replace:

- presentation
- input adapters
- animation
- scene orchestration

Unity should **not** force a rewrite of the game rules because those rules should already be isolated.

### 7.2 Contract-first migration
The multiplayer protocol and domain behaviors should be stable enough that Unity can act as a new client against the same server contract, or reimplement the same contract precisely.

### 7.3 Spec over framework magic
Whenever behavior is subtle, encode it in:

- tests
- fixtures
- docs
- deterministic examples

Do not let implementation details become the only specification.

### 7.4 Shared scenario fixtures
Create canonical scenario fixtures for important rules:

- tile throwing
- tile rotation
- fire/water/electric/ice interactions
- giant flame and river formation
- treasure drop and pickup
- elimination
- auction resolution
- end-of-round scoring

These fixtures should later be reusable for Unity parity tests.

---

## 8. Dependency injection rules

### 8.1 Composition roots
Use explicit composition roots at application boundaries.

Typical roots:

- web app bootstrap
- game server bootstrap
- test bootstrap
- storybook/playground bootstrap if used

### 8.2 Inject abstractions at boundaries
Inject abstractions for external concerns such as:

- RNG
- clock
- logger
- persistence
- transport
- storage
- telemetry
- auth/session provider

### 8.3 No hidden side effects in constructors
Constructors should wire dependencies and establish valid objects, not perform network calls or irreversible side effects.

### 8.4 Test doubles must be easy to supply
If a dependency cannot be replaced easily in tests, the design is probably wrong.

### 8.5 Hook rules
Custom hooks may consume injected services, but hooks must not become ad hoc service locators that hide architecture.

---

## 9. Testing strategy

Testing is mandatory. Maintainability without tests is not maintainability.

### 9.1 Domain tests
Must heavily test:

- reducers/state transitions
- legal/illegal moves
- rule invariants
- status interactions
- scoring
- round transitions
- deterministic replay behavior

These tests should be fast and framework-light.

### 9.2 Contract tests
Test protocol schemas and compatibility between client/server message definitions.

### 9.3 Integration tests
Test end-to-end use cases at the application/service level, especially for:

- session creation
- joining/rejoining
- turn progression
- auction flow
- treasure opening
- elimination
- round end

### 9.4 UI tests
Use component tests and a small number of high-value E2E tests for critical player journeys.

### 9.5 Regression fixtures
For every bug in rules logic, add a regression test before or with the fix.

---

## 10. Coding rules

### 10.1 TypeScript strictness
Use strict TypeScript. Avoid weakening the type system for convenience.

Disallow unless justified in review comments:

- `any`
- non-null assertions as a habit
- broad type casts to silence errors
- giant union handling without exhaustive checks

### 10.2 Functional core, imperative shell
Prefer a **functional core / imperative shell** model:

- pure domain logic in the center
- effectful orchestration at the edges

### 10.3 Small modules with names that explain intent
Prefer files and functions with sharp responsibilities.

Good names explain game intent, not implementation trivia.

### 10.4 No premature abstraction, no duplicate rule logic
Abstract only after a repeated pattern is proven.
But do not duplicate game rules across client and server.

### 10.5 Comments
Comment:

- why a rule exists
- invariants
- non-obvious protocol decisions
- migration constraints

Do not comment trivial syntax.

---

## 11. Documentation rules

When changing architecture or rules behavior, update docs in the same change.

Keep these docs current:

- `/docs/architecture/overview.md`
- `/docs/rules/game-rules.md`
- `/docs/networking/protocol.md`
- `/docs/testing/test-strategy.md`
- `/docs/migration/unity-parity.md`

If those exact files do not exist yet, create equivalent paths.

Every non-trivial feature should leave behind:

- code
- tests
- updated documentation

---

## 12. Agent workflow rules

These instructions are specifically for coding agents.

### 12.1 Always start with a brief implementation plan
Before significant changes, outline:

- what will change
- affected layers/modules
- invariants that must remain true
- tests to add or update

### 12.2 Prefer vertical slices
Implement features as thin end-to-end slices through the proper layers rather than dumping partial logic into one layer only.

### 12.3 Do not skip verification
After changes, run the strongest relevant checks available.

Minimum expectation when available:

- lint
- typecheck
- unit tests
- relevant integration tests

### 12.4 Protect boundaries
If a quick change would violate architecture, do not take the shortcut silently.
Refactor or create an explicit adapter.

### 12.5 Make incremental, reviewable changes
Prefer small, coherent commits/patches over giant rewrites unless a rewrite is explicitly requested.

### 12.6 Surface ambiguity early
If a game rule is ambiguous, do not invent silent behavior in core logic.
Add a TODO, note the ambiguity, and isolate the assumption so it can be changed safely.

### 12.7 Preserve portability
When implementing React-only convenience, ask whether it will block the Unity path.
If yes, redesign.

---

## 13. Recommended delivery order

Unless a human explicitly requests another order, prefer this sequence:

1. Domain model and invariants
2. Rule engine / use-case layer
3. Protocol schemas
4. Authoritative server flow
5. React presentation shell
6. E2E flow and regression fixtures
7. Performance tuning and polish

Do not start with flashy UI if the rules engine is still unstable.

---

## 14. Anti-patterns to avoid

Do not introduce these patterns without a strong written reason:

- game rules inside React components
- duplicated rule logic between client and server
- mutable singleton stores imported everywhere
- websocket handlers directly mutating UI state as the source of truth
- “god objects” such as one gigantic `GameManager` owning all logic
- giant files combining domain, transport, and UI concerns
- framework-driven folder structures that hide domain boundaries
- random bug fixes without regression tests
- silent protocol shape changes
- time-based behavior that is not modeled explicitly

---

## 15. Definition of done

A task is not done unless, where applicable:

- architecture boundaries still hold
- tests pass
- new rules behavior is covered by tests
- protocol changes are schema-validated
- docs are updated
- naming is clear
- the change does not make Unity migration harder

---

## 16. Practical note for Codex and Claude Code

- **Codex** reads `AGENTS.md` files directly.
- **Claude Code** reads `CLAUDE.md`, not `AGENTS.md`.

For Claude Code, keep a small project-level `CLAUDE.md` that imports this file:

```md
@AGENTS.md
```

Add Claude-specific instructions below that import only if truly necessary.

---

## 17. Preferred tone for generated code and docs

Agents should optimize for:

- clarity over cleverness
- explicitness over magic
- determinism over convenience
- portability over framework lock-in
- maintainability over short-term speed

When in doubt, choose the design that a new senior engineer can understand quickly and extend safely six months later.
