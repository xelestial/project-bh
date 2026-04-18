# 2026-04-18 Party Invite Lobby UX

## Summary

Reworked the multiplayer entry flow around a commercial-game-style party lobby. Players no longer need to remember a raw room id as the primary path. The server now exposes short invite codes plus invite lookup/join endpoints, and the web client now centers on shareable invite links, recent parties, and a dedicated waiting room.

## Scope

- apps/server
- apps/web
- docs/networking
- docs/testing

## Changed areas

- added server-generated 6-character invite codes to room state
- added invite preview and invite join endpoints
- updated the HTTP server test to validate invite-based joining
- replaced the raw room-id join flow in the web shell with invite-code entry and invite preview
- added recent-party recall, saved player name, and a dedicated waiting-room share panel

## Preserved invariants

- the authoritative match lifecycle still begins on the server
- websocket routing still uses canonical room and player identifiers internally
- invite flow changes do not move gameplay legality into the client

## Tests and verification

- updated server integration coverage for invite lookup and invite join
- ran `pnpm test`
- ran `pnpm build:web`
- ran `pnpm typecheck`

## Documentation updated

- docs/networking/protocol.md
- docs/testing/manual-testplay.md
- docs/implementation-log/2026-04-18-party-invite-lobby-ux.md

## Open questions

- long-running rooms currently keep invite-code uniqueness only in-memory; durable room storage can preserve this once persistence is added

## Next recommended slice

- browser-level tests for invite-link auto-fill, waiting-room share actions, and recent-party recall
