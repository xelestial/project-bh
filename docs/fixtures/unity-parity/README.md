# Unity Parity Fixture Catalog

`asset-catalog.v1.json` is the handoff index for engine parity work. Unity
clients should treat these files as renderer-independent contract samples:
selectors for payload boundaries, rule/rotation samples for deterministic
simulation parity, and replay exports for command-log compatibility.

The catalog stores relative repository paths only. It must not include session
tokens, Redis keys, or full internal match snapshots.
