# Quarter-View Map Plan

## Goal

Move the current board presentation from flat top-down tiles to a quarter-view map without changing the authoritative rules engine.

The first quarter-view milestone must preserve:

- the existing domain model,
- the existing server-authoritative command flow,
- deterministic movement and rotation rules,
- hidden-information behavior for treasures,
- and the current test surface for round flow.

This should be treated as a presentation migration first, not a rules rewrite.

## Current Constraints

- The domain currently reasons in logical board coordinates, not screen-space coordinates.
- Rotation, movement, treasure placement, and status effects are already implemented against grid cells.
- The current web client renders one cell as one visible square tile.
- Interaction assumes a direct mapping between pointer hit target and logical cell.

Because of that, a safe quarter-view rollout should keep the logical board unchanged and only change:

- tile projection,
- sprite layering,
- hit-target mapping,
- and view-model generation for board rendering.

## Visual Target

Use a fake-isometric quarter-view board:

- logical board remains a 2D grid,
- each logical cell renders as a diamond tile,
- entities render as layered sprites anchored to the same logical cell,
- front/back character direction is chosen from movement direction or turn state,
- effects and treasures sit on the same cell anchor system.

Short-term target:

- a visually convincing quarter-view map,
- readable tile states,
- correct click/hover/rotation affordances,
- no gameplay regression.

Long-term target:

- an asset and layering vocabulary that can later map cleanly to Unity.

## Recommended Delivery Order

### Phase 1. Projection Layer

Create a board projection adapter in the web client.

It should convert logical grid coordinates into screen coordinates:

- `grid (x, y) -> screen (left, top)`
- tile width and height are derived from a single board scale
- sprite anchors use the same transform

Do not move this into the domain.
This belongs in presentation/view-model code.

Deliverables:

- quarter-view coordinate helper,
- board view model with projected positions,
- one tile rendered as a diamond,
- no gameplay changes.

### Phase 2. Layered Tile Renderer

Replace the flat tile box renderer with layered tile assets:

- base ground tile,
- tile attribute overlay for fire/water/electric/ice,
- fence overlay,
- treasure token overlay,
- player sprite overlay,
- active-turn highlight overlay,
- rotation-preview overlay.

Use absolute-positioned layers inside a projected board stage.

Important rule:

- the logical hit area must remain stable even if the art extends beyond the tile diamond.

### Phase 3. Sprite Direction System

Introduce a presentation-only sprite direction mapper.

Map entity facing to one of four quarter-view directions:

- `front-rd`
- `front-ld`
- `back-ru`
- `back-lu`

Direction should come from view state such as:

- last move direction,
- selected action preview,
- or stable idle fallback.

Do not let sprite direction affect rules logic.

### Phase 4. Interaction and Hit Testing

Rework board interaction so the user still targets logical cells reliably on a diamond map.

Needed adjustments:

- hover highlight follows projected tile diamonds,
- right-click or tap menus still bind to the correct logical cell,
- rotation previews show the exact affected logical region,
- movement previews and special-card targeting still resolve to the same domain coordinates.

For usability, prefer a hidden rectangular hit layer mapped to logical cells, with visible diamond art above it.

### Phase 5. Rotation UX for Quarter View

The current rotation UX already exposes candidate origins and affected cells.

Quarter-view migration should adapt this without changing application logic:

- preview diamonds instead of squares,
- show region outlines with quarter-view geometry,
- render clockwise/counter-clockwise controls outside the affected diamond cluster,
- keep the authoritative rotation candidate source in the application layer.

### Phase 6. Effect and Treasure Readability Pass

Once the map is projected, rebalance visual readability:

- treasure tokens must stay legible but not expose identity,
- opened treasure visuals should remain anonymous until round-resolution reveal timing,
- tile effects must be readable at a glance,
- active player and turn order styling should remain stronger than decorative details.

This phase will likely require new art variants for:

- opened treasure,
- elemental tile overlays,
- shadow and highlight layers,
- and possibly simplified fence silhouettes.

### Phase 7. Quarter-View Playtest Pass

Run browser playtests focused on:

- cell selection accuracy,
- movement preview accuracy,
- rotation discoverability,
- special-card targeting clarity,
- and whether the board remains readable at 1920x1080 without scroll.

Any mismatch between visible diamond positions and actual logical cells must block release.

## Architecture Notes

### Keep Domain Coordinates Untouched

Do not convert the domain to isometric coordinates.

The domain should keep:

- integer grid coordinates,
- square-region rotation definitions,
- region membership checks,
- and board adjacency rules.

Quarter-view is only a projection concern.

### Add a Board Projection View Model

Preferred location:

- web presentation layer,
- or a UI-facing adapter package if shared later.

Suggested responsibilities:

- tile screen position,
- sprite anchor position,
- z-order sorting,
- projected bounds for highlights and overlays.

### Preserve Protocol Stability

No network payload should need quarter-view coordinates.

The server should continue to send:

- logical positions,
- logical regions,
- logical turn hints.

The client should project them locally.

## Asset Plan

### Character Sprites

Initial sprite set now exists for four directions:

- right-down front,
- left-down front,
- left-up back,
- right-up back.

Next asset tasks:

- normalize all character sprite anchor points,
- define a common foot pivot,
- define max sprite occupancy above a tile,
- add simple shadow ellipses under characters.

### Tile Art

Need a dedicated quarter-view tile kit:

- neutral ground diamond,
- fire diamond overlay,
- water diamond overlay,
- electric diamond overlay,
- ice diamond overlay,
- river and giant-flame special states,
- fence and large-fence overlays.

### Treasure Art

Need quarter-view treasure tokens that can sit cleanly on a diamond tile:

- closed chest token,
- opened gem token,
- carry-state token if needed,
- and hidden-information-safe variants.

## Risks

### Risk 1. Visual Projection and Interaction Drift

If art is projected but hit-testing remains naive, players will feel that clicks land on the wrong tile.

Mitigation:

- keep a dedicated logical hit layer,
- visually debug tile anchors during development,
- playtest on dense boards with many overlays.

### Risk 2. Rotation Region Confusion

Quarter-view makes square regions less obvious.

Mitigation:

- stronger preview outlines,
- region fill tint,
- directional arrow art,
- and temporary labels during internal testing.

### Risk 3. Overdraw and Clutter

Quarter-view adds more overlap between entities, effects, and UI.

Mitigation:

- strict z-order rules,
- simplified overlay art,
- and priority on gameplay readability over decorative detail.

### Risk 4. Unity Migration Drift

If web quarter-view logic mixes rendering with gameplay, later Unity migration gets harder.

Mitigation:

- keep projection math and sprite selection in presentation adapters only,
- document anchor rules and layer order,
- preserve protocol and domain semantics unchanged.

## Done Criteria for the First Quarter-View Milestone

The milestone is done when:

- the web board renders in quarter-view,
- all board interactions still target the correct logical cells,
- movement, rotation, treasure placement, and special-card targeting still behave correctly,
- hidden-information rules remain intact,
- the board fits inside the 1920x1080 viewport without scroll,
- and regression tests still pass without domain rewrites.
