# Rotation Golden Fixtures

These fixtures capture deterministic large-hammer rotation behavior for renderer
and engine parity checks. They intentionally store a compact input/output
summary rather than full `MatchState` dumps.

Each sample fixes:

- the active player, card, selection, direction, and initial tile/treasure setup
- the affected tile footprint after rotation
- moved treasure position
- remaining card charges
- authoritative turn advancement and event order
