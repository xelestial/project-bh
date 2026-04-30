import {
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  type SelectorEnvelope,
  type SelectorId
} from "../../../../packages/protocol/src/index.ts";
import {
  projectSnapshotForPlayer,
  type ProjectedMatchSnapshot
} from "../client-state-projector.ts";
import type { MatchSessionSnapshot } from "../index.ts";

export interface ViewerSelectorRequest {
  readonly selectorId: SelectorId;
  readonly revision: number;
  readonly snapshot: MatchSessionSnapshot;
  readonly viewerPlayerId: string;
}

export function selectForViewer(
  request: ViewerSelectorRequest
): SelectorEnvelope<ProjectedMatchSnapshot> {
  switch (request.selectorId) {
    case MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID:
      return {
        selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
        version: 1,
        revision: request.revision,
        payload: projectSnapshotForPlayer(request.snapshot, request.viewerPlayerId)
      };
  }
}
