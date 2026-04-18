# Project. BH Unity Parity Baseline

## Portability rules already enforced

- Rules live in `packages/domain`.
- Application handling is separated from presentation and transport.
- Protocol validation is independent from React and server runtime details.
- Test fixtures are reusable without a renderer.

## Parity strategy

Unity migration should treat the current TypeScript implementation as the reference specification.

The first parity targets should be:

1. match creation and corner seat placement
2. priority-card submission and deterministic turn order
3. mandatory-step plus secondary-action turn flow
4. treasure pickup and open flow
5. fire, water, and electric tile interactions
6. auction resolution and special-card ownership updates
7. square2, cross5, and rectangle6 rotation transforms
8. round completion after the fourth opened treasure
9. next-round preparation and final match result calculation

## Expected future parity assets

- replay fixtures for full rounds
- tile interaction golden cases
- rotation golden cases
- auction and special-card scenario fixtures
- protocol snapshot samples
- server rejection catalogs
