# 2026-04-18 Browser Smoke Coverage

## Summary

Added a browser-facing smoke test for the board-first playtest shell, including host room creation, guest join flow, treasure placement through the right-click action query, sequential auction reveal, and the first authoritative movement step.

## Scope

- apps/web
- docs/testing

## Changed areas

- added stable `data-*` hooks to the React shell for browser automation without moving any rules logic into the client
- added `apps/web/src/gui-smoke.e2e.test.ts` to boot the authoritative server plus Vite shell and drive two headless browser sessions
- encoded the current smoke path around treasure placement, auction reveal order, priority submission, and right-click movement
- made the browser smoke test skip cleanly when headless Chrome debugging is unavailable in the current environment

## Preserved invariants

- legality still comes from authoritative server endpoints and commands
- React remains a projection shell over protocol and snapshot state
- hidden treasure information stays player-specific
- the smoke path exercises the real HTTP, WebSocket, and browser layers together

## Tests and verification

- ran `pnpm typecheck`
- ran `pnpm test`
- ran `pnpm build:web`
- ran `node --experimental-strip-types --test apps/web/src/gui-smoke.e2e.test.ts` and confirmed it skips in the current sandbox because Chrome headless debugging is blocked

## Documentation updated

- docs/testing/test-strategy.md
- docs/testing/manual-testplay.md
- docs/implementation-log/2026-04-18-browser-smoke-coverage.md

## Open questions

- the current sandbox cannot expose a usable Chrome remote-debugging endpoint, so the browser smoke path still needs confirmation in a normal local shell outside this environment

## Next recommended slice

- extend browser smoke coverage to special-card targeting, turn handoff, and next-round progression
