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
   - including hidden slot-to-score mapping and fake-card handling
5. fire, water, and electric tile interactions
6. auction resolution, fence purchases, and charged special-card inventory updates
7. square2 plus large-hammer cross5 and rectangle6 rotation transforms
8. round completion after the fourth opened treasure
9. next-round preparation with persistent HP, persistent elimination, and persistent non-treasure board state
10. final match result calculation excluding eliminated players

## Expected future parity assets

- replay fixtures for full rounds
- tile interaction golden cases
- rotation golden cases
- auction and special-card scenario fixtures
- charged-inventory projection samples for the player HUD
- protocol snapshot samples
- server rejection catalogs
- player-private treasure projection samples for Unity client parity checks
- secure reconnect/session-token samples so Unity can match the same transport-auth contract without trusting public player ids
- resolution-step fixtures for complex skills so Unity can verify damage, push, collision, tile effects, treasure drops, and turn interruption in the same order as the TypeScript reference
