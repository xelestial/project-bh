import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBrowserVisualFailures,
  type BrowserVisualState
} from "./browser-visual-assertions.ts";

const baseState: BrowserVisualState = {
  phase: "inTurn",
  priorityCardCount: 6,
  enabledPriorityCardCount: 4,
  turnOrderNodeCount: 2,
  visibleTurnOrderNodeCount: 2,
  mandatoryMoveHintCount: 1,
  secondaryMoveHintCount: 0,
  actionStatusVisible: true,
  contextMenuVisible: false,
  contextActionCount: 0,
  horizontalOverflow: false
};

test("browser visual assertions accept visible priority and turn-order state", () => {
  assert.deepEqual(
    collectBrowserVisualFailures({
      ...baseState,
      phase: "prioritySubmission"
    }),
    []
  );
});

test("browser visual assertions reject missing move hints and overlay actions", () => {
  assert.deepEqual(
    collectBrowserVisualFailures({
      ...baseState,
      phase: "inTurn",
      turnStage: "mandatoryStep",
      mandatoryMoveHintCount: 0,
      contextMenuVisible: true,
      contextActionCount: 0
    }),
    [
      "mandatory move stage should show at least one 1-step hint",
      "visible context menu should expose at least one action"
    ]
  );
});
