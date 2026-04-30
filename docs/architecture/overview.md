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
  - In-memory authoritative session layer with snapshots, command logs, subscriptions, reconnect payloads, and server-issued player session tokens.
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
- local client adapter and view-model composition
- player-private snapshot projection for hidden treasure data
- server-issued reconnect/session tokens so transport auth does not trust public `playerId` values
- explicit public/private snapshot boundaries
  - public state contains only shared board, round, score, and occupancy data
  - viewer state contains private inventory, hand, and opened-treasure details for one player only
  - player-private turn-order projection is surfaced after priority resolution
  - treasure placement is constrained to a centered `6 x 6` zone inside the inner `10 x 10` board area

## Near-term build order

1. Deepen scenario coverage for remaining ambiguous rule interactions.
2. Expand server snapshots and replay export into a durable external contract.
3. Replace the local client adapter with a real React board shell.
4. Add persistence and richer operational telemetry around the authoritative loop.

The more detailed sequence now lives in `docs/planning/implementation-roadmap.md`.
