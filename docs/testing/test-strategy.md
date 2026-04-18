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
- priority submission and deterministic turn order
- mandatory-step turn enforcement
- secondary-step extra movement consumption
- authoritative turn-affordance projection for mandatory and secondary stages
- domain movement and treasure pickup
- treasure opening and round completion
- tile throwing and board mutation
- electric stun/damage behavior
- giant-flame normalization
- square2 rotation with treasure movement
- special-card board mutation and fence removal
- next-round preparation and match completion
- application-layer rejection mapping
- protocol payload validation

## Regression policy

- Every future rules bug should add a focused domain regression test first.
- Ambiguous game behavior should be captured as a fixture or scenario test before UI work relies on it.
- Unity parity should reuse the same scenario names and expected outcomes.

## Human playtest baseline

- Local human-vs-human playtests should run against the authoritative HTTP/WebSocket server, not a client-only mock.
- The current manual startup and smoke path live in `docs/testing/manual-testplay.md`.
- Every manual issue that changes rules behavior should become a regression test and, when reusable, an implementation-log entry.
- GUI interaction regressions should be captured at two layers:
  - domain/application tests for legality
  - browser-facing tests for right-click action query, move highlights, and overlay state once E2E coverage is added

## Planned next layers

1. Golden fixtures for cross5 and rectangle6 rotation examples.
2. Scenario fixtures for river, ice drop, elimination, and round-tick status behavior.
3. Replay-oriented tests for full five-round command logs.
4. UI component tests for the React playtest shell.
5. Browser E2E coverage for the host-create, guest-join, start-match path.
