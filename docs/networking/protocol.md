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
- `match.openTreasure`
- `match.endTurn`
- `match.prepareNextRound`

Each command currently requires:

- `type`
- `version`
- `matchId`
- `playerId`

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
  - `hammer5`
  - `hammer6`
  - `fence`
- and then card-specific targeting data:
  - `targetPosition`
  - `targetPlayerId`
  - `fencePositions`
  - `selection`
  - `direction`

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
  - `playerId`
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
  - `playerId`
- Invite endpoints:
  - `GET /api/invite/:inviteCode`
    - returns room preview metadata for the waiting room
  - `POST /api/invite/:inviteCode/join`
    - joins a lobby without exposing the raw room id in the primary client flow
- Existing room endpoints remain valid for server internals, snapshot refresh, and websocket routing.

This lets the web shell support:

- shareable invite links
- short invite-code entry
- recent-room recall on the client
- waiting-room UX that is centered on party formation instead of raw identifiers

## Player-specific projection

- Room snapshots sent to clients are now projected per player.
- The projection includes:
  - the current turn stage for the active player
  - authoritative turn affordances for the viewer
    - mandatory-move highlight targets
    - secondary-move highlight targets
    - whether extra move, throw, rotate, special-card, open-treasure, and end-turn actions are currently available
    - per-special-card availability flags
  - the current revealed auction card
  - resolved auction winners by offer slot
  - the viewer's own treasure cards with point values
  - treasure values for opened or viewer-owned treasures only
- Unrevealed auction offers and other players' hidden treasure values stay off the wire to the GUI shell.

- Rotation legality is currently not range-limited by player position in the projection layer or rule engine.
- The GUI may visually mark the configured center `10 x 10` zone, but legality for rotation still comes from server-side selection validation.

## Local transport bootstrap

The local multiplayer shell now supports explicit runtime transport configuration.

- Server bind host and port:
  - CLI: `--host`, `--port`
  - env: `HOST`, `PORT`
- Web dev-server bind host and port:
  - CLI: `--host`, `--port`
  - env: `WEB_HOST`, `WEB_PORT`
- Web backend connection target:
  - CLI: `--backend-host`, `--backend-port`
  - CLI override: `--backend-http-url`, `--backend-ws-url`
  - env: `BACKEND_HOST`, `BACKEND_PORT`
  - env override: `BACKEND_HTTP_URL`, `BACKEND_WS_URL`

This keeps port binding and connection routing outside the rules engine while preserving the same authoritative command protocol.

## Next protocol expansions

1. Shared response schema validation for projected room snapshots.
2. Server-to-client event envelope with message ids.
3. Rejection code catalog shared by server and clients.
4. Snapshot plus event replay samples for parity tests.
5. Durable persistence DTOs for rooms and replays.
