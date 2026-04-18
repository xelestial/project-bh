# Project. BH Game Rules Implementation Notes

## Implemented in code

The current codebase implements the following rule-backed behavior.

- Board size is fixed at `20 x 20`.
- Match supports `2-4` players.
- Player start positions are assigned clockwise to the four corners.
- Match settings such as starting HP, starting score, total rounds, auction draw count, and the inner rotation zone are loaded from `config/testplay-config.ts`.
- Each player starts the round with the configured HP and score values.
- A round starts in `treasurePlacement` when treasure cards are configured and only becomes turn-playable after:
  - each player places their own treasure cards
  - all non-eliminated players submit auction bids for the currently revealed card
  - each revealed auction card resolves before the next card is shown
  - all non-eliminated players submit priority cards
- Each round draws the configured number of special-card offers from a deterministic deck cursor.
- Only one auction offer is visible at a time.
- Auction bids are submitted as sealed integer bids for the currently revealed card only.
- Winning bids deduct score immediately and award the currently revealed special card to the winning player.
- Treasure cards belong to specific players and are hidden-information values until the owner sees them or the treasure is opened.
- Treasure placement is currently validated inside the configured inner rotation zone.
- Priority cards are consumed from a player-owned `1-6` hand and reset when the hand is exhausted.
- Higher unique priority cards act earlier.
- Players tied on priority move to the back of the order and are resolved deterministically by clockwise distance from the highest-priority anchor player.
- Each active turn currently has:
  - one mandatory movement step
  - one secondary slot that may be spent on either:
    - one additional movement step
    - one board action
- The mandatory step must happen before the secondary slot can be spent on `movePlayer`, `endTurn`, `throwTile`, `rotateTiles`, `useSpecialCard`, or `openTreasure`.
- An unopened treasure on the destination tile is picked up immediately.
- Picking up a treasure ends the current turn immediately.
- A carried treasure blocks throw and rotate actions.
- A carried treasure blocks special-card use as well.
- A carried treasure still allows movement, and opening is still only allowed at the owner's start tile.
- A carried treasure may only be opened on the player's start tile.
- Opening the fourth treasure completes the round.
- Fire, water, and electric tiles are currently throwable.
- A thrown tile must:
  - come from an orthogonally adjacent source tile
  - target a straight line up to three tiles away
- Throwing a tile turns the source tile into a plain tile.
- Current tile interaction coverage includes:
  - water thrown onto fire leaves water
  - water thrown onto giant flame clears the impacted target tile
  - electric thrown onto water leaves electric
  - fire, water, or ice thrown onto electric replaces electric with the thrown tile
- Connected fire clusters of size `3+` normalize to `giantFlame`.
- Connected water clusters of size `3+` normalize to `river`.
- Fenced tiles cannot be entered by movement.
- Moving onto water applies water status and removes fire status.
- Moving onto fire applies fire status.
- Electric deals `3` damage.
- Electric applied to a wet player also schedules a skipped next turn.
- Ice currently triggers carried-treasure drop resolution with a deterministic fallback direction when no explicit player choice is modeled.
- Rotation currently supports:
  - `square2`
  - `cross5`
  - `rectangle6`
- Rotation does not currently have a player-to-selection distance limit.
- Rotation is blocked when any player occupies a rotated tile.
- Rotation is blocked when a fence crosses the boundary between rotated and non-rotated tiles.
- Unopened treasures inside a rotated area rotate with the board object layout.
- Current special-card support includes:
  - `coldBomb`
    - can set a player's round movement limit to `1`, which removes the extra movement option from the secondary slot
    - can convert a water tile into ice
  - `flameBomb`
    - can create fire on any target tile
    - removes a fence on the target tile before applying fire
  - `electricBomb`
    - can create electric on any target tile
    - removes a fence on the target tile before applying electric
  - `hammer5`
    - unlocks `cross5` rotation for the action
  - `hammer6`
    - unlocks `rectangle6` rotation for the action
  - `fence`
    - places a length-2 fence on two orthogonally adjacent tiles
- Preparing the next round currently:
  - resets HP, elimination, carry state, and temporary status state
  - keeps score, special cards, and remaining priority hand state
  - resets treasures to an unplaced state for the next treasure-placement phase
- At the end of round `5`, the match computes winners by:
  - highest total score
  - then highest opened treasure count
  - then shared victory

## Not implemented yet

The following areas remain pending and should stay in the domain/application layers when added.

- special-card auction flow
- richer status duration and round-tick resolution
- durable external snapshot schema and event envelopes
- persistent server storage
- richer browser E2E coverage for the React presentation layer

## Current assumptions and explicit simplifications

- The current `1+2` interpretation is modeled as:
  - one mandatory positional step
  - one secondary slot that may be spent on exactly one extra move or one non-move action
- Priority ties are currently interpreted as:
  - all tied players move to the back of the round order
  - tied players are ordered by clockwise distance from the highest-priority anchor player
- Auction ties are currently interpreted as:
  - highest bid wins
  - equal bids break by lower seat index
- The current auction model assumes sequential sealed bidding across the drawn offer queue.
- Ice treasure-drop tie cases currently use a deterministic fallback ordering instead of interactive player choice.
- Round reset currently preserves board tile and fence state unless later rules require a board reset between rounds.
- The current rotation model assumes the active player may target any legal selection on the board; only selection validity, player occupancy, and fence-boundary constraints can reject it.
- Test fixtures may still place treasures directly outside the configured placement zone when they need focused domain coverage for older scenarios.
