# Project. BH Test Strategy

## Current baseline

The repository starts with fast headless tests using Node's built-in test runner.

Current coverage includes:

- server session creation, raw validation rejection, reconnect, and event logs
- HTTP room lifecycle and websocket lobby broadcast
- config resolution for server and web runtime wiring
- local web client adapter view-model flow
- sequential auction submission and resolution
- treasure placement phase bootstrap
- centered `6 x 6` treasure-placement zone inside the inner board area
- priority submission and deterministic turn order
- mandatory-step turn enforcement
- secondary-step extra movement consumption
- authoritative turn-affordance projection for mandatory and secondary stages
- domain movement and treasure pickup
- treasure opening and round completion
- tile throwing and board mutation
- electric stun/damage behavior
- resolution pipeline coverage for damage, electric wet stun, elimination, carried-treasure drop, and bomb impact sequencing
- giant-flame normalization
- square2 rotation with treasure movement
- special-card board mutation and fence removal
- large-hammer charged rotation
- direct fence purchase during auction
- recovery, jump, and hook special-card effects
- next-round preparation with persistent HP, persistent elimination, and persistent non-treasure board state
- match completion that excludes eliminated players from winner calculation
- application-layer rejection mapping
- protocol payload validation
- browser smoke coverage for host-create, guest-join, treasure placement, sequential auction reveal, and right-click movement query
- board bootstrap coverage for five fire, five water, and five electric tiles seeded inside the rotation zone
- projector coverage for player-private treasure data and opener-only reveal behavior
- HTTP integration coverage for public/private snapshot separation and unknown-room rejection safety
- HTTP integration coverage for invalid session-token rejection and secure per-player reconnect flow
- selector envelope tests for exact frontend payload boundaries
- selector registry tests for public/viewer private-data separation
- selector golden-sample tests that compare `docs/fixtures/selectors/*.json` with the stable two-player projection fixture
- secure session-token tests for entropy, HMAC hashing, constant-time verification, and redaction
- runtime-store contract tests for room/session/snapshot/stream persistence
- Redis runtime-store integration tests gated by `REDIS_URL`
- engine-worker tests for command application, rejection events, snapshot revision, and idempotency
- HTTP command tests proving backend-resolved player identity and repeated `commandId` idempotency
- CORS and fixed-window rate-limit tests
- online-game benchmark smoke coverage for room creation, joins, starts, and commands

## Regression policy

- Every future rules bug should add a focused domain regression test first.
- New complex skills should add a resolution-plan test that asserts the ordered `ResolutionStep` sequence before or with command-level behavior tests.
- Ambiguous game behavior should be captured as a fixture or scenario test before UI work relies on it.
- Unity parity should reuse the same scenario names and expected outcomes.

## Property-based rule validation

Project. BH uses `fast-check` to validate broad rule invariants in the domain layer. Property tests live next to domain example tests as `*.property.test.ts` files and use shared generators from `packages/testkit/src/property-arbitraries.ts`.

Use property tests when a rule has many equivalent input shapes or when regressions are more likely to appear through combinations than through a single hand-written scenario. Good candidates include rotation mappings, board normalization, priority ordering, legal command replay, treasure ownership invariants, and protocol validation round trips.

Every property must be deterministic. Do not call `Math.random()` from a property or from domain code under test. If a property fails, copy the fast-check seed and path from the failure output into a focused regression test before or with the fix.

Run all property tests with:

```bash
node --experimental-strip-types --test packages/domain/src/*.property.test.ts
```

Run the full verification suite with:

```bash
pnpm test
pnpm typecheck
```

Run the optional Redis integration test with:

```bash
REDIS_URL=redis://127.0.0.1:6379 pnpm test -- apps/server/src/runtime/redis-runtime-store.integration.test.ts
```

Run the online-game benchmark smoke test with:

```bash
pnpm test -- apps/server/src/benchmark/online-game-benchmark.test.ts
```

Run a larger local benchmark with:

```bash
BH_BENCH_ROOMS=100 BH_BENCH_PLAYERS=4 BH_BENCH_COMMANDS=1 pnpm benchmark:online
```

## Human playtest baseline

- Local human-vs-human playtests should run against the authoritative HTTP/WebSocket server, not a client-only mock.
- The current manual startup and smoke path live in `docs/testing/manual-testplay.md`.
- Every manual issue that changes rules behavior should become a regression test and, when reusable, an implementation-log entry.
- GUI interaction regressions should be captured at two layers:
  - domain/application tests for legality
  - browser-facing smoke tests for treasure placement, sequential auction reveal, and right-click action query
  - UI checks for card-shaped priority inventory and visible turn-order chips
  - targeted UI tests for move highlights and overlay state when the shell gains a component-test harness
  - snapshot-boundary tests that assert hidden information never leaks through either HTTP refresh or websocket room updates

## Planned next layers

1. Golden fixtures for cross5 and rectangle6 rotation examples.
2. Scenario fixtures for river, ice drop, elimination, and round-tick status behavior.
3. Redis-backed reconnect hydration and backend fanout tests with a shared Redis service in CI.
4. Replay-oriented tests for full five-round command logs.
5. UI component tests for the React playtest shell.
6. Expand browser smoke coverage to include special-card targeting, fence purchase, and next-round progression.
