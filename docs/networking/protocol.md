# Project. BH Protocol Baseline

## Command model

The authoritative protocol starts with command validation before application handling.

Current client-to-server commands:

- `match.submitAuctionBids`
- `match.submitPriority`
- `match.placeTreasure`
- `match.movePlayer`
- `match.throwTile`
- `match.rotateTiles`
- `match.useSpecialCard`
- `match.purchaseSpecialCard`
- `match.openTreasure`
- `match.endTurn`
- `match.prepareNextRound`

Each command currently requires:

- `type`
- `version`
- `matchId`
- `playerId`

At the transport edge, the local HTTP/WebSocket shell now authenticates the acting player with a server-issued `sessionToken` and the server injects the authoritative `playerId` before command validation and application handling.

Command requests may include `commandId`. The backend stores command envelopes with the resolved `playerId`; repeated `commandId` values are idempotent and do not advance the canonical match snapshot a second time.

`match.movePlayer` also requires:

- `direction`: `north | east | south | west`

`match.submitPriority` also requires:

- `priorityCard`: `1 | 2 | 3 | 4 | 5 | 6`

`match.submitAuctionBids` also requires:

- `bids`
  - sequential auction currently uses the currently revealed offer only
  - `{ amount }[]` or `{ offerSlot, amount }[]`

`match.placeTreasure` also requires:

- `treasureId`
- `position`: `{ x, y }`

`match.throwTile` also requires:

- `source`: `{ x, y }`
- `target`: `{ x, y }`

`match.rotateTiles` also requires:

- `direction`: `clockwise | counterclockwise`
- `selection`
  - `square2` with `origin`
  - `cross5` with `center`
  - `rectangle6` with `origin` and `orientation`

`match.useSpecialCard` also requires:

- `cardType`
  - `coldBomb`
  - `flameBomb`
  - `electricBomb`
  - `largeHammer`
  - `fence`
  - `largeFence`
  - `recoveryPotion`
  - `jump`
  - `hook`
- and then card-specific targeting data:
  - `targetPosition`
  - `targetPlayerId`
  - `fencePositions`
    - `fence`: 2 straight orthogonally adjacent positions
    - `largeFence`: 3 straight orthogonally adjacent positions
  - `selection`
  - `direction`

`match.purchaseSpecialCard` also requires:

- `cardType`
  - current implementation accepts `fence` and `largeFence`

`match.prepareNextRound` may also include:

- `treasurePlacements`
  - keyed treasure positions for the next round

## Versioning

- Command version is currently fixed at `1`.
- Unknown versions are rejected before application logic.
- Unknown command types are rejected before application logic.
- Invalid positions, rotation selections, and priority-card values are rejected before application logic.

## GUI action query

The GUI shell now uses a backend-validated cell-action query path before sending authoritative commands.

- Endpoint:
  - `POST /api/rooms/:roomId/actions/query`
- Request shape:
  - `version`
  - `sessionToken`
  - `cell`
  - optional `pendingAction`
- Response shape:
  - `actions`
  - each action may contain:
    - an authoritative command payload to send next
    - a next pending GUI action for multi-step targeting
    - or a clear-pending instruction

This keeps move, rotate, throw, treasure-placement, and special-card targeting legality on the backend instead of in React.

## Lobby and invite flow

The local multiplayer shell now supports party-style invite entry instead of requiring players to remember a raw room id.

- Room creation returns:
  - `roomId`
  - `inviteCode`
  - `roomName`
  - `visibility`
  - `playerId`
  - `sessionToken`
- Open party browser endpoint:
  - `GET /api/rooms`
    - returns joinable public lobby rooms only
    - current implementation excludes private, full, and already started rooms
    - supports `sort=recent|players`
    - supports `hasSeat=true|false`
      - `true` keeps only parties with free seats
      - `false` includes full public lobby rooms as disabled list entries
- Invite endpoints:
  - `GET /api/invite/:inviteCode`
    - returns room preview metadata for the waiting room
  - `POST /api/invite/:inviteCode/join`
    - joins a lobby without exposing the raw room id in the primary client flow
- Existing room endpoints remain valid for server internals, snapshot refresh, and websocket routing.

Player session transport now behaves like this:

- `POST /api/rooms`
  - returns a new `playerId` plus a private `sessionToken`
- `POST /api/invite/:inviteCode/join`
  - returns a new `playerId` plus a private `sessionToken`
- `GET /api/rooms/:roomId?sessionToken=...`
  - restores the viewer-specific snapshot for that player session
- `POST /api/rooms/:roomId/start`
  - accepts `sessionToken`, not raw `playerId`
- `POST /api/rooms/:roomId/actions/query`
  - accepts `sessionToken`, not raw `playerId`
- `POST /api/rooms/:roomId/commands`
  - accepts `sessionToken`, not raw `playerId`
- `GET /ws?roomId=...&sessionToken=...`
  - binds the socket to the server-resolved player session

This means `playerId` is no longer treated as a secret reconnect credential on the wire.

Session token policy:

- session tokens are generated with cryptographic randomness
- Redis/runtime storage uses HMAC token hashes, not plaintext session tokens
- command handling resolves the player from the token hash before validation
- client-supplied `playerId` is overwritten at the transport boundary
- host-only actions compare against the resolved player id
- invite codes are not credentials and are generated with crypto-backed randomness

This lets the web shell support:

- shareable invite links
- short invite-code entry
- open-party browsing and one-click join for public waiting rooms
- private invite-only rooms that stay off the public browser
- recent-room recall on the client
- waiting-room UX that is centered on party formation instead of raw identifiers

## Player-specific projection

- Room snapshots sent to clients are now projected per player.
- Frontend-facing match data is exposed through a selector registry. The current React-compatible bundle is `match.snapshotBundle.v1`.
- Selector envelopes include `selectorId`, `version`, `revision`, and `payload`.
- Selector envelopes are validated in `packages/protocol`, and raw `MatchState` is not sent as the frontend contract.
- Granular selector contracts are now defined alongside the compatibility bundle:
  - `match.publicState.v1`
    - shared board, public player summaries, public treasure token data, round status, and auction status excluding viewer-only submission state
  - `match.viewerPrivate.v1`
    - the authenticated viewer's private player data, treasure placement hand, revealed treasure cards, and viewer-only auction submission state
  - `match.turnHints.v1`
    - authoritative affordances for the authenticated viewer's available actions
  - `match.snapshotBundle.v1`
    - compatibility envelope composed from the three smaller selector payloads for the React shell
- Golden selector envelope samples live in `docs/fixtures/selectors/` and are verified by `apps/server/src/selectors/selector-golden.test.ts`.
- The server uses the same player-specific projection rules for both:
  - `GET /api/rooms/:roomId?playerId=...`
  - websocket `room.updated` payloads for started rooms
- The projection includes:
  - the current turn stage for the active player
  - player special-card inventory charge counts for the current inventory overlay
  - authoritative turn affordances for the viewer
    - mandatory-move highlight targets
    - secondary-move highlight targets
    - visible normal-rotation origin cells for the optional rotate mode
    - whether extra move, throw, rotate, special-card, open-treasure, and end-turn actions are currently available
    - per-special-card availability flags
  - the resolved turn-order queue after priority submission
  - the current revealed auction card
  - resolved auction winners by offer slot
  - the public treasure-board slot strip
    - slot occupancy
    - whether a slot has already been opened
  - the viewer's current treasure-placement hand during `treasurePlacement`
    - real-card slot number
    - real-card score
    - fake-card marker
  - the viewer's own opened-treasure details after opening
- Public `state.players` entries now expose only:
  - `id`
  - `name`
  - `seat`
  - `position`
  - `score`
  - `hitPoints`
  - `eliminated`
  - `carryingTreasure`
- Viewer-private state now lives under `viewer.self`:
  - `carriedTreasureId`
  - `openedTreasureIds`
  - `availablePriorityCards`
  - `specialInventory`
  - status flags
- The public room snapshot does not include:
  - treasure slot numbers on map tokens
  - treasure-card owner ids
  - treasure-card scores for placed but unopened cards
  - internal treasure ids that encode slot numbers
  - fake-card details for other players
  - another player's priority-hand, inventory charges, or carried-treasure id
- Unrevealed auction offers and other players' hidden treasure values stay off the wire to the GUI shell.
- Treasure ids projected to clients are opaque per-session ids rather than internal slot- or card-derived ids, so the frontend cannot infer treasure numbering from DOM or network payloads.
- Viewer restoration in the web shell is now stored in tab-scoped `sessionStorage`, so separate browser windows do not silently reuse the same player session by sharing a local reconnect record.

- Rotation legality is currently not range-limited by player position in the projection layer or rule engine.
- The GUI may visually mark the configured center `10 x 10` zone, but legality for rotation still comes from server-side selection validation.
- Treasure placement uses a separate centered `6 x 6` zone inside the `10 x 10` inner board area.

## Local transport bootstrap

The local multiplayer shell now supports explicit runtime transport configuration.

- Server bind host and port:
  - CLI: `--host`, `--port`
  - env: `HOST`, `PORT`
- Server runtime:
  - env: `RUNTIME_STORE=memory|redis`
  - env: `REDIS_URL` when Redis mode is enabled
  - env: `SESSION_TOKEN_SECRET` when Redis mode is enabled
  - env: `CORS_ALLOWED_ORIGINS` as a comma-separated allowlist
- Production server runtime:
  - env: `NODE_ENV=production`
  - env: `RUNTIME_STORE=redis`
  - env: `REDIS_URL` using the deployment Redis endpoint
  - env: `SESSION_TOKEN_SECRET` with at least 32 characters, never the local default
  - env: `CORS_ALLOWED_ORIGINS` with explicit web origins; empty allowlists become wildcard CORS and are rejected in production
  - check: `pnpm check:server-production-config`
- Web dev-server bind host and port:
  - CLI: `--host`, `--port`
  - env: `WEB_HOST`, `WEB_PORT`
- Web backend connection target:
  - CLI: `--backend-host`, `--backend-port`
  - CLI override: `--backend-http-url`, `--backend-ws-url`
  - env: `BACKEND_HOST`, `BACKEND_PORT`
  - env override: `BACKEND_HTTP_URL`, `BACKEND_WS_URL`

This keeps port binding and connection routing outside the rules engine while preserving the same authoritative command protocol.

## Redis command and event transport

The runtime store defines these logical streams:

- `bh:match:{sessionId}:commands`
  - backend gateway writes command envelopes after auth and protocol validation
- `bh:match:{sessionId}:events`
  - engine worker writes authoritative command results
- `bh:match:{sessionId}:cursor:{consumerName}`
  - engine workers and backend fanout pollers store the last processed stream id for restart handoff

The in-memory adapter uses the same port contract for local tests. The Redis adapter serializes records as JSON, stores command/event history in Redis Streams, and stores stream cursors as small string records. Redis keys are prefixed so deployment environments can isolate Project. BH data.

Backend instances may serve reconnect traffic even after a process restart or when the room was originally created by another backend instance. On cache miss, the gateway loads the room record and HMAC session record from the runtime store, verifies the token has not expired or been revoked, and then returns the normal selector-projected room snapshot. WebSocket upgrades use the same hydration path.

For multi-process fanout, each backend instance has its own fanout consumer name. It polls authoritative event streams from Redis and broadcasts `room.updated` only to sockets currently attached to that process.

## Request protection

- CORS can be restricted by `CORS_ALLOWED_ORIGINS`.
- Room creation, room joins, invite lookups, action queries, commands, and WebSocket upgrades pass through fixed-window rate limits.
- Rate-limit counters live behind the runtime-store port and can be backed by Redis.

## Next protocol expansions

1. Shared response schema validation for projected room snapshots.
2. Server-to-client event envelope with message ids.
3. Rejection code catalog shared by server and clients.
4. Durable persistence DTOs for rooms.
