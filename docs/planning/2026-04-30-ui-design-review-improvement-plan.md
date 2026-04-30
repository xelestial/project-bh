# 2026-04-30 UI Design Review Improvement Plan

## Goal

Make the current browser prototype feel like a readable commercial multiplayer board/strategy game while preserving the Project. BH architecture rules:

- game rules remain outside React
- server-authoritative legality stays unchanged
- the UI only projects canonical state and submits commands
- the board renderer remains a replaceable presentation layer for the future Unity client

This plan uses `1920 x 1080` as the primary design target, while still requiring graceful support below that size. The current evidence comes from a live audit of the local match screen at:

- desktop: `1280 x 720`
- mobile portrait: `390 x 844`
- screenshots: `/private/tmp/project-bh-ui-audit/landing-cdp.png`, `/private/tmp/project-bh-ui-audit/match-1280x720.png`, `/private/tmp/project-bh-ui-audit/match-390x844.png`
- metrics: `/private/tmp/project-bh-ui-audit/metrics.json`

## Commercial Game Comparison Baseline

Use these as product-direction references, not as direct visual copies.

- Digital board game adaptations such as CATAN Universe, Wingspan, Root, and Dune: Imperium Digital keep the shared board/table as the visual anchor, then place private hand/resources around it.
- Board Game Arena's current studio guidance is a good web-specific benchmark: central area is shared actions, top/bottom are global info, side/player panels are private resources, score/turn/objectives should remain always accessible.
- Commercial UI generally keeps instructions short and contextual. The player should see "what can I do now?" before reading a paragraph.

## Current State Verdict

The current UI is promising as a functional playtest shell, but not yet user-friendly by commercial-game standards.

Strengths:

- The quarter-view map direction is right for a future Unity path.
- Shared board, player status, treasure board, hand, and special cards are already separated conceptually.
- The lobby flow is practical: create, join by code, open rooms, recent rooms.
- The UI avoids hiding core game material behind unrelated menus.

Primary problems:

- The tilemap is too small on desktop and partly unusable on mobile.
- Similar information is visible, but not prioritized by game importance.
- Several important labels are below comfortable reading size.
- Phase guidance is visually dominant but placed as a blocking overlay.
- Bottom inventory is too tall for mobile and too dense for desktop scanning.
- Board cell hit targets are far below mobile accessibility size.

## Evidence From Live Measurements

Desktop `1280 x 720`:

- Board visible bounds: `480 x 301`, about `15.7%` of the viewport area.
- Board stage: `1274 x 413`, but the board itself uses only about `27.5%` of the stage area.
- Top chrome before the board area: top strip `33px`, scoreboard `28px`, treasure strip `95px`.
- Bottom inventory: `134px`, about `18.6%` of viewport height.
- Phase callout: `168 x 643`, taller than the board stage and visibly colliding with the board/footer region.
- Board metadata font: `10.24px`.
- Inventory heading font: `10.24px`.
- Score stat font: `12.16px`.
- Board cell hit targets: about `24 x 14`, far below a `44px` touch target.

Mobile `390 x 844`:

- Top strip, scoreboard, and treasure strip consume roughly `252px` before the board stage starts.
- Board visible bounds: `360 x 165`.
- Footer inventory: `311px`, about `36.8%` of viewport height.
- Phase callout remains `643px` high and blocks the board.
- Priority cards require horizontal scrolling and visually fight the board.

## Information Architecture Target

Split the match screen into five stable information groups.

1. Shared game state
   - round, phase, active player, goal, turn stage
   - should live in a compact top status rail

2. Opponent/player state
   - score, HP, treasure carrying, eliminated status
   - should be compact and always visible, but not taller than the board needs

3. Shared board/table
   - tilemap, players, treasures, zones, action previews
   - should be the largest visual object on screen

4. Private player hand/resources
   - priority cards, treasure cards, special cards
   - should sit in a bottom tray on desktop and a bottom sheet/tab set on mobile

5. Contextual command affordances
   - current legal actions, selected pending action, rotation mode, end turn
   - should appear close to the board and current phase, not as generic text blocks

## Desired Layout Ratios

Primary desktop target: `1920 x 1080`

- Board/table should occupy at least `40-50%` of total viewport area.
- Board stage should receive at least `65%` of viewport height after global HUD.
- Top HUD plus player state should stay under `112px` in normal play.
- Bottom tray should be `120-168px`, but only show phase-relevant groups.
- No instructional overlay should intersect the board's central `70%` area.

Supported smaller desktop/laptop target: `1280 x 720` through `1680 x 1050`

- Board/table should occupy at least `32-40%` of total viewport area.
- Board stage should receive at least `56%` of viewport height after global HUD.
- Top HUD plus player state should stay under `96px` in normal play.
- Bottom tray should be `96-140px`, with non-phase resources collapsed.
- Treasure slots and secondary resource groups may compact earlier than they do at `1920 x 1080`.

Tablet/landscape target: `768px` through `1279px` wide

- Keep the board visible as the first interactive object.
- Collapse secondary panels into compact rails or tabs.
- Prefer one expanded private-resource group at a time.
- Do not require horizontal page scroll.

Mobile portrait target:

- Treat mobile as a board-first spectator/turn-taking layout, not a squeezed desktop.
- Board should be visible before private hand details.
- Use a bottom sheet with tabs: `Actions`, `Hand`, `Players`, `Treasures`.
- Keep the active command button and phase title visible without covering board cells.
- Use at least `44px` tap targets for interactive commands.

## Improvement Plan

### Slice A. Establish UI Design Constraints

Goal:
Create explicit design constraints before changing layout.

Deliverables:

- Add a `docs/design/ui-layout-principles.md` or `DESIGN.md` section for match UI hierarchy.
- Define minimum type sizes:
  - body/readable labels: `16px`
  - compact HUD labels: `12px` minimum
  - primary game-state values: `14-16px`
  - card numbers/score values: `18px+`
- Define board-first layout metrics:
  - desktop board area target
  - mobile board visibility target
  - overlay collision limits
  - tap target minimums
- Define semantic color roles for:
  - active player
  - self player
  - legal mandatory move
  - legal secondary action
  - rotation origin/preview
  - treasure placement zone
  - blocked/unavailable action

Proof:

- The constraints are documented before code changes.
- Future UI changes can be reviewed against measurable thresholds.

### Slice B. Rebuild Match Screen Layout Around The Board

Goal:
Make the tilemap the dominant object on desktop.

Recommended layout:

- Top rail: one line for brand/room, round, phase, active player, self, refresh.
- Player status rail: compact chips/cards with score, HP, carrying treasure.
- Main area: board-centered stage with minimal internal padding.
- Right or top-right context cluster: current objective and active action controls.
- Bottom tray: private cards/resources, phase-scoped.

Concrete changes:

- Reduce `.board-stage` top padding from a fixed `6.4rem` to a layout-dependent value.
- Move `.phase-callout` out of the board's left side and into a compact toast/status rail.
- Collapse treasure slots into smaller state tokens when not in treasure-resolution focus.
- Make `boardViewportSize` prefer board dominance over full UI equality.
- Add zoom controls only after the default fit is improved.

Proof:

- At `1920 x 1080`, board area reaches at least `40%` of the viewport.
- At `1280 x 720`, board area rises from `15.7%` to at least `32%`.
- No phase callout overlaps the board at any supported breakpoint.
- Board stays fully visible without vertical scroll in desktop play.

### Slice C. Fix Phase Guidance

Goal:
Show what the player should do now without covering the game.

Current issue:

- The treasure placement callout becomes a narrow vertical block, `168 x 643`, because its width is tied to `tileWidth * 7`.
- Korean text is forced into vertical wrapping, which is not acceptable for commercial polish.

Recommended behavior:

- Replace the large callout with:
  - compact phase chip: `Treasure Placement`
  - one short command sentence
  - selected card summary
  - primary next action if available
- Put detailed help behind a `?` icon or a player-aid panel.
- Animate phase changes briefly, then settle into a compact status state.

Proof:

- Korean phase copy remains horizontal at `390px`, `768px`, `1280px`, and `1920px`.
- Phase guidance never exceeds `72px` height in normal play.
- The player can identify the required next action within 3 seconds.

### Slice D. Make The Board Readable And Clickable

Goal:
Make the tilemap readable at a glance and reliable to interact with.

Problems to solve:

- Cell hit targets are about `24 x 14` on desktop.
- Tile effect icons are visible only after careful inspection.
- Player sprites are charming but too small relative to the strategic grid.
- Treasure/zone markings compete with pale tile surfaces.

Recommended changes:

- Separate visual tile size from hit target size.
- Desktop: keep precise pointer hit testing, but add hover outlines and tooltips.
- Mobile: use tap-to-select with enlarged logical hit regions or a zoomed board mode.
- Increase player marker contrast and add a clear active/self ring.
- Strengthen zone outlines as region-level contours instead of per-cell noise.
- Move coordinate text out of accessible button text where possible; use better `aria-label`s.

Proof:

- Active player, self, treasure zone, and legal cells are identifiable in a blurred/squint test.
- Mobile tap targets for board commands are at least `44px` in interaction mode, or the UI enters a zoomed targeting mode.
- Tile kinds are distinguishable without relying only on small icons.

### Slice E. Rework Bottom Inventory Into Phase-Aware Trays

Goal:
Keep private information visible without letting it overpower the map.

Current issue:

- Desktop bottom tray is usable but dense.
- Mobile bottom inventory consumes `311px`, more than one third of the viewport.
- Priority cards, treasure cards, and special cards all compete even when only one category matters.

Recommended desktop behavior:

- Priority phase: show priority cards large, collapse treasure/special sections.
- Treasure placement phase: show treasure cards large, collapse priority/special sections.
- In-turn phase: show action strip and special cards, collapse priority cards into used-card summary.
- Completed/round-end: show revealed treasure/score summary.

Recommended mobile behavior:

- Bottom sheet with tabs:
  - `Action`
  - `Hand`
  - `Players`
  - `Treasures`
- Default open tab follows phase.
- Sheet can collapse to a `56px` handle while the player inspects the board.

Proof:

- At `390 x 844`, board remains readable with the bottom sheet collapsed.
- At `1280 x 720`, no more than two private-resource groups are visually expanded at once.
- At `1920 x 1080`, the bottom tray can show richer card art, but still does not pull attention away from the map.

### Slice F. Improve Lobby Usability

Goal:
Make the lobby feel less like a dev tool and more like a commercial party flow.

Current strengths:

- Create, join by code, open parties, and recent rooms are all discoverable.
- Invite code and link flow is practical.

Problems:

- Hero copy says "Party-first Multiplayer Lobby", which describes implementation rather than player value.
- Explanatory paragraphs are longer than needed.
- Disabled buttons have weak explanation for first-time users.
- The three panels have equal weight even though host/join are the main tasks.

Recommended changes:

- Rename hero to a player-facing promise, for example `Start a Match` or `Play Project. BH Online`.
- Make `Host` and `Join` the first two dominant actions; make `Open Parties` secondary unless rooms exist.
- Replace long notes with short inline helper text.
- Use stronger empty states:
  - no open parties: `No open parties yet`
  - secondary action: `Create one`
- Keep recent rooms compact and below the primary tasks.

Proof:

- A new player can answer "host or join?" immediately.
- Empty open-room state uses fewer words and one clear next action.

### Slice G. Typography And Alignment Pass

Goal:
Make all necessary information readable without inflating every element.

Current issues:

- Several important labels are `10.24px-12.16px`.
- English and Korean labels mix in the same status rail.
- Rounded glass panels are visually consistent but too uniformly soft.

Recommended changes:

- Keep compact HUD text at `12px+`; use weight/color for hierarchy instead of shrinking.
- Use Korean for player-facing labels consistently, with English only for debug/dev values if explicitly marked.
- Replace raw `Phase treasurePlacement` and `Turn 대기` with localized labels.
- Use tabular numbers for score, HP, round, slot, and card values.
- Reduce giant border radii on app shell/card surfaces; reserve large radii for modal/sheet containers.

Proof:

- No player-facing label below `12px`.
- Primary command and phase text are at least `14px`.
- No raw enum strings are visible in the player-facing UI.

### Slice H. Verification And Regression Metrics

Goal:
Prevent the layout from regressing as rules/UI grow.

Add a browser layout audit that creates a match and measures:

- board viewport area ratio
- board-stage area ratio
- overlay/board intersection
- minimum player-facing font sizes
- count of undersized interactive controls outside board precision mode
- mobile horizontal scroll
- bottom tray height by phase

Suggested thresholds:

- `1920 x 1080` board area: `>= 40%` viewport in normal match screen.
- `1280 x 720` board area: `>= 32%` viewport in normal match screen.
- `1920 x 1080` top HUD + player state: `<= 112px` in normal play.
- `1280 x 720` top HUD + player state: `<= 96px` in normal play.
- Tablet layout has no horizontal page scroll and keeps one primary board region visible.
- Mobile collapsed bottom sheet: `<= 72px`.
- Mobile expanded bottom sheet: `<= 45%` viewport height.
- No player-facing text below `12px`.
- No command button below `44px` touch height.

Proof:

- `pnpm test:browser-smoke` or a new visual smoke path records these metrics.
- Screenshots are saved for `desktop`, `tablet`, and `mobile`.
- Failures explain which layout contract was violated.

## Recommended Delivery Order

1. Document UI constraints and target ratios.
2. Fix the phase callout first because it actively blocks the board.
3. Reallocate match layout space so the board becomes dominant on desktop.
4. Make the inventory phase-aware.
5. Improve board readability and targeting.
6. Add mobile bottom-sheet behavior.
7. Polish lobby copy and information hierarchy.
8. Add browser layout regression metrics.

## Definition Of Done

- The map is the first visual object users notice in the match screen.
- Current phase, active player, score/HP, and available action are visible without reading paragraphs.
- Similar information is grouped by purpose, not by implementation component.
- Mobile play is intentionally designed, not a stacked desktop layout.
- Board interaction remains protocol-driven and server-authoritative.
- UI changes do not add gameplay rules to React.
- Screenshots and layout metrics prove the improvement at desktop and mobile sizes.

## Open Questions

- Should mobile portrait be fully supported for active play now, or should the first target be "spectate/inspect plus landscape recommended"?
- Should treasure slots stay as a full visual strip during every phase, or collapse except during treasure-focused phases?
- Should Project. BH prefer a board-game table look or a tactics-video-game HUD look as its long-term visual vocabulary?
