import assert from "node:assert/strict";
import test from "node:test";

import {
  submitAuctionBids,
  createMatchState,
  createPosition,
  endTurn,
  moveActivePlayer,
  openCarriedTreasure,
  purchaseSpecialCard,
  rotateTiles,
  prepareNextRound,
  submitPriorityCard,
  throwTile,
  useSpecialCard,
  type MatchState,
  type PlayerState,
  type TreasureState
} from "./index.ts";
import {
  createAuctionFixture,
  createPrioritySubmissionFixture,
  createTwoPlayerMatchFixture
} from "../../testkit/src/index.ts";

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

function replacePlayer(
  match: MatchState,
  playerId: string,
  updater: (player: PlayerState) => PlayerState
): MatchState {
  const player = mustPlayer(match, playerId);

  return {
    ...match,
    players: {
      ...match.players,
      [playerId]: updater(player)
    }
  };
}

test("priority submissions resolve deterministic turn order with ties moved to the back", () => {
  let match = createMatchState({
    matchId: "priority-match",
    settings: {
      auctionCardDrawCount: 1
    },
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" },
      { id: "player-3", name: "Charlie" },
      { id: "player-4", name: "Delta" }
    ]
  });

  match = submitAuctionBids(match, "player-1", []).state;
  match = submitAuctionBids(match, "player-2", []).state;
  match = submitAuctionBids(match, "player-3", []).state;
  match = submitAuctionBids(match, "player-4", []).state;
  match = submitPriorityCard(match, "player-1", 6).state;
  match = submitPriorityCard(match, "player-2", 4).state;
  match = submitPriorityCard(match, "player-3", 4).state;
  const result = submitPriorityCard(match, "player-4", 5);

  assert.deepEqual(result.state.round.turnOrder, [
    "player-1",
    "player-4",
    "player-2",
    "player-3"
  ]);
  assert.equal(result.state.round.phase, "inTurn");
  assert.equal(result.state.round.activePlayerId, "player-1");
});

test("auction bids award cards and deduct score when the auction resolves", () => {
  const match = createAuctionFixture();
  const first = submitAuctionBids(match, "player-1", [{ offerSlot: 0, amount: 2 }]).state;
  const second = submitAuctionBids(first, "player-2", [{ offerSlot: 0, amount: 1 }]);
  const playerOne = mustPlayer(second.state, "player-1");

  assert.equal(second.state.round.phase, "auction");
  assert.equal(second.state.round.auction.currentOfferIndex, 1);
  assert.equal(playerOne.score, 1);
  assert.equal(playerOne.specialInventory.coldBomb, 3);
  assert.ok(second.events.some((event) => event.type === "auctionResolved"));
});

test("moving onto an unowned treasure picks it up and ends the turn", () => {
  const match = createTwoPlayerMatchFixture();
  const result = moveActivePlayer(match, "player-1", "east");
  const movedPlayer = mustPlayer(result.state, "player-1");
  const pickedTreasure = mustTreasure(result.state, "treasure-1");

  assert.equal(movedPlayer.position.x, 1);
  assert.equal(movedPlayer.carriedTreasureId, "treasure-1");
  assert.equal(pickedTreasure.carriedByPlayerId, "player-1");
  assert.equal(result.state.round.activePlayerId, "player-2");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["playerMoved", "treasurePickedUp", "turnEnded"]
  );
});

test("the mandatory step must complete before the turn can be ended", () => {
  const match = createTwoPlayerMatchFixture();

  assert.throws(() => endTurn(match, "player-1"), {
    code: "MANDATORY_STEP_REQUIRED"
  });
});

test("the secondary step may be spent on one additional move and then ends the turn", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const result = moveActivePlayer(stepped, "player-1", "east");
  const movedPlayer = mustPlayer(result.state, "player-1");

  assert.deepEqual(movedPlayer.position, createPosition(1, 1));
  assert.equal(result.state.round.activePlayerId, "player-2");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["playerMoved", "turnEnded"]
  );
});

test("movement limit 1 removes the secondary move option", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const limited = replacePlayer(stepped, "player-1", (player) => ({
    ...player,
    status: {
      ...player.status,
      movementLimit: 1
    }
  }));

  assert.throws(() => moveActivePlayer(limited, "player-1", "east"), {
    code: "SECONDARY_ACTION_NOT_AVAILABLE"
  });
});

test("opening a carried treasure at the start tile adds score and advances the turn", () => {
  const initialMatch = createTwoPlayerMatchFixture();
  const moved = moveActivePlayer(initialMatch, "player-1", "east").state;
  const movedPlayerOne = mustPlayer(moved, "player-1");
  const movedPlayerTwo = mustPlayer(moved, "player-2");
  const returnedToStart: MatchState = {
    ...moved,
    players: {
      ...moved.players,
      "player-1": {
        ...movedPlayerOne,
        position: createPosition(0, 0)
      },
      "player-2": {
        ...movedPlayerTwo,
        position: createPosition(19, 1)
      }
    },
    round: {
      ...moved.round,
      activePlayerId: "player-1",
      turn: {
        playerId: "player-1",
        stage: "secondaryAction",
        mandatoryStepDirection: "west"
      }
    }
  };

  const result = openCarriedTreasure(returnedToStart, "player-1");
  const openedPlayer = mustPlayer(result.state, "player-1");
  const openedTreasure = mustTreasure(result.state, "treasure-1");

  assert.equal(openedPlayer.score, 6);
  assert.equal(openedPlayer.carriedTreasureId, null);
  assert.equal(openedTreasure.openedByPlayerId, "player-1");
  assert.equal(result.state.round.openedTreasureCount, 1);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("throwing water onto fire leaves water on the target tile and ends the turn", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [
      { position: createPosition(1, 1), kind: "water" },
      { position: createPosition(3, 1), kind: "fire" }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const result = throwTile(stepped, {
    playerId: "player-1",
    source: createPosition(1, 1),
    target: createPosition(3, 1)
  });

  assert.equal(result.state.round.activePlayerId, "player-2");
  assert.equal(result.state.board.tiles["1,1"], undefined);
  assert.equal(result.state.board.tiles["3,1"]?.kind, "water");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["tileThrown", "tileChanged", "tileChanged", "turnEnded"]
  );
});

test("electric thrown onto a wet player schedules a skipped next turn", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(1, 1), kind: "electric" }]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const movedOpponent = replacePlayer(stepped, "player-2", (player) => ({
    ...player,
    position: createPosition(3, 1),
    status: {
      ...player.status,
      water: true
    }
  }));
  const result = throwTile(movedOpponent, {
    playerId: "player-1",
    source: createPosition(1, 1),
    target: createPosition(3, 1)
  });
  const opponent = mustPlayer(result.state, "player-2");

  assert.equal(opponent.hitPoints, 7);
  assert.equal(opponent.status.skipNextTurnCount, 0);
  assert.equal(result.state.round.activePlayerId, "player-1");
  assert.ok(result.events.some((event) => event.type === "turnSkipped"));
});

test("three connected fire tiles normalize into giant flame", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [
      { position: createPosition(1, 1), kind: "fire" },
      { position: createPosition(3, 1), kind: "fire" },
      { position: createPosition(2, 2), kind: "fire" }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const result = throwTile(stepped, {
    playerId: "player-1",
    source: createPosition(1, 1),
    target: createPosition(2, 1)
  });

  assert.equal(result.state.board.tiles["2,1"]?.kind, "giantFlame");
  assert.equal(result.state.board.tiles["3,1"]?.kind, "giantFlame");
  assert.equal(result.state.board.tiles["2,2"]?.kind, "giantFlame");
});

test("rotating a 2x2 selection moves both tiles and treasures", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [
      {
        id: "treasure-1",
        slot: 1,
        points: 3,
        position: createPosition(2, 2)
      }
    ],
    tiles: [
      { position: createPosition(2, 1), kind: "fire" },
      { position: createPosition(3, 2), kind: "electric" }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const result = rotateTiles(stepped, {
    playerId: "player-1",
    selection: {
      kind: "square2",
      origin: createPosition(2, 1)
    },
    direction: "clockwise"
  });
  const movedTreasure = mustTreasure(result.state, "treasure-1");

  assert.equal(result.state.board.tiles["3,1"]?.kind, "fire");
  assert.equal(result.state.board.tiles["3,2"], undefined);
  assert.equal(result.state.board.tiles["2,2"]?.kind, "electric");
  assert.deepEqual(movedTreasure.position, createPosition(2, 1));
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("large hammer unlocks cross rotations and consumes one charge", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [
      { position: createPosition(2, 1), kind: "fire" },
      { position: createPosition(3, 2), kind: "electric" }
    ]
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(stepped, "player-1", (player) => ({
    ...player,
    specialInventory: {
      ...player.specialInventory,
      largeHammer: 1
    }
  }));
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "largeHammer",
    selection: {
      kind: "cross5",
      center: createPosition(2, 2)
    },
    direction: "clockwise"
  });
  const updatedPlayer = mustPlayer(result.state, "player-1");

  assert.equal(result.state.board.tiles["3,2"]?.kind, "fire");
  assert.equal(result.state.board.tiles["2,3"]?.kind, "electric");
  assert.equal(updatedPlayer.specialInventory.largeHammer, 0);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("fence cards can be bought directly during the auction for one point", () => {
  const match = createAuctionFixture();
  const result = purchaseSpecialCard(match, "player-1", "fence");
  const playerOne = mustPlayer(result.state, "player-1");

  assert.equal(playerOne.score, 2);
  assert.equal(playerOne.specialInventory.fence, 3);
  assert.ok(result.events.some((event) => event.type === "specialCardPurchased"));
});

test("special card bombs can modify the board and remove fences", () => {
  const match = createTwoPlayerMatchFixture({
    tiles: [{ position: createPosition(2, 2), kind: "water" }],
    treasures: [],
    auctionBids: [[{ offerSlot: 0, amount: 1 }], []]
  });
  const playerOne = mustPlayer(match, "player-1");
  const withCard = {
    ...match,
    players: {
      ...match.players,
      "player-1": {
        ...playerOne,
        specialInventory: {
          ...playerOne.specialInventory,
          flameBomb: 1
        }
      }
    },
    board: {
      ...match.board,
      fences: {
        "fence-a": {
          id: "fence-a",
          positions: [createPosition(2, 2), createPosition(2, 3)]
        }
      }
    }
  } satisfies MatchState;
  const stepped = moveActivePlayer(withCard, "player-1", "south").state;
  const result = useSpecialCard(stepped, {
    playerId: "player-1",
    cardType: "flameBomb",
    targetPosition: createPosition(2, 2)
  });

  assert.equal(result.state.board.tiles["2,2"]?.kind, "fire");
  assert.equal(result.state.board.fences["fence-a"], undefined);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("recovery potion clears status effects and restores full hp", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(stepped, "player-1", (player) => ({
    ...player,
    hitPoints: 4,
    specialInventory: {
      ...player.specialInventory,
      recoveryPotion: 1
    },
    status: {
      fire: true,
      water: true,
      skipNextTurnCount: 1,
      movementLimit: 1
    }
  }));
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "recoveryPotion"
  });
  const refreshedPlayer = mustPlayer(result.state, "player-1");

  assert.equal(refreshedPlayer.hitPoints, result.state.settings.startingHitPoints);
  assert.deepEqual(refreshedPlayer.status, {
    fire: false,
    water: false,
    skipNextTurnCount: 0,
    movementLimit: null
  });
  assert.equal(refreshedPlayer.specialInventory.recoveryPotion, 0);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("jump moves exactly two tiles and ends the turn", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(stepped, "player-1", (player) => ({
    ...player,
    specialInventory: {
      ...player.specialInventory,
      jump: 1
    }
  }));
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "jump",
    targetPosition: createPosition(2, 1)
  });
  const movedPlayer = mustPlayer(result.state, "player-1");

  assert.deepEqual(movedPlayer.position, createPosition(2, 1));
  assert.equal(movedPlayer.specialInventory.jump, 0);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("hook moves the player next to a straight-line target", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(
    replacePlayer(stepped, "player-1", (player) => ({
      ...player,
      specialInventory: {
        ...player.specialInventory,
        hook: 1
      }
    })),
    "player-2",
    (player) => ({
      ...player,
      position: createPosition(3, 1)
    })
  );
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "hook",
    targetPlayerId: "player-2"
  });
  const movedPlayer = mustPlayer(result.state, "player-1");

  assert.deepEqual(movedPlayer.position, createPosition(2, 1));
  assert.equal(movedPlayer.specialInventory.hook, 0);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("preparing the next round resets round state and eventually completes the match", () => {
  const match = createPrioritySubmissionFixture({
    treasures: []
  });
  const submitted = submitPriorityCard(match, "player-1", 6).state;
  const started = submitPriorityCard(submitted, "player-2", 5).state;
  const completedRound: MatchState = {
    ...started,
    round: {
      ...started.round,
      phase: "completed",
      roundNumber: 5
    }
  };
  const result = prepareNextRound(completedRound);

  assert.equal(result.state.completed, true);
  assert.ok(result.state.result);
  assert.ok(result.events.some((event) => event.type === "matchCompleted"));
});

test("the round completes when the fourth treasure is opened", () => {
  const match = createPrioritySubmissionFixture({
    treasures: []
  });
  const submitted = submitPriorityCard(
    submitPriorityCard(match, "player-1", 6).state,
    "player-2",
    5
  ).state;
  const prepared = replacePlayer(submitted, "player-1", (player) => ({
    ...player,
    carriedTreasureId: "treasure-1"
  }));
  const withTreasure: MatchState = {
    ...prepared,
    treasures: {
      ...prepared.treasures,
      "treasure-1": {
        id: "treasure-1",
        slot: 1,
        ownerPlayerId: "player-1",
        points: 3,
        initialPosition: createPosition(1, 0),
        position: null,
        carriedByPlayerId: "player-1",
        openedByPlayerId: null,
        removedFromRound: false
      }
    },
    round: {
      ...prepared.round,
      openedTreasureCount: 3,
      phase: "inTurn",
      activePlayerId: "player-1",
      turnOrder: ["player-1", "player-2"],
      turn: {
        playerId: "player-1",
        stage: "secondaryAction",
        mandatoryStepDirection: "north"
      }
    }
  };

  const result = openCarriedTreasure(withTreasure, "player-1");

  assert.equal(result.state.round.phase, "completed");
  assert.equal(result.state.round.activePlayerId, null);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["treasureOpened", "roundCompleted"]
  );
});
