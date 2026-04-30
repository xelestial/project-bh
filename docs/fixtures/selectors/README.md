# Selector Golden Samples

These files are exact selector envelope samples for the stable two-player fixture from `packages/testkit`.

- `match.publicState.v1.json`: public board, public players, public round state.
- `match.viewerPrivate.v1.json`: private data for `player-1`.
- `match.turnHints.v1.json`: authoritative affordances for `player-1`.
- `match.snapshotBundle.v1.json`: React compatibility bundle composed from the granular selector payloads.

The server test `apps/server/src/selectors/selector-golden.test.ts` fails if any selector output drifts from these samples. Update these files only when the protocol contract intentionally changes.
