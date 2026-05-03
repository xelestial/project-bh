# Project. BH Manual Testplay Guide

## Goal

Run a local human-vs-human playtest with one authoritative server and two browser clients.

This guide is for validating that:

- two human players can share one room
- a second player can join directly from the open-party browser
- public rooms appear in the open-party browser with the chosen party name
- private rooms stay invite-only and do not appear in the open-party browser
- the host can start a match
- both clients reconcile against the same authoritative state
- the current rule slices can be exercised by hand
- the standard 4-player test setup uses seven openable treasure cards plus one fake card
- the standard 4-player board setup uses five fire, five water, and five electric tiles seeded inside the rotation zone
- the standard treasure-placement area is the centered `6 x 6` zone inside the inner `10 x 10` board area
- browser tabs do not share a player session unless they deliberately reuse the same tab-scoped session state

## Local startup

Install dependencies once:

```bash
pnpm install
```

Start the authoritative server in terminal 1:

```bash
pnpm dev:server
```

or from the repo root:

```bash
./run-server.sh
```

Expected result:

- the console prints `Project.BH server listening on http://127.0.0.1:8787`

Start the web client in terminal 2:

```bash
pnpm dev:web -- --host 127.0.0.1 --port 5173 --backend-port 8787
```

or from the repo root:

```bash
./run-web.sh
```

If you want one command that starts both processes together:

```bash
./run-game.sh
```

Expected result:

- Vite prints `Local: http://127.0.0.1:5173/`

## Automated browser smoke

Run the browser smoke path when you want the shell to verify the room lifecycle and the current board-first GUI flow end to end:

```bash
RUN_BROWSER_SMOKE=1 pnpm test:browser-smoke
```

Expected result in a normal local shell:

- the test starts its own authoritative server and Vite web server
- it creates a host room and joins with a second browser session
- it places all treasure cards through the right-click menu
- it verifies auction cards reveal one at a time
- it submits priority cards and confirms the 1-tile mandatory move enters the 2-tile secondary action stage

Environment note:

- the smoke test is opt-in and does not launch a local browser unless `RUN_BROWSER_SMOKE=1` is set
- the smoke test skips itself if local port binding or Chrome headless debugging is blocked by the current sandbox
- `.github/workflows/browser-smoke.yml` runs the same smoke path in CI with `RUN_BROWSER_SMOKE=1` and an explicit Chrome binary

## Port override examples

If default ports are blocked, move both ends explicitly:

```bash
pnpm dev:server -- --host 127.0.0.1 --port 9001
pnpm dev:web -- --host 127.0.0.1 --port 5174 --backend-port 9001
```

If the backend runs on another machine or reverse proxy, point the web shell directly:

```bash
pnpm dev:web -- --backend-http-url https://game.example.com --backend-ws-url wss://game.example.com/ws
```

## Two-player room flow

1. Open `http://127.0.0.1:5173/` in browser window A.
2. Enter host name, party name, choose player count `2`, pick `Public lobby` or `Private invite only`, and create a party.
3. Copy the generated invite link or invite code shown in the waiting-room panel.
4. Open `http://127.0.0.1:5173/` in browser window B or a second browser profile.
5. Either click the room in `Open Parties` if it is public, open the invite link directly, or paste the invite code into the join panel.
6. Enter the second player name and join the party.
7. In window A, press `Start Match`.

Expected result:

- neither player has to manually memorize the raw room id
- a public room appears in `Open Parties` under the chosen party name
- a private room never appears in `Open Parties`
- both clients move from waiting-room state to the live match screen
- both clients show the same round phase and board state
- later commands update both windows through WebSocket broadcasts
- each browser tab keeps its own player session token in `sessionStorage`, so opening a fresh private window should not silently restore the same player as another tab
- each client sees only its own treasure-card values in the bottom overlay
- a fake treasure card, when dealt, stays visible only to the receiving player during `treasurePlacement`
- unopened map treasures never reveal their slot number or score in the shared board view
- priority cards are displayed as `1-6` card tiles, and used cards stay visible in gray
- the resolved turn order is shown after priority submission

## Recommended smoke path

Use this short path for every fresh manual run:

1. In both clients, use the treasure-card overlay to select each real treasure card and then right-click a board cell to place its matching token.
2. If a fake card is dealt, verify it is shown only to that player and does not produce a placeable map token.
3. Verify the treasure-placement phase only ends after all real treasure tokens are placed.
4. In both clients, submit a bid for the currently revealed auction card.
5. Use `울타리 구매 (1점)` or `대형 울타리 구매 (2점)` before submitting a bid when you want to verify direct fence-charge purchases during auction.
6. Verify only one auction card is shown at a time and the next card appears after the previous one resolves.
7. Submit priority cards from both players.
8. Verify the active player matches the resolved priority order.
9. Right-click cells to move, rotate, throw, or use selected special cards. Confirm the mandatory step is 1 tile and the optional movement action is 2 straight-line tiles. Use the bottom inventory overlay to confirm remaining special-card charges decrease after use.
10. End turn and verify the other client receives the same active-player update.
11. When a round completes, press `다음 라운드`.

The automated smoke test covers steps 1 through 7 for the current shell.

## Open-party browser checks

1. Create two public rooms with different party names.
2. Confirm both appear in `Open Parties`.
3. Toggle the `Recent` and `Players` sort controls.
4. Confirm `Players` sort puts the fuller room first.
5. Turn off `빈자리만` and confirm full public lobby rooms appear but cannot be joined from the browser card.
6. Create one private room.
7. Confirm the private room is joinable by invite code but does not appear in `Open Parties`.

## Current manually testable commands

- treasure placement
- sequential auction bidding
- priority-card submission
- right-click cell action query
- mandatory 1-tile movement plus optional 2-tile secondary movement
- tile throw
- square2 rotation and large-hammer cross5/rectangle6 rotation
- special card targeting from the bottom overlay
- direct recovery-potion use from the bottom overlay
- treasure opening
- turn ending
- next-round preparation

## What to record after a playtest

Add a short dated entry under `docs/implementation-log/` when a playtest reveals something reusable.

Record:

- which path was exercised
- whether the issue was rules, protocol, server flow, or UI mapping
- the exact observed vs expected result
- the regression test added
- the reference docs updated

## Avoid these playtest notes

Do not create:

- one endless diary file for every session
- vague notes like `movement felt weird`
- logs that do not name the command sequence or expected outcome
- notes that live only in chat and never reach docs or tests
