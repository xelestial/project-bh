import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../../packages/domain/src/index.ts";
import {
  MATCH_PUBLIC_STATE_SELECTOR_ID,
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  MATCH_TURN_HINTS_SELECTOR_ID,
  MATCH_VIEWER_PRIVATE_SELECTOR_ID,
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

test("public state selector excludes viewer-only fields", () => {
  const state = createMatchState({
    matchId: "match-public-selector-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  const envelope = selectForViewer({
    selectorId: MATCH_PUBLIC_STATE_SELECTOR_ID,
    revision: 2,
    snapshot: {
      sessionId: "session-public-selector-test",
      state,
      logLength: 0
    },
    viewerPlayerId: "p1"
  });

  const validation = validateSelectorEnvelope(envelope);
  assert.equal(validation.ok, true);

  const payload = envelope.payload as {
    readonly round: {
      readonly auction: Record<string, unknown>;
    };
    readonly players: Record<string, Record<string, unknown>>;
  };

  assert.equal("viewer" in payload, false);
  assert.equal("hasSubmittedBid" in payload.round.auction, false);
  assert.equal("availablePriorityCards" in payload.players.p1!, false);
  assert.equal("availablePriorityCards" in payload.players.p2!, false);
});

test("viewer private selector exposes only exact viewer private data", () => {
  const state = createMatchState({
    matchId: "match-viewer-private-selector-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  const envelope = selectForViewer({
    selectorId: MATCH_VIEWER_PRIVATE_SELECTOR_ID,
    revision: 3,
    snapshot: {
      sessionId: "session-viewer-private-selector-test",
      state,
      logLength: 0
    },
    viewerPlayerId: "p1"
  });

  const validation = validateSelectorEnvelope(envelope);
  assert.equal(validation.ok, true);

  const payload = envelope.payload as {
    readonly playerId: string;
    readonly self: Record<string, unknown>;
    readonly auction: Record<string, unknown>;
  };

  assert.equal("state" in payload, false);
  assert.equal("turnHints" in payload, false);
  assert.equal(payload.playerId, "p1");
  assert.equal("availablePriorityCards" in payload.self, true);
  assert.equal(typeof payload.auction.hasSubmittedBid, "boolean");
});

test("turn hints selector exposes turn affordances without private inventory", () => {
  const state = createMatchState({
    matchId: "match-turn-hints-selector-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  const envelope = selectForViewer({
    selectorId: MATCH_TURN_HINTS_SELECTOR_ID,
    revision: 4,
    snapshot: {
      sessionId: "session-turn-hints-selector-test",
      state,
      logLength: 0
    },
    viewerPlayerId: "p1"
  });

  const validation = validateSelectorEnvelope(envelope);
  assert.equal(validation.ok, true);
  assert.equal("availablePriorityCards" in (envelope.payload as Record<string, unknown>), false);
});

test("snapshot bundle selector is composed from granular selectors for compatibility", () => {
  const state = createMatchState({
    matchId: "match-selector-composition-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });
  const snapshot = {
    sessionId: "session-selector-composition-test",
    state,
    logLength: 9
  };

  const publicState = selectForViewer({
    selectorId: MATCH_PUBLIC_STATE_SELECTOR_ID,
    revision: 5,
    snapshot,
    viewerPlayerId: "p1"
  });
  const viewerPrivate = selectForViewer({
    selectorId: MATCH_VIEWER_PRIVATE_SELECTOR_ID,
    revision: 5,
    snapshot,
    viewerPlayerId: "p1"
  });
  const turnHints = selectForViewer({
    selectorId: MATCH_TURN_HINTS_SELECTOR_ID,
    revision: 5,
    snapshot,
    viewerPlayerId: "p1"
  });
  const bundle = selectForViewer({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    revision: 5,
    snapshot,
    viewerPlayerId: "p1"
  });

  const publicPayload = publicState.payload as {
    readonly round: {
      readonly auction: Record<string, unknown>;
    };
  };
  const privatePayload = viewerPrivate.payload as {
    readonly auction: {
      readonly hasSubmittedBid: boolean;
    };
  };
  const bundlePayload = bundle.payload as {
    readonly sessionId: string;
    readonly logLength: number;
    readonly state: {
      readonly round: {
        readonly auction: Record<string, unknown>;
      };
    };
    readonly viewer: {
      readonly turnHints: unknown;
    };
  };

  assert.equal(bundlePayload.sessionId, snapshot.sessionId);
  assert.equal(bundlePayload.logLength, snapshot.logLength);
  assert.deepEqual(
    bundlePayload.state.round.auction,
    {
      ...publicPayload.round.auction,
      hasSubmittedBid: privatePayload.auction.hasSubmittedBid
    }
  );
  assert.deepEqual(bundlePayload.viewer.turnHints, turnHints.payload);
});
