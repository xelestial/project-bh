# 2026-04-18 Match Bootstrap Baseline

## Summary

Established the first executable baseline for Project. BH as a domain-first TypeScript monorepo. The delivered slice focuses on match bootstrap and the smallest authoritative gameplay loop needed to prove the package boundaries: create a match, move the active player, pick up a treasure, open it at the start tile, and complete a round after four opened treasures.

## Scope

- `packages/domain`
- `packages/application`
- `packages/protocol`
- `packages/testkit`
- `apps/server`
- `apps/web`

## Changed areas

- created workspace and TypeScript configuration
- created domain state model for board, player, treasure, and round state
- implemented deterministic match creation
- implemented active-player move, treasure pickup, turn end, and treasure open flow
- added application command handler with rejection mapping
- added protocol validation baseline for movement, open-treasure, and end-turn commands
- created baseline architecture, rules, protocol, testing, and migration docs

## Preserved invariants

- gameplay rules remain outside React and server runtime code
- protocol validation happens before application orchestration
- authoritative state flow remains server-oriented
- implemented outcomes are deterministic from state plus command input

## Tests and verification

- added domain tests for pickup, open, and round completion
- added application tests for rejection mapping and successful move flow
- added protocol tests for valid command parsing and invalid payload rejection
- ran `pnpm test`
- ran `pnpm typecheck`

## Documentation updated

- `docs/architecture/overview.md`
- `docs/rules/game-rules.md`
- `docs/networking/protocol.md`
- `docs/testing/test-strategy.md`
- `docs/migration/unity-parity.md`

## Open questions

- the exact `1+2` movement contract still needs a dedicated turn-budget model
- priority-card exhaustion and reset rules need explicit state modeling
- tile interaction ordering should be fixed with scenario fixtures before server implementation deepens

## Next recommended slice

- `Slice 2. Round bootstrap and priority resolution`
