import assert from "node:assert/strict";
import test from "node:test";

import { createServerCompositionRoot } from "../../server/src/index.ts";
import { createWebCompositionRoot } from "./index.ts";

test("web client adapter tracks authoritative snapshots and exposes a view model", () => {
  const server = createServerCompositionRoot();
  server.createSession("session-web", {
    matchId: "match-web",
    players: [
      { id: "player-1", name: "Alpha" },
      { id: "player-2", name: "Bravo" }
    ]
  });
  const web = createWebCompositionRoot();
  const client = web.createClient(server, "session-web", "player-1");
  const otherClient = web.createClient(server, "session-web", "player-2");

  while (client.getSnapshot().state.round.phase === "auction") {
    client.submitAuctionBids([]);
    otherClient.submitAuctionBids([]);
  }

  const afterAuction = client.getViewModel();
  assert.equal(afterAuction.phase, "prioritySubmission");
  assert.equal(afterAuction.currentPlayerId, "player-1");
  assert.equal(afterAuction.currentPlayerSpecialInventory.fence, 0);

  client.submitPriority(6);
  otherClient.submitPriority(5);

  const viewModel = client.getViewModel();

  assert.equal(viewModel.phase, "inTurn");
  assert.equal(viewModel.activePlayerId, "player-1");
  assert.ok(Array.isArray(viewModel.auctionOffers));

  client.disconnect();
  otherClient.disconnect();
});
