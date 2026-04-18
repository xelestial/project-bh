# 2026-04-18 GUI Playtest Overhaul

## Summary

Reworked the local multiplayer shell around a board-first GUI flow, corrected the round bootstrap to include treasure placement plus sequential auction reveal, and moved test setup into an editable config plus creator pipeline.

## Scope

- config
- packages/domain
- packages/application
- packages/protocol
- apps/server
- apps/web

## Changed areas

- added `config/testplay-config.ts` and a server-side creator that converts editable config into engine match input
- added match settings to domain state so runtime-configurable values reach the engine explicitly
- added a treasure-placement phase and player-owned treasure cards
- changed auction flow to resolve one revealed offer at a time
- added backend-validated cell action querying for the GUI shell
- replaced the form-heavy React controls with a board-first layout, right-click context menu, score strip, and bottom overlay

## Preserved invariants

- rules remain domain-owned and deterministic
- the backend remains authoritative for legality and outcomes
- the React client still renders projected state instead of inventing rules
- hidden treasure information is projected per player instead of being solved in the browser

## Tests and verification

- updated fixture helpers for the new round bootstrap
- ran `pnpm typecheck`
- ran `pnpm test`
- ran `pnpm build:web`

## Documentation updated

- docs/planning/2026-04-18-gui-playtest-overhaul.md
- docs/rules/game-rules.md
- docs/networking/protocol.md
- docs/testing/test-strategy.md
- docs/testing/manual-testplay.md

## Open questions

- treasure placement currently validates against the configured inner rotation zone; rulebook confirmation may still refine that zone
- some browser-only interaction coverage is still manual until E2E tests are added

## Next recommended slice

- Browser E2E coverage for right-click action query, treasure placement, and sequential auction reveal
