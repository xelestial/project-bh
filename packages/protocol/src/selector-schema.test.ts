import assert from "node:assert/strict";
import test from "node:test";

import {
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  validateSelectorEnvelope
} from "./selector-schema.ts";

test("selector envelope accepts an exact match snapshot bundle", () => {
  const result = validateSelectorEnvelope({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    version: 1,
    revision: 7,
    payload: {
      sessionId: "session-room-1",
      logLength: 6,
      state: {
        matchId: "match-1",
        players: {},
        board: { width: 20, height: 20, cells: [] },
        round: { roundNumber: 1, phase: "priority", activePlayerId: null },
        completed: false
      },
      viewer: {
        playerId: "player-1",
        self: {},
        turnHints: {}
      }
    }
  });

  assert.equal(result.ok, true);
});

test("selector envelope rejects extra top-level fields", () => {
  const result = validateSelectorEnvelope({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    version: 1,
    revision: 7,
    payload: {},
    leakedMatchState: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown selector envelope field/);
});

test("selector envelope rejects unknown selectors", () => {
  const result = validateSelectorEnvelope({
    selectorId: "match.rawState.v1",
    version: 1,
    revision: 1,
    payload: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown selector/);
});
