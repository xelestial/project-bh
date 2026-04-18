# 2026-04-18 Turn Affordance And Extra Move

## Summary

Aligned the turn engine and GUI with the clarified `1+2` rule: the first step is still mandatory, but the second slot can now be spent on either an extra move or one secondary action. The server now projects authoritative turn affordances so the React board can highlight legal move tiles and show when throw, rotate, special-card, and treasure-open actions are actually available.

## Scope

- packages/domain
- packages/application
- apps/server
- apps/web

## Changed areas

- allowed `movePlayer` during the secondary slot and made that second move end the turn immediately
- preserved `coldBomb` movement-limit behavior by removing the extra move when the limit is `1`
- added an application-level turn-affordance query that computes move highlights and action availability on the backend
- projected turn stage and affordance hints into player-specific room snapshots
- updated the React board to render first-step and secondary-move highlights plus compact action-state chips
- gated special-card overlay interactivity on authoritative secondary-slot availability instead of only local turn ownership

## Preserved invariants

- rule legality still lives in the domain/application layers
- the client still does not invent action legality
- rotation remains server-authoritative and deterministic
- hidden-information projection stays player-specific

## Tests and verification

- added domain tests for secondary movement spending and movement-limit rejection
- added application tests for mandatory-step and secondary-slot affordances
- ran `pnpm typecheck`
- ran `pnpm test`
- ran `pnpm build:web`

## Documentation updated

- docs/rules/game-rules.md
- docs/networking/protocol.md
- docs/testing/test-strategy.md
- docs/implementation-log/2026-04-18-turn-affordance-and-extra-move.md

## Open questions

- the source rulebook text still phrases the second slot as action-only, so this implementation now follows the user's clarified correction rather than the literal earlier draft text

## Next recommended slice

- browser E2E coverage for move highlights, secondary-action activation, and right-click action execution
