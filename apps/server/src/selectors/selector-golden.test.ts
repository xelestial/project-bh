import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTwoPlayerMatchFixture } from "../../../../packages/testkit/src/index.ts";
import {
  MATCH_PUBLIC_STATE_SELECTOR_ID,
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  MATCH_TURN_HINTS_SELECTOR_ID,
  MATCH_VIEWER_PRIVATE_SELECTOR_ID,
  validateSelectorEnvelope,
  type SelectorEnvelope,
  type SelectorId
} from "../../../../packages/protocol/src/index.ts";
import { selectForViewer } from "./selector-registry.ts";

const GOLDEN_DIR = new URL("../../../../docs/fixtures/selectors/", import.meta.url);

const GOLDEN_CASES: readonly {
  readonly selectorId: SelectorId;
  readonly fileName: string;
}[] = [
  {
    selectorId: MATCH_PUBLIC_STATE_SELECTOR_ID,
    fileName: "match.publicState.v1.json"
  },
  {
    selectorId: MATCH_VIEWER_PRIVATE_SELECTOR_ID,
    fileName: "match.viewerPrivate.v1.json"
  },
  {
    selectorId: MATCH_TURN_HINTS_SELECTOR_ID,
    fileName: "match.turnHints.v1.json"
  },
  {
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    fileName: "match.snapshotBundle.v1.json"
  }
];

function loadGolden(fileName: string): SelectorEnvelope {
  return JSON.parse(
    readFileSync(new URL(fileName, GOLDEN_DIR), "utf8")
  ) as SelectorEnvelope;
}

test("selector golden samples match the stable two-player fixture", () => {
  const snapshot = {
    sessionId: "session-selector-golden",
    state: createTwoPlayerMatchFixture(),
    logLength: 7
  };

  for (const { selectorId, fileName } of GOLDEN_CASES) {
    const envelope = selectForViewer({
      selectorId,
      revision: 7,
      snapshot,
      viewerPlayerId: "player-1"
    });
    const validation = validateSelectorEnvelope(envelope);

    assert.equal(validation.ok, true);
    assert.deepEqual(envelope, loadGolden(fileName), fileName);
  }
});
