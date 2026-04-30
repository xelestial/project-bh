import assert from "node:assert/strict";
import test from "node:test";

import {
  placeTreasure,
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
import { createBombResolutionPlan } from "./special-card-resolution.ts";

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

test("treasure placement is limited to the centered 6x6 treasure zone", () => {
  const match = createMatchState({
    matchId: "treasure-zone-match",
    settings: {
      treasurePlacementZone: {
        origin: { x: 7, y: 7 },
        width: 6,
        height: 6
      }
    },
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ],
    treasures: [
      {
        id: "treasure-1",
        slot: 1,
        points: 3,
        ownerPlayerId: "player-1"
      }
    ]
  });

  assert.throws(() => {
    placeTreasure(match, {
      playerId: "player-1",
      treasureId: "treasure-1",
      position: createPosition(6, 6)
    });
  }, {
    code: "INVALID_POSITION"
  });

  const result = placeTreasure(match, {
    playerId: "player-1",
    treasureId: "treasure-1",
    position: createPosition(7, 7)
  });

  assert.deepEqual(result.state.treasures["treasure-1"]?.position, createPosition(7, 7));
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

test("players with negative score can still submit a zero auction bid", () => {
  const match = replacePlayer(createAuctionFixture(), "player-1", (player) => ({
    ...player,
    score: -1
  }));

  const result = submitAuctionBids(match, "player-1", []);

  assert.equal(result.state.round.auction.submittedBids["player-1"]?.amount, 0);
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

test("opening a carried treasure is also allowed at turn start on the start tile", () => {
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
        stage: "mandatoryStep",
        mandatoryStepDirection: null
      }
    }
  };

  const result = openCarriedTreasure(returnedToStart, "player-1");

  assert.equal(mustPlayer(result.state, "player-1").carriedTreasureId, null);
  assert.equal(mustTreasure(result.state, "treasure-1").openedByPlayerId, "player-1");
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

test("lethal electric tile damage eliminates the player and drops carried treasure", () => {
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

  const result = moveActivePlayer(carrying, "player-1", "south");
  const eliminated = mustPlayer(result.state, "player-1");
  const dropped = mustTreasure(result.state, "treasure-x");

  assert.equal(eliminated.hitPoints, 0);
  assert.equal(eliminated.eliminated, true);
  assert.equal(eliminated.carriedTreasureId, null);
  assert.deepEqual(dropped.position, createPosition(0, 1));
  assert.equal(result.state.round.activePlayerId, "player-2");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "playerMoved",
      "playerDamaged",
      "playerEliminated",
      "treasureDropped",
      "turnStageChanged",
      "turnEnded"
    ]
  );
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

test("large fence cards can be bought directly during the auction for two points", () => {
  const match = createAuctionFixture();
  const result = purchaseSpecialCard(match, "player-1", "largeFence");
  const playerOne = mustPlayer(result.state, "player-1");

  assert.equal(playerOne.score, 1);
  assert.equal(playerOne.specialInventory.largeFence, 3);
  assert.ok(
    result.events.some(
      (event) =>
        event.type === "specialCardPurchased" &&
        event.cardType === "largeFence" &&
        event.cost === 2
    )
  );
});

test("large fence cards place a three-tile straight fence and consume one charge", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(stepped, "player-1", (player) => ({
    ...player,
    specialInventory: {
      ...player.specialInventory,
      largeFence: 1
    }
  }));
  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "largeFence",
    fencePositions: [
      createPosition(1, 2),
      createPosition(2, 2),
      createPosition(3, 2)
    ]
  });
  const updatedPlayer = mustPlayer(result.state, "player-1");
  const fences = Object.values(result.state.board.fences);

  assert.equal(updatedPlayer.specialInventory.largeFence, 0);
  assert.equal(fences.length, 1);
  assert.deepEqual(fences[0]?.positions, [
    createPosition(1, 2),
    createPosition(2, 2),
    createPosition(3, 2)
  ]);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("bomb special cards build explicit board-impact resolution plans", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: [],
    tiles: [{ position: createPosition(0, 2), kind: "water" }]
  });
  const plan = createBombResolutionPlan(match, {
    playerId: "player-1",
    cardType: "flameBomb",
    targetPosition: createPosition(0, 2)
  });

  assert.deepEqual(plan, [
    {
      kind: "setTile",
      position: createPosition(0, 2),
      tileKind: "fire",
      normalize: true
    },
    {
      kind: "applyTileEffectToOccupants",
      position: createPosition(0, 2),
      tileKind: "fire",
      actorPlayerId: "player-1"
    }
  ]);
});

test("special card bombs can modify the board and remove fences", () => {
  const match = createTwoPlayerMatchFixture({
    tiles: [{ position: createPosition(0, 2), kind: "water" }],
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
          positions: [createPosition(0, 2), createPosition(0, 3)]
        }
      }
    }
  } satisfies MatchState;
  const stepped = moveActivePlayer(withCard, "player-1", "south").state;
  const result = useSpecialCard(stepped, {
    playerId: "player-1",
    cardType: "flameBomb",
    targetPosition: createPosition(0, 2)
  });

  assert.equal(result.state.board.tiles["0,2"]?.kind, "fire");
  assert.equal(result.state.board.fences["fence-a"], undefined);
  assert.equal(result.state.round.activePlayerId, "player-2");
});

test("electric bomb damage and wet stun resolve before turn advancement", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(
    replacePlayer(stepped, "player-1", (player) => ({
      ...player,
      specialInventory: {
        ...player.specialInventory,
        electricBomb: 1
      }
    })),
    "player-2",
    (player) => ({
      ...player,
      position: createPosition(0, 3),
      status: {
        ...player.status,
        water: true
      }
    })
  );

  const result = useSpecialCard(prepared, {
    playerId: "player-1",
    cardType: "electricBomb",
    targetPosition: createPosition(0, 3)
  });
  const target = mustPlayer(result.state, "player-2");

  assert.equal(target.hitPoints, 7);
  assert.equal(target.status.skipNextTurnCount, 0);
  assert.equal(result.state.round.activePlayerId, "player-1");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "specialCardUsed",
      "tileChanged",
      "playerDamaged",
      "playerStatusChanged",
      "turnEnded",
      "turnSkipped"
    ]
  );
});

test("cold bombs only target players or tiles within three straight-line tiles", () => {
  const match = createTwoPlayerMatchFixture({
    treasures: []
  });
  const stepped = moveActivePlayer(match, "player-1", "south").state;
  const prepared = replacePlayer(
    replacePlayer(stepped, "player-1", (player) => ({
      ...player,
      specialInventory: {
        ...player.specialInventory,
        coldBomb: 1
      }
    })),
    "player-2",
    (player) => ({
      ...player,
      position: createPosition(4, 1)
    })
  );

  assert.throws(
    () =>
      useSpecialCard(prepared, {
        playerId: "player-1",
        cardType: "coldBomb",
        targetPlayerId: "player-2"
      }),
    {
      code: "INVALID_SPECIAL_CARD_TARGET"
    }
  );
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

test("match completion picks 4-player winners by score then opened treasure count", () => {
  const started = createMatchState({
    matchId: "winner-resolution-match",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" },
      { id: "player-3", name: "Charlie" },
      { id: "player-4", name: "Delta" }
    ]
  });

  const completedRound: MatchState = {
    ...started,
    players: {
      "player-1": {
        ...started.players["player-1"]!,
        score: 11,
        openedTreasureIds: ["t1", "t2"]
      },
      "player-2": {
        ...started.players["player-2"]!,
        score: 11,
        openedTreasureIds: ["t3"]
      },
      "player-3": {
        ...started.players["player-3"]!,
        score: 8,
        openedTreasureIds: ["t4", "t5", "t6"]
      },
      "player-4": {
        ...started.players["player-4"]!,
        score: 11,
        openedTreasureIds: ["t7", "t8"]
      }
    },
    round: {
      ...started.round,
      roundNumber: 5,
      phase: "completed",
      activePlayerId: null,
      turn: null
    }
  };

  const result = prepareNextRound(completedRound);

  assert.equal(result.state.completed, true);
  assert.deepEqual(result.state.result?.winnerPlayerIds, ["player-1", "player-4"]);
  assert.equal(result.state.result?.highestScore, 11);
  assert.equal(result.state.result?.tiedOpenedTreasureCount, 2);
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
