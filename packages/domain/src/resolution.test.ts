import assert from "node:assert/strict";
import test from "node:test";

import {
  createPosition,
  runResolutionPipeline,
  type MatchState,
  type PlayerState,
  type TreasureState
} from "./index.ts";
import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";

function mustPlayer(match: MatchState, playerId: string): PlayerState {
  const player = match.players[playerId];
  assert.ok(player, `Expected player ${playerId} to exist.`);
  return player;
}

function mustTreasure(match: MatchState, treasureId: string): TreasureState {
  const treasure = match.treasures[treasureId];
  assert.ok(treasure, `Expected treasure ${treasureId} to exist.`);
  return treasure;
}

test("resolution pipeline applies lethal damage, elimination, and carried treasure drop", () => {
  const match = createTwoPlayerMatchFixture({ treasures: [] });
  const prepared: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        hitPoints: 3,
        carriedTreasureId: "treasure-x"
      }
    },
    treasures: {
      ...match.treasures,
      "treasure-x": {
        id: "treasure-x",
        slot: 1,
        ownerPlayerId: "player-1",
        points: 1,
        initialPosition: null,
        position: null,
        carriedByPlayerId: "player-1",
        openedByPlayerId: null,
        removedFromRound: false
      }
    }
  };

  const result = runResolutionPipeline({
    match: prepared,
    actorPlayerId: "player-1",
    steps: [{ kind: "damage", playerId: "player-1", amount: 3 }]
  });
  const player = mustPlayer(result.state, "player-1");
  const treasure = mustTreasure(result.state, "treasure-x");

  assert.equal(player.hitPoints, 0);
  assert.equal(player.eliminated, true);
  assert.equal(player.carriedTreasureId, null);
  assert.deepEqual(treasure.position, createPosition(0, 0));
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["playerDamaged", "playerEliminated", "treasureDropped"]
  );
  assert.equal(result.endsTurnImmediately, false);
});

test("resolution pipeline applies electric wet stun and own-turn interruption", () => {
  const match = createTwoPlayerMatchFixture({ treasures: [] });
  const prepared: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        status: {
          ...mustPlayer(match, "player-1").status,
          water: true
        }
      }
    }
  };

  const result = runResolutionPipeline({
    match: prepared,
    actorPlayerId: "player-1",
    steps: [
      {
        kind: "applyTileEffect",
        playerId: "player-1",
        tileKind: "electric",
        ownTurn: true
      }
    ]
  });
  const player = mustPlayer(result.state, "player-1");

  assert.equal(player.hitPoints, 7);
  assert.equal(player.status.skipNextTurnCount, 1);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["playerDamaged", "playerStatusChanged"]
  );
  assert.equal(result.endsTurnImmediately, true);
});
