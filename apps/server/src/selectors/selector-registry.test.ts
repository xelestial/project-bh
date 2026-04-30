import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../../packages/domain/src/index.ts";
import {
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  validateSelectorEnvelope
} from "../../../../packages/protocol/src/index.ts";
import { selectForViewer } from "./selector-registry.ts";

test("snapshot bundle selector omits private fields from public player entries", () => {
  const state = createMatchState({
    matchId: "match-selector-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  const envelope = selectForViewer({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    revision: 1,
    snapshot: {
      sessionId: "session-selector-test",
      state,
      logLength: 0
    },
    viewerPlayerId: "p1"
  });

  const validation = validateSelectorEnvelope(envelope);
  assert.equal(validation.ok, true);

  const payload = envelope.payload as {
    readonly state: {
      readonly players: Record<string, Record<string, unknown>>;
    };
    readonly viewer: {
      readonly playerId: string;
      readonly self: Record<string, unknown>;
    };
  };

  assert.equal(payload.viewer.playerId, "p1");
  assert.equal("availablePriorityCards" in payload.state.players.p2!, false);
  assert.equal("specialInventory" in payload.state.players.p2!, false);
  assert.equal("carriedTreasureId" in payload.state.players.p2!, false);
  assert.equal("availablePriorityCards" in payload.viewer.self, true);
});
