import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";
import {
  createPosition,
  endTurn,
  moveActivePlayer,
  throwTile,
  type DomainEvent,
  type MatchState,
  type PlayerState,
  type TreasureState
} from "./index.ts";

const GOLDEN_DIR = new URL("../../../docs/fixtures/rules/", import.meta.url);

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

function loadGolden(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(fileName, GOLDEN_DIR), "utf8"));
}

function eventTypes(events: readonly DomainEvent[]): readonly string[] {
  return events.map((event) => event.type);
}

function createIceDropScenario() {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 1), kind: "ice" }]
  });
  const carrying: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        carriedTreasureId: "treasure-ice"
      }
    },
    treasures: {
      "treasure-ice": {
        id: "treasure-ice",
        slot: 1,
        ownerPlayerId: "player-1",
        points: 2,
        initialPosition: null,
        position: null,
        carriedByPlayerId: "player-1",
        openedByPlayerId: null,
        removedFromRound: false
      }
    }
  };
  const result = moveActivePlayer(carrying, "player-1", "south");
  const player = mustPlayer(result.state, "player-1");
  const treasure = mustTreasure(result.state, "treasure-ice");

  return {
    name: "ice drops carried treasure at a deterministic adjacent drop position",
    input: {
      activePlayerId: "player-1",
      move: "south",
      icePosition: createPosition(0, 1),
      carriedTreasureId: "treasure-ice"
    },
    output: {
      playerPosition: player.position,
      carriedTreasureId: player.carriedTreasureId,
      treasurePosition: treasure.position,
      treasureCarrier: treasure.carriedByPlayerId,
      activePlayerId: result.state.round.activePlayerId,
      turnStage: result.state.round.turn?.stage ?? null,
      events: eventTypes(result.events)
    }
  };
}

function createRiverFormationScenario() {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [
      { position: createPosition(1, 1), kind: "water" },
      { position: createPosition(2, 1), kind: "water" },
      { position: createPosition(4, 1), kind: "water" }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const result = throwTile(stepped, {
    playerId: "player-1",
    source: createPosition(1, 1),
    target: createPosition(3, 1)
  });

  return {
    name: "three connected water tiles normalize into river",
    input: {
      activePlayerId: "player-1",
      source: createPosition(1, 1),
      target: createPosition(3, 1),
      connectedWaterPositions: [
        createPosition(2, 1),
        createPosition(4, 1)
      ]
    },
    output: {
      tileKinds: {
        "1,1": result.state.board.tiles["1,1"]?.kind ?? "plain",
        "2,1": result.state.board.tiles["2,1"]?.kind ?? "plain",
        "3,1": result.state.board.tiles["3,1"]?.kind ?? "plain",
        "4,1": result.state.board.tiles["4,1"]?.kind ?? "plain"
      },
      activePlayerId: result.state.round.activePlayerId,
      events: eventTypes(result.events)
    }
  };
}

function createRiverMovementBlockScenario() {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 1), kind: "river" }]
  });

  try {
    moveActivePlayer(match, "player-1", "south");
    throw new Error("Expected moving into a river tile to fail.");
  } catch (error) {
    assert.ok(error instanceof Error && "code" in error);
    return {
      name: "river blocks normal movement",
      input: {
        activePlayerId: "player-1",
        move: "south",
        riverPosition: createPosition(0, 1)
      },
      output: {
        errorCode: String(error.code),
        message: error.message
      }
    };
  }
}

function createEliminationDropScenario() {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 1), kind: "electric" }]
  });
  const carrying: MatchState = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...mustPlayer(match, "player-1"),
        hitPoints: 3,
        carriedTreasureId: "treasure-elimination"
      }
    },
    treasures: {
      "treasure-elimination": {
        id: "treasure-elimination",
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
  const result = moveActivePlayer(carrying, "player-1", "south");
  const eliminated = mustPlayer(result.state, "player-1");
  const dropped = mustTreasure(result.state, "treasure-elimination");

  return {
    name: "lethal electric tile damage eliminates the player and drops carried treasure",
    input: {
      activePlayerId: "player-1",
      move: "south",
      electricPosition: createPosition(0, 1),
      startingHitPoints: 3,
      carriedTreasureId: "treasure-elimination"
    },
    output: {
      playerPosition: eliminated.position,
      hitPoints: eliminated.hitPoints,
      eliminated: eliminated.eliminated,
      carriedTreasureId: eliminated.carriedTreasureId,
      treasurePosition: dropped.position,
      treasureCarrier: dropped.carriedByPlayerId,
      activePlayerId: result.state.round.activePlayerId,
      turnStage: result.state.round.turn?.stage ?? null,
      events: eventTypes(result.events)
    }
  };
}

function createRoundTickSkipScenario() {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared: MatchState = {
    ...stepped,
    players: {
      ...stepped.players,
      "player-2": {
        ...mustPlayer(stepped, "player-2"),
        status: {
          ...mustPlayer(stepped, "player-2").status,
          skipNextTurnCount: 1
        }
      }
    }
  };
  const result = endTurn(prepared, "player-1");
  const skippedPlayer = mustPlayer(result.state, "player-2");

  return {
    name: "round tick consumes skipNextTurnCount and returns to the next eligible player",
    input: {
      endingPlayerId: "player-1",
      skippedPlayerId: "player-2",
      startingSkipCount: 1
    },
    output: {
      skippedPlayerRemainingSkipCount: skippedPlayer.status.skipNextTurnCount,
      activePlayerId: result.state.round.activePlayerId,
      turnNumber: result.state.round.turnNumber,
      turnStage: result.state.round.turn?.stage ?? null,
      events: result.events.map((event) => {
        if (event.type === "turnSkipped") {
          return {
            type: event.type,
            playerId: event.playerId,
            remainingSkipCount: event.remainingSkipCount,
            turnNumber: event.turnNumber
          };
        }

        if (event.type === "turnEnded") {
          return {
            type: event.type,
            previousPlayerId: event.previousPlayerId,
            nextPlayerId: event.nextPlayerId,
            turnNumber: event.turnNumber
          };
        }

        return {
          type: event.type
        };
      })
    }
  };
}

test("rule scenario golden samples match the stable domain fixtures", () => {
  assert.deepEqual(createIceDropScenario(), loadGolden("ice-drop-carried-treasure.json"));
  assert.deepEqual(createRiverFormationScenario(), loadGolden("river-formation.json"));
  assert.deepEqual(createRiverMovementBlockScenario(), loadGolden("river-movement-block.json"));
  assert.deepEqual(createEliminationDropScenario(), loadGolden("elimination-drops-treasure.json"));
  assert.deepEqual(createRoundTickSkipScenario(), loadGolden("round-tick-skip-countdown.json"));
});
