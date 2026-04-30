# Replay Fixtures

Replay fixtures are durable external protocol samples. They intentionally avoid session tokens, Redis keys, and full internal `MatchState` dumps.

- `five-round-command-log.v1.json` is a compact five-command replay export sample for `project-bh.replay.v1`.

The protocol test `packages/protocol/src/replay-schema.test.ts` validates this file against the replay export schema.
