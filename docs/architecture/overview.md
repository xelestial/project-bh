# Project. BH Architecture Overview

## Current baseline

Project. BH starts as a domain-centric TypeScript monorepo.

- `packages/domain`
  - Pure state model and deterministic rules.
- `packages/application`
  - Command handling and domain error mapping.
- `packages/protocol`
  - Versioned payload validation at the network boundary.
- `packages/testkit`
  - Reusable fixtures for regression and parity tests.
- `apps/server`
  - Authoritative HTTP/WebSocket gateway, selector projection, secure session handling, runtime-store ports, Redis adapter, and engine worker.
- `apps/web`
  - Local client adapter and view-model projection layer over the authoritative server.

Supporting process docs:

- `docs/planning/implementation-roadmap.md`
  - Delivery order and slice-level execution plan.
- `docs/process/documentation-rules.md`
  - Rules for how project knowledge must be written and maintained.
- `docs/implementation-log/`
  - Slice completion records and reusable lessons.

## Why this shape

The repository is intentionally arranged so the rules engine remains portable to future Unity work.

- Domain never depends on React, sockets, timers, or persistence.
- Application orchestrates use cases and is the first anti-corruption layer above domain.
- Protocol owns validation of external payloads before application logic runs.
- Server and web are shells around shared rules and contracts.
- Complex action after-effects are modeled as explicit domain `ResolutionStep` sequences. This keeps future skills from embedding damage, tile effects, treasure drops, and turn interruption directly inside React, transport handlers, or one large special-card branch.

## Current implemented slices

The current baseline now covers:

- deterministic match creation
- auction-phase round bootstrap
- player start positions on a 20x20 board
- testplay boards seeded with `5` fire, `5` water, and `5` electric tiles inside the rotation zone
- special-card deck and revealed auction offers
- priority-card submission and turn-order resolution
- mandatory-step plus secondary-action turn structure
- treasure pickup with immediate turn end
- treasure opening at the start tile
- throwable fire, water, and electric tiles
- basic fire, water, electric, ice, giant-flame, and river state transitions
- domain-level resolution pipeline for reusable action after-effects such as damage, tile effects, elimination, carried-treasure drops, and bomb impact sequencing
- fence placement and fence-aware movement/rotation constraints
- charged special-card inventory, fence auction purchases, and special-card use for bombs, hammers, recovery, jump, hook, and fences
- 2x2, cross-5, and rectangle-6 rotation transforms
- next-round preparation and match-completion calculation
- protocol validation for the current command set
- in-memory authoritative session management
- local client adapter and React playtest-shell view-model composition
- player-private snapshot projection for hidden treasure data
- server-issued reconnect/session tokens so transport auth does not trust public `playerId` values
- HMAC-hashed session token storage, cryptographic invite-code generation, production Redis config validation, CORS allowlists, and fixed-window request limits
- runtime-store ports for rooms, sessions, match snapshots, command streams, event streams, idempotency records, and rate-limit counters
- Redis runtime adapter that stores canonical JSON records and uses Redis Streams for command/event transport
- authoritative engine worker that applies queued command envelopes through `packages/application` and writes canonical snapshots/events
- runtime-backed reconnect hydration so a backend with an empty local room cache can restore room/session context from Redis
- backend event fanout poller that reads authoritative event streams with per-backend stream cursors
- online-game benchmark harness for many rooms, players, commands, and optional WebSocket clients
- granular selector contracts for `publicState`, `viewerPrivate`, and `turnHints`, with the existing React snapshot bundle composed from those smaller contracts
- selector golden samples in `docs/fixtures/selectors/` for React and Unity parity checks
- rule scenario golden samples in `docs/fixtures/rules/` for river formation, river movement blocking, ice-triggered treasure drops, elimination drops, and round-tick skip countdowns
- rotation golden samples in `docs/fixtures/rotations/` for large-hammer cross5 and rectangle6 parity checks
- replay export schema and compact command-log samples in `docs/fixtures/replays/`
- Unity parity asset catalog in `docs/fixtures/unity-parity/` that enumerates reusable selector, replay, rule, and rotation fixtures
- browser-smoke CI workflow that runs the visual browser smoke path with `RUN_BROWSER_SMOKE=1`
- explicit public/private snapshot boundaries
  - public state contains only shared board, round, score, and occupancy data
  - viewer state contains private inventory, hand, and opened-treasure details for one player only
  - player-private turn-order projection is surfaced after priority resolution
  - treasure placement is constrained to a centered `6 x 6` zone inside the inner `10 x 10` board area

## Near-term build order

1. Keep the browser-smoke CI workflow stable as the GUI grows; every new critical board interaction should either extend `apps/web/src/gui-smoke.e2e.test.ts` or add a lower-level view-model assertion.
2. Add resolved scenario fixtures for newly finalized special-card combinations as rules stabilize.

The more detailed sequence now lives in `docs/planning/implementation-roadmap.md`.

## Redis authoritative runtime

Redis is infrastructure, not the rules engine. Domain and application packages still own deterministic rules and command application. The server layer now exposes runtime-store ports so the local in-memory adapter and Redis adapter share the same responsibilities:

- room records and public lobby metadata
- player session records keyed by HMAC token hash
- canonical match snapshots with revision and log length
- backend-to-engine command streams
- engine-to-backend event streams
- idempotency records keyed by command id
- rate-limit counters
- durable stream cursors keyed by session and consumer name

The HTTP/WebSocket process acts as a backend gateway. It authenticates a private `sessionToken`, injects the authoritative `playerId`, validates command payloads through `packages/protocol`, appends command envelopes, and returns selector-projected snapshots. If a backend instance has no local room cache, it can hydrate the room and player session from the runtime store before serving reconnect HTTP or WebSocket traffic. The engine worker applies command envelopes through `handleMatchCommand`, persists the next canonical snapshot, writes event envelopes, and preserves idempotency for repeated `commandId` values. Backend instances poll event streams with their own consumer names and broadcast fresh selector projections only to sockets connected to that process.
