import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuctionFixture,
  createPrioritySubmissionFixture,
  createTwoPlayerMatchFixture
} from "../../testkit/src/index.ts";
import { handleMatchCommand } from "./handle-match-command.ts";

test("application layer maps domain errors into rejections", () => {
  const match = createTwoPlayerMatchFixture();

  const result = handleMatchCommand(match, {
    type: "match.endTurn",
    version: 1,
    matchId: match.matchId,
    playerId: "player-1"
  });

  assert.equal(result.rejection?.code, "MANDATORY_STEP_REQUIRED");
  assert.equal(result.events.length, 0);
  assert.equal(result.state, match);
});

test("application layer starts the round once the last priority submission arrives", () => {
  const match = createPrioritySubmissionFixture();
  const first = handleMatchCommand(match, {
    type: "match.submitPriority",
    version: 1,
    matchId: match.matchId,
    playerId: "player-1",
    priorityCard: 6
  });
  const second = handleMatchCommand(first.state, {
    type: "match.submitPriority",
    version: 1,
    matchId: match.matchId,
    playerId: "player-2",
    priorityCard: 5
  });

  assert.equal(first.rejection, null);
  assert.equal(second.rejection, null);
  assert.equal(second.state.round.phase, "inTurn");
  assert.equal(second.state.round.activePlayerId, "player-1");
  assert.deepEqual(
    second.events.map((event) => (event as { type: string }).type),
    ["prioritySubmitted", "roundStarted"]
  );
});

test("application layer resolves auction bids before the priority phase", () => {
  const match = createAuctionFixture();
  const first = handleMatchCommand(match, {
    type: "match.submitAuctionBids",
    version: 1,
    matchId: match.matchId,
    playerId: "player-1",
    bids: [{ offerSlot: 0, amount: 1 }]
  });
  const second = handleMatchCommand(first.state, {
    type: "match.submitAuctionBids",
    version: 1,
    matchId: match.matchId,
    playerId: "player-2",
    bids: []
  });

  assert.equal(first.rejection, null);
  assert.equal(second.rejection, null);
  assert.equal(second.state.round.phase, "auction");
  assert.equal(second.state.round.auction.currentOfferIndex, 1);
  assert.ok(
    second.events.some((event) => (event as { type: string }).type === "auctionResolved")
  );
});

test("application layer buys fence charges during the auction phase", () => {
  const match = createAuctionFixture();
  const result = handleMatchCommand(match, {
    type: "match.purchaseSpecialCard",
    version: 1,
    matchId: match.matchId,
    playerId: "player-1",
    cardType: "fence"
  });

  assert.equal(result.rejection, null);
  assert.equal(result.state.players["player-1"]?.specialInventory.fence, 3);
  assert.ok(
    result.events.some((event) => (event as { type: string }).type === "specialCardPurchased")
  );
});

test("application layer buys large fence charges during the auction phase", () => {
  const match = createAuctionFixture();
  const result = handleMatchCommand(match, {
    type: "match.purchaseSpecialCard",
    version: 1,
    matchId: match.matchId,
    playerId: "player-1",
    cardType: "largeFence"
  });

  assert.equal(result.rejection, null);
  assert.equal(result.state.players["player-1"]?.specialInventory.largeFence, 3);
  assert.equal(result.state.players["player-1"]?.score, 1);
});

test("application layer returns authoritative events for a valid move", () => {
  const match = createTwoPlayerMatchFixture();

  const result = handleMatchCommand(match, {
    type: "match.movePlayer",
    version: 1,
    matchId: match.matchId,
    playerId: "player-1",
    direction: "east"
  });

  assert.equal(result.rejection, null);
  assert.deepEqual(
    result.events.map((event) => (event as { type: string }).type),
    ["playerMoved", "treasurePickedUp", "turnEnded"]
  );
  assert.equal(result.state.round.activePlayerId, "player-2");
});
