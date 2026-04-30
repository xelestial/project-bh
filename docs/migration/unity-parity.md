# Project. BH Unity Parity Baseline

## Portability rules already enforced

- Rules live in `packages/domain`.
- Application handling is separated from presentation and transport.
- Protocol validation is independent from React and server runtime details.
- Runtime storage is behind ports; Redis does not enter domain rules.
- Frontend-visible data is selector-projected and versioned.
- Test fixtures are reusable without a renderer.
- `docs/fixtures/unity-parity/asset-catalog.v1.json` enumerates the current reusable selector, replay, rule, and rotation samples for Unity consumers.

## Parity strategy

Unity migration should treat the current TypeScript implementation as the reference specification.

The first parity targets should be:

1. match creation and corner seat placement
2. priority-card submission and deterministic turn order
3. mandatory-step plus secondary-action turn flow
4. treasure pickup and open flow
   - including hidden slot-to-score mapping and fake-card handling
5. fire, water, and electric tile interactions
6. auction resolution, fence purchases, and charged special-card inventory updates
7. square2 plus large-hammer cross5 and rectangle6 rotation transforms
8. round completion after the fourth opened treasure
9. next-round preparation with persistent HP, persistent elimination, and persistent non-treasure board state
10. final match result calculation excluding eliminated players
11. selector envelopes such as `match.publicState.v1`, `match.viewerPrivate.v1`, `match.turnHints.v1`, and the compatibility bundle `match.snapshotBundle.v1`
12. command envelopes with backend-resolved player identity and idempotent `commandId` handling

## Expected future parity assets

- replay fixtures for full rounds, starting with `docs/fixtures/replays/five-round-command-log.v1.json`
- tile interaction and status golden cases, including river, ice, elimination, and skip-countdown samples in `docs/fixtures/rules/`
- rotation golden cases in `docs/fixtures/rotations/` for cross5 and rectangle6 large-hammer transforms
- auction and special-card scenario fixtures in `docs/fixtures/scenarios/`
- charged-inventory projection samples for the player HUD in `docs/fixtures/projections/`
- protocol snapshot samples in `docs/fixtures/protocol/`
- granular selector payload samples for public state, viewer-private state, turn hints, and the React compatibility bundle in `docs/fixtures/selectors/`
- server rejection catalogs in `docs/fixtures/protocol/`
- player-private treasure projection samples for Unity client parity checks
- secure reconnect/session-token samples so Unity can match the same transport-auth contract without trusting public player ids
- resolution-step fixtures for complex skills so Unity can verify damage, push, collision, tile effects, treasure drops, and turn interruption in the same order as the TypeScript reference
- Redis command/event stream samples for backend-engine parity checks in `docs/fixtures/runtime/`
- online benchmark profiles for room, command, reconnect, selector, and Redis stream latency targets
- checked asset catalog entries for every committed parity fixture

## Unity client boundary

Unity should consume the same backend protocol and selector outputs as the React client. Unity should not depend on Redis keys, Redis Streams, React projection internals, or server-local socket state. Those are infrastructure details behind the backend gateway and engine worker.

For parity, Unity should verify:

- it can authenticate with a private session token without trusting public `playerId`
- it can render only selector-projected public/viewer data
- it treats command responses and WebSocket updates as authoritative
- it can replay deterministic scenario fixtures independently of Redis
