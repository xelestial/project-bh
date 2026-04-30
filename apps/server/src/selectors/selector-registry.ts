import {
  MATCH_PUBLIC_STATE_SELECTOR_ID,
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  MATCH_TURN_HINTS_SELECTOR_ID,
  MATCH_VIEWER_PRIVATE_SELECTOR_ID,
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

type ProjectedPublicAuction = Omit<
  ProjectedMatchSnapshot["state"]["round"]["auction"],
  "hasSubmittedBid"
>;

type ProjectedPublicState = Omit<ProjectedMatchSnapshot["state"], "round"> & {
  readonly round: Omit<ProjectedMatchSnapshot["state"]["round"], "auction"> & {
    readonly auction: ProjectedPublicAuction;
  };
};

interface ProjectedViewerPrivate {
  readonly playerId: string;
  readonly self: ProjectedMatchSnapshot["viewer"]["self"];
  readonly treasurePlacementHand: ProjectedMatchSnapshot["viewer"]["treasurePlacementHand"];
  readonly revealedTreasureCards: ProjectedMatchSnapshot["viewer"]["revealedTreasureCards"];
  readonly auction: {
    readonly hasSubmittedBid: boolean;
  };
}

type ProjectedTurnHints = ProjectedMatchSnapshot["viewer"]["turnHints"];

type SelectorPayload =
  | ProjectedMatchSnapshot
  | ProjectedPublicState
  | ProjectedViewerPrivate
  | ProjectedTurnHints;

function projectForViewer(request: ViewerSelectorRequest): ProjectedMatchSnapshot {
  return projectSnapshotForPlayer(request.snapshot, request.viewerPlayerId);
}

function selectPublicState(projected: ProjectedMatchSnapshot): ProjectedPublicState {
  const { hasSubmittedBid: _hasSubmittedBid, ...publicAuction } = projected.state.round.auction;

  return {
    ...projected.state,
    round: {
      ...projected.state.round,
      auction: publicAuction
    }
  };
}

function selectViewerPrivate(projected: ProjectedMatchSnapshot): ProjectedViewerPrivate {
  return {
    playerId: projected.viewer.playerId,
    self: projected.viewer.self,
    treasurePlacementHand: projected.viewer.treasurePlacementHand,
    revealedTreasureCards: projected.viewer.revealedTreasureCards,
    auction: {
      hasSubmittedBid: projected.state.round.auction.hasSubmittedBid
    }
  };
}

function selectTurnHints(projected: ProjectedMatchSnapshot): ProjectedTurnHints {
  return projected.viewer.turnHints;
}

function composeSnapshotBundle(projected: ProjectedMatchSnapshot): ProjectedMatchSnapshot {
  const publicState = selectPublicState(projected);
  const viewerPrivate = selectViewerPrivate(projected);
  const turnHints = selectTurnHints(projected);

  return {
    sessionId: projected.sessionId,
    logLength: projected.logLength,
    state: {
      ...publicState,
      round: {
        ...publicState.round,
        auction: {
          ...publicState.round.auction,
          hasSubmittedBid: viewerPrivate.auction.hasSubmittedBid
        }
      }
    },
    viewer: {
      playerId: viewerPrivate.playerId,
      self: viewerPrivate.self,
      treasurePlacementHand: viewerPrivate.treasurePlacementHand,
      revealedTreasureCards: viewerPrivate.revealedTreasureCards,
      turnHints
    }
  };
}

function envelope<TPayload extends SelectorPayload>(
  request: ViewerSelectorRequest,
  payload: TPayload
): SelectorEnvelope<TPayload> {
  return {
    selectorId: request.selectorId,
    version: 1,
    revision: request.revision,
    payload
  };
}

export function selectForViewer(
  request: ViewerSelectorRequest
): SelectorEnvelope<SelectorPayload> {
  const projected = projectForViewer(request);

  switch (request.selectorId) {
    case MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID:
      return envelope(request, composeSnapshotBundle(projected));
    case MATCH_PUBLIC_STATE_SELECTOR_ID:
      return envelope(request, selectPublicState(projected));
    case MATCH_VIEWER_PRIVATE_SELECTOR_ID:
      return envelope(request, selectViewerPrivate(projected));
    case MATCH_TURN_HINTS_SELECTOR_ID:
      return envelope(request, selectTurnHints(projected));
  }
}
