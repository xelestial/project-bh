# 2026-04-18 Special Card Inventory Refactor

## Summary

- replaced single-use special-card ownership with charged inventory counts in the domain model
- split fence handling away from the auction offer deck and added direct `1`-point fence purchases during the auction phase
- exposed charged special-card inventory in the player HUD and updated the React shell to show remaining uses
- implemented and regression-tested `largeHammer`, `recoveryPotion`, `jump`, and `hook`

## Code changes

- `packages/domain`
  - auction awards now add charge bundles instead of pushing one-shot card ids
  - `purchaseSpecialCard` now models direct fence buying during auction
  - `useSpecialCard` supports:
    - `largeHammer` for `cross5` and `rectangle6`
    - `recoveryPotion` for full heal plus status clear
    - `jump` for exact two-tile straight movement
    - `hook` for straight-line player pulls
- `packages/application`
  - added `match.purchaseSpecialCard`
  - updated turn-affordance and cell-action queries to use charged inventory
- `packages/protocol`
  - validated the new purchase command and expanded special-card enums
- `apps/web`
  - special-card overlay now renders remaining charges
  - recovery potion can be used directly from inventory
  - auction HUD now includes a fence purchase button

## Verification

- `pnpm typecheck`
- `node --experimental-strip-types --test packages/domain/src/domain.test.ts packages/application/src/handle-match-command.test.ts packages/application/src/query-turn-affordances.test.ts packages/protocol/src/match-command-schema.test.ts`
- `node --experimental-strip-types --test apps/server/src/client-state-projector.test.ts apps/server/src/match-config-creator.test.ts apps/web/src/index.test.ts apps/web/src/runtime-transport.test.ts`
- `pnpm build:web`
- `pnpm test:browser-smoke`
  - skipped in this sandbox because Chrome headless debugging is unavailable
