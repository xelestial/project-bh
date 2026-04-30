# Match UI Layout Principles

Project. BH uses the browser client as a production-grade presentation shell for the shared rules engine. Match UI work must keep the board dominant, the current action obvious, and the React layer free of gameplay rule ownership.

## Viewport Targets

- Primary desktop target: `1920 x 1080`.
- Supported smaller desktop target: `1280 x 720` through `1680 x 1050`.
- Mobile portrait must remain board-first, with private resources in a bottom sheet rather than a stacked desktop layout.

## Layout Contracts

- At `1920 x 1080`, the board should occupy at least `40%` of the viewport in normal match play.
- At `1280 x 720`, the board should occupy at least `32%` of the viewport.
- Top HUD plus player state should stay at or below `112px` on primary desktop and `96px` on smaller desktop.
- Phase guidance must not overlap the board.
- Mobile bottom sheet content should stay within `45%` of the viewport height.
- Mobile layouts must not create horizontal page overflow.

## Information Groups

- Shared match status: room, round, phase, turn stage, active player.
- Player state: score, HP, treasure carrying, elimination.
- Shared board: tiles, players, treasures, zones, legal-action highlights.
- Private resources: priority, treasure, and special cards.
- Contextual actions: current phase guidance, rotation mode, legal action affordances, end-turn controls.

## Typography And Labels

- Player-facing compact labels must stay at or above `12px`.
- Primary phase and command text should be at least `14px` where space allows.
- Player-facing status should use localized labels rather than raw enum names.
- Use numeric alignment for score, HP, round, slot, and card values where repeated values are scanned side by side.

## Interaction

- The server remains authoritative for legal actions.
- React may highlight affordances and collect input, but must not invent rule legality.
- Board hit targets may stay precise on desktop; mobile should use bottom-sheet controls, clear selected states, and a future zoom/targeting mode for dense cells.
