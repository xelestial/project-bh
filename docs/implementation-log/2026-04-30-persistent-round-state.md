# 2026-04-30 Persistent Round State

## Summary

Updated round transition rules so HP and elimination state persist across rounds. Non-treasure board state already persisted and is now covered by a regression test. Eliminated players are also excluded from final winner calculation.

## Scope

- packages/domain
- docs

## Changed areas

- changed `prepareNextRound` to preserve player HP instead of restoring configured starting HP
- changed `prepareNextRound` to preserve `eliminated` instead of reviving eliminated players
- kept next-round position, carried-treasure, and temporary-status reset behavior
- changed match result calculation to consider only non-eliminated players
- added domain regression coverage for persistent HP, persistent elimination, persistent non-treasure board state, and eliminated-player winner exclusion

## Preserved invariants

- board tile and fence state remain domain-owned and deterministic
- treasure state still resets to the next round's placement flow
- protocol shape remains unchanged
- React and server code still do not own rule decisions

## Tests and verification

- ran `node --experimental-strip-types --test packages/domain/src/domain.test.ts --test-name-pattern "preparing the next round preserves"`
- ran `node --experimental-strip-types --test packages/domain/src/domain.test.ts --test-name-pattern "preparing the next round preserves|match completion excludes"`
- ran `pnpm typecheck`
- ran `pnpm test`
- ran `pnpm build:web`

## Documentation updated

- docs/rules/game-rules.md
- docs/testing/test-strategy.md
- docs/migration/unity-parity.md
- docs/implementation-log/2026-04-30-persistent-round-state.md

## Open questions

- Temporary fire, water, skip-turn, and movement-limit status currently resets between rounds; only HP and elimination were changed to persist.

## Next recommended slice

- Add full-suite verification and push this rule update on top of the current resolution-engine branch.
