# 2026-04-18 Human Playtest Baseline

## Summary

Closed the gap between headless correctness and local human-vs-human testing by making the HTTP server bind explicitly to localhost, adding an HTTP/WebSocket lifecycle smoke test, and documenting the manual two-browser playtest flow.

## Scope

- apps/server
- docs/testing

## Changed areas

- changed the HTTP server bootstrap to listen on `127.0.0.1` by default instead of an implicit all-interface bind
- made server startup await the actual listening socket so runtime checks and future integration tests can use the resolved port safely
- added an HTTP/WebSocket integration test covering health, room creation, join, start, and lobby broadcast
- added a manual playtest guide for two human players on one local machine

## Preserved invariants

- the rules engine remains domain-first and renderer-agnostic
- the server remains authoritative for room lifecycle and match progression
- the web client still acts as an input and rendering shell, not the source of truth

## Tests and verification

- added `apps/server/src/http-server.test.ts`
- ran `pnpm test`
- ran `pnpm typecheck`
- started the local server and confirmed `/health`
- created a room through the live HTTP API
- started the local Vite client at `http://127.0.0.1:5173/`

## Documentation updated

- docs/testing/test-strategy.md
- docs/testing/manual-testplay.md

## Open questions

- browser-level E2E coverage for the full two-tab flow is still not automated
- the current playtest UI is function-first and should later be improved for readability without moving rules into React

## Next recommended slice

- Browser E2E coverage for host create, guest join, and start-match synchronization
