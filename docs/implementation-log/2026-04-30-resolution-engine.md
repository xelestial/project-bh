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
- prevented eliminated players from immediately re-picking up treasures dropped by their own lethal movement or special movement resolution
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
- ran `pnpm build:web`
- ran `pnpm test:browser-smoke`
  - skipped because `RUN_BROWSER_SMOKE=1` was not set in this environment

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
