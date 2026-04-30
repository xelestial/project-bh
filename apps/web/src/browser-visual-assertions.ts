import type { RoundPhase } from "../../../packages/domain/src/index.ts";
import type { TurnStage } from "./playtest-shell-view-model.ts";

export interface BrowserVisualState {
  readonly phase: RoundPhase;
  readonly turnStage?: TurnStage | null;
  readonly priorityCardCount: number;
  readonly enabledPriorityCardCount: number;
  readonly turnOrderNodeCount: number;
  readonly visibleTurnOrderNodeCount: number;
  readonly mandatoryMoveHintCount: number;
  readonly secondaryMoveHintCount: number;
  readonly actionStatusVisible: boolean;
  readonly contextMenuVisible: boolean;
  readonly contextActionCount: number;
  readonly horizontalOverflow: boolean;
}

export function collectBrowserVisualFailures(state: BrowserVisualState): readonly string[] {
  const failures: string[] = [];

  if (state.horizontalOverflow) {
    failures.push("match view should not create horizontal overflow");
  }

  if (state.phase === "prioritySubmission") {
    if (state.priorityCardCount !== 6) {
      failures.push("priority submission should render all six priority cards");
    }

    if (state.enabledPriorityCardCount < 1) {
      failures.push("priority submission should expose at least one enabled priority card");
    }
  }

  if (state.turnOrderNodeCount < 1 || state.visibleTurnOrderNodeCount !== state.turnOrderNodeCount) {
    failures.push("turn order chips should be visible");
  }

  if (state.phase === "inTurn" && state.turnStage === "mandatoryStep" && state.mandatoryMoveHintCount < 1) {
    failures.push("mandatory move stage should show at least one 1-step hint");
  }

  if (state.phase === "inTurn" && state.turnStage === "secondaryAction" && !state.actionStatusVisible) {
    failures.push("secondary action stage should show the action status strip");
  }

  if (state.contextMenuVisible && state.contextActionCount < 1) {
    failures.push("visible context menu should expose at least one action");
  }

  return failures;
}
