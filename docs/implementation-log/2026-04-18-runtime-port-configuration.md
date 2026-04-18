# 2026-04-18 Runtime Port Configuration

## Summary

Made the local multiplayer stack configurable from runtime parameters so server bind ports, web bind ports, and frontend backend-connection targets can all move without changing code.

## Scope

- apps/server
- apps/web
- docs/networking
- docs/testing

## Changed areas

- added a server runtime-config parser for `--host` and `--port`
- added a web runtime-config parser for bind settings and backend routing settings
- changed the web dev/build entrypoints to custom Node wrappers so backend routing parameters can be passed safely without depending on Vite CLI option support
- moved browser fetch and websocket target resolution behind a runtime transport helper

## Preserved invariants

- server authority remains unchanged
- protocol message shapes remain unchanged
- rules logic stays outside the React shell

## Tests and verification

- added `apps/server/src/runtime-config.test.ts`
- added `apps/web/config.test.ts`
- added `apps/web/src/runtime-transport.test.ts`
- ran `pnpm typecheck`
- ran `pnpm test`

## Documentation updated

- docs/networking/protocol.md
- docs/testing/manual-testplay.md

## Open questions

- a production deployment story for non-dev static hosting should later decide whether the browser receives transport config through build-time injection, a bootstrap document, or a runtime config endpoint

## Next recommended slice

- Browser E2E coverage for multi-port room creation and join flow
