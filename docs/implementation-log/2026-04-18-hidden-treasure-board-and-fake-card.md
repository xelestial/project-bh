# 2026-04-18 Hidden Treasure Board And Fake Card

## Summary

Refactored the treasure setup and projection flow so treasure slot numbers and scores stay off the public snapshot after dealing, while still supporting a shuffled treasure-card deck, a public `1-7` treasure-board strip, and one fake card with no matching slot.

## Scope

- config
- packages/domain
- apps/server
- apps/web
- docs

## Changed areas

- replaced fixed per-seat treasure point assignment with a deterministic shuffled treasure-card deck in `config/testplay-config.ts`
- added public treasure-board slot metadata to match state while keeping actual card values and slot mappings viewer-private
- allowed one fake treasure card with `slot: null`, excluded it from placement completion, and kept it out of the public treasure board
- tightened client projection so unopened treasure tokens no longer expose slot ids, owner ids, or visible point values
- updated the web shell to show a public treasure-board strip plus a private treasure-placement hand
- added projector and match-config creator tests for private treasure visibility and deterministic dealing

## Preserved invariants

- treasure legality still stays server-authoritative
- the React shell still renders projected state instead of inventing hidden information
- treasure opening still resolves in the domain layer and is not guessed in the client
- deterministic setup still comes from explicit creator logic instead of browser randomness

## Tests and verification

- ran `pnpm typecheck`
- ran `pnpm test`
- ran `node --experimental-strip-types --test apps/server/src/client-state-projector.test.ts apps/server/src/match-config-creator.test.ts`

## Documentation updated

- docs/architecture/overview.md
- docs/rules/game-rules.md
- docs/networking/protocol.md
- docs/testing/test-strategy.md
- docs/testing/manual-testplay.md
- docs/migration/unity-parity.md
- docs/implementation-log/2026-04-18-hidden-treasure-board-and-fake-card.md

## Open questions

- the current implementation assumes the fake card has no matching board slot or map token and therefore never yields a score
- if the fake card should have a separate reveal or bluff interaction later, the treasure card and map token aggregates should be split explicitly instead of sharing one `TreasureState`

## Next recommended slice

- split treasure cards and treasure map tokens into separate domain aggregates if the fake-card rule grows beyond the current no-slot decoy behavior
