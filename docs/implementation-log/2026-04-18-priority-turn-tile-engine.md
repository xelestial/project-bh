# 2026-04-18 Priority Turn Tile Engine

## Summary

Expanded the headless rules engine from a match-bootstrap baseline into a more realistic round-action engine. The codebase now supports priority submission, deterministic turn-order resolution, mandatory-step plus secondary-action turns, tile throwing, core elemental interactions, and board rotation with treasure movement.

## Scope

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`
- `docs/`

## Changed areas

- added priority-card state and submission flow
- added round bootstrap into an active turn phase
- modeled mandatory-step and secondary-action turn stages
- added throw commands with source and target position validation
- added fire, water, electric, ice, giant-flame, and river baseline interaction rules
- added square2, cross5, and rectangle6 rotation transforms
- added treasure rotation with board mutations
- expanded protocol validation and tests for the current command set

## Preserved invariants

- domain rules remain independent from React and transport code
- command validation still happens before application handling
- turn legality remains derivable from authoritative state
- deterministic state transitions remain the center of the rules engine

## Tests and verification

- added domain tests for priority ordering, turn enforcement, throw resolution, electric stun, cluster normalization, and rotation
- updated application tests for new rejection and round-start behavior
- updated protocol tests for submit-priority, throw, and rotate commands
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

- the current `1+2` interpretation is modeled conservatively as one mandatory movement step plus one secondary action
- fence constraints are still missing from rotation legality
- special-card and auction rules still need explicit domain models
- richer round-tick status processing needs dedicated fixtures before it becomes harder to change

## Next recommended slice

- `Slice 7. Elimination, treasure drop, and round resolution`
