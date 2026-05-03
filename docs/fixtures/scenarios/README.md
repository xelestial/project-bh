# Special-Card Scenario Fixtures

These fixtures capture resolved multi-step gameplay examples that are useful for Unity parity and backend replay review. They are intentionally compact contract samples rather than full internal `MatchState` dumps.

- `auction-special-card-flow.v1.json`: auction purchase flow for charged special-card inventory.
- `flame-bomb-removes-fence.v1.json`: flame bomb board mutation that removes a fence and consumes the card charge.
- `recovery-potion-clears-status.v1.json`: recovery potion status cleanup and charge consumption.
- `jump-hook-mobility.v1.json`: jump and hook movement-card outcomes with remaining charges.

Add a new scenario fixture when a special-card combination becomes a stable rule contract. Each new fixture should be listed in `docs/fixtures/unity-parity/asset-catalog.v1.json` so parity consumers can discover it.
