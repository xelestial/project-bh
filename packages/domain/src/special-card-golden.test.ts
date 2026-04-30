import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";
import {
  createPosition,
  moveActivePlayer,
  useSpecialCard,
  type DomainEvent,
  type MatchState,
  type PlayerState
} from "./index.ts";

const GOLDEN_DIR = new URL("../../../docs/fixtures/scenarios/", import.meta.url);

function mustPlayer(match: MatchState, playerId: string): PlayerState {
  const player = match.players[playerId];
  assert.ok(player, `Expected player ${playerId} to exist.`);
  return player;
}

function loadGolden(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(fileName, GOLDEN_DIR), "utf8"));
}

function eventTypes(events: readonly DomainEvent[]): readonly string[] {
  return events.map((event) => event.type);
}

function grantSpecialCard(
  match: MatchState,
  playerId: string,
  cardType: keyof PlayerState["specialInventory"]
): MatchState {
  const player = mustPlayer(match, playerId);

  return {
    ...match,
    players: {
      ...match.players,
      [playerId]: {
        ...player,
        specialInventory: {
          ...player.specialInventory,
          [cardType]: 1
        }
      }
    }
  };
}

function createFlameBombFenceScenario() {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 2), kind: "water" }]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = grantSpecialCard({
    ...stepped,
    board: {
      ...stepped.board,
      fences: {
        "fence-a": {
          id: "fence-a",
          positions: [createPosition(0, 2), createPosition(0, 3)]
        }
      }
    }
  }, "player-1", "flameBomb");
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "flameBomb",
    targetPosition: createPosition(0, 2)
  });

  return {
    scenarioId: "project-bh.scenario.flame-bomb-removes-fence.v1",
    version: 1,
    input: {
      activePlayerId: "player-1",
      cardType: "flameBomb",
      targetPosition: createPosition(0, 2),
      startingFencePositions: [createPosition(0, 2), createPosition(0, 3)]
    },
    output: {
      targetTileKind: result.state.board.tiles["0,2"]?.kind ?? "plain",
      fenceRemoved: result.state.board.fences["fence-a"] === undefined,
      remainingCharges: mustPlayer(result.state, "player-1").specialInventory.flameBomb,
      activePlayerId: result.state.round.activePlayerId,
      events: eventTypes(result.events)
    }
  };
}

function createRecoveryPotionScenario() {
  const match = createTwoPlayerMatchFixture({ treasures: [] });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const player = mustPlayer(stepped, "player-1");
  const prepared = grantSpecialCard({
    ...stepped,
    players: {
      ...stepped.players,
      "player-1": {
        ...player,
        hitPoints: 4,
        status: {
          fire: true,
          water: true,
          skipNextTurnCount: 1,
          movementLimit: 1
        }
      }
    }
  }, "player-1", "recoveryPotion");
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "recoveryPotion"
  });
  const recovered = mustPlayer(result.state, "player-1");

  return {
    scenarioId: "project-bh.scenario.recovery-potion-clears-status.v1",
    version: 1,
    input: {
      activePlayerId: "player-1",
      cardType: "recoveryPotion",
      startingHitPoints: 4,
      startingStatus: {
        fire: true,
        water: true,
        skipNextTurnCount: 1,
        movementLimit: 1
      }
    },
    output: {
      hitPoints: recovered.hitPoints,
      status: recovered.status,
      remainingCharges: recovered.specialInventory.recoveryPotion,
      activePlayerId: result.state.round.activePlayerId,
      events: eventTypes(result.events)
    }
  };
}

function createJumpHookScenario() {
  const match = createTwoPlayerMatchFixture({ treasures: [] });
  const jumpedFrom = moveActivePlayer(match, "player-1", "south").state;
  const jumpedResult = useSpecialCard(
    grantSpecialCard(jumpedFrom, "player-1", "jump"),
    {
      playerId: "player-1",
      cardType: "jump",
      targetPosition: createPosition(0, 3)
    }
  );
  const hookTurn = moveActivePlayer(jumpedResult.state, "player-2", "west").state;
  const hookPrepared: MatchState = {
    ...grantSpecialCard(hookTurn, "player-2", "hook"),
    players: {
      ...grantSpecialCard(hookTurn, "player-2", "hook").players,
      "player-1": {
        ...mustPlayer(hookTurn, "player-1"),
        position: createPosition(14, 0)
      }
    }
  };
  const hookResult = useSpecialCard(hookPrepared, {
    playerId: "player-2",
    cardType: "hook",
    targetPlayerId: "player-1"
  });

  return {
    scenarioId: "project-bh.scenario.jump-hook-mobility.v1",
    version: 1,
    input: {
      jump: {
        playerId: "player-1",
        targetPosition: createPosition(0, 3)
      },
      hook: {
        playerId: "player-2",
        targetPlayerId: "player-1",
        targetPositionBeforeHook: createPosition(14, 0)
      }
    },
    output: {
      jumpPosition: mustPlayer(jumpedResult.state, "player-1").position,
      hookPosition: mustPlayer(hookResult.state, "player-2").position,
      jumpRemainingCharges: mustPlayer(jumpedResult.state, "player-1").specialInventory.jump,
      hookRemainingCharges: mustPlayer(hookResult.state, "player-2").specialInventory.hook,
      activePlayerId: hookResult.state.round.activePlayerId,
      eventTypes: {
        jump: eventTypes(jumpedResult.events),
        hook: eventTypes(hookResult.events)
      }
    }
  };
}

test("special-card scenario golden samples match stable domain behavior", () => {
  assert.deepEqual(createFlameBombFenceScenario(), loadGolden("flame-bomb-removes-fence.v1.json"));
  assert.deepEqual(createRecoveryPotionScenario(), loadGolden("recovery-potion-clears-status.v1.json"));
  assert.deepEqual(createJumpHookScenario(), loadGolden("jump-hook-mobility.v1.json"));
});
