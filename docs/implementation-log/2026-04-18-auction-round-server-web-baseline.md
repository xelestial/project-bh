# 2026-04-18 Auction Round Server Web Baseline

## Summary

Completed the next major vertical slice on top of the earlier turn-and-tile engine work. The codebase now supports auction-phase round starts, special-card ownership and usage, fence state, next-round preparation, final match resolution, an in-memory authoritative server layer, and a local client adapter that projects authoritative state into a UI-friendly view model.

## Scope

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`
- `apps/server`
- `apps/web`
- `docs/`

## Changed areas

- added auction offers, bid submission, and deterministic winner resolution
- added special-card ownership to player state
- added special-card effects for bombs, hammers, and fences
- added fence state to the board model
- added next-round preparation and final match-completion calculation
- added in-memory authoritative session management with reconnect payloads and event logs
- added local web client adapter methods and view-model projection

## Preserved invariants

- rules still live in the domain layer
- application still maps commands into domain mutations
- protocol validation still gates external payloads before application logic
- server remains authoritative even in the local in-memory baseline
- client code still consumes snapshots and commands instead of inventing rules

## Tests and verification

- added domain tests for auction resolution, special-card effects, and match completion
- added server integration tests for raw validation, snapshots, logs, and reconnect
- added web adapter tests for authoritative view-model updates
- expanded protocol tests for auction, special-card, and next-round commands
- ran `pnpm test`
- ran `pnpm typecheck`

## Documentation updated

- `docs/architecture/overview.md`
- `docs/planning/implementation-roadmap.md`
- `docs/rules/game-rules.md`
- `docs/networking/protocol.md`
- `docs/testing/test-strategy.md`
- `docs/migration/unity-parity.md`

## Open questions

- the hidden-information treasure placement workflow still needs a more player-authentic round-start protocol
- round-to-round board reset behavior is still an explicit assumption and may need revision after playtesting
- richer replay serialization and persistence are still pending
- a real React renderer still needs to be layered on top of the local client adapter contract

## Next recommended slice

- replay-oriented full-match fixtures and a real React board shell
