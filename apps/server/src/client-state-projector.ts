import { queryTurnAffordances } from "../../../packages/application/src/index.ts";
import type { MatchSessionSnapshot } from "./index.ts";

export interface ProjectedMatchSnapshot {
  readonly sessionId: string;
  readonly logLength: number;
  readonly state: {
    readonly matchId: string;
    readonly settings: {
      readonly totalRounds: number;
      readonly roundOpenTreasureTarget: number;
      readonly rotationZone: {
        readonly origin: { readonly x: number; readonly y: number };
        readonly width: number;
        readonly height: number;
      };
    };
    readonly players: MatchSessionSnapshot["state"]["players"];
    readonly treasures: Readonly<
      Record<
        string,
        {
          readonly id: string;
          readonly slot: number;
          readonly ownerPlayerId: string;
          readonly position: { readonly x: number; readonly y: number } | null;
          readonly carriedByPlayerId: string | null;
          readonly openedByPlayerId: string | null;
          readonly removedFromRound: boolean;
          readonly visiblePoints: number | null;
        }
      >
    >;
    readonly board: MatchSessionSnapshot["state"]["board"];
    readonly round: {
      readonly roundNumber: number;
      readonly phase: MatchSessionSnapshot["state"]["round"]["phase"];
      readonly activePlayerId: string | null;
      readonly turn: MatchSessionSnapshot["state"]["round"]["turn"];
      readonly auction: {
        readonly currentOffer: MatchSessionSnapshot["state"]["round"]["auction"]["offers"][number] | null;
        readonly resolvedOffers: MatchSessionSnapshot["state"]["round"]["auction"]["resolvedOffers"];
        readonly hasSubmittedBid: boolean;
      };
    };
    readonly completed: boolean;
    readonly result: MatchSessionSnapshot["state"]["result"];
  };
  readonly viewer: {
    readonly playerId: string;
    readonly ownedTreasureCards: readonly {
      readonly id: string;
      readonly slot: number;
      readonly points: number;
      readonly placed: boolean;
      readonly opened: boolean;
      readonly position: { readonly x: number; readonly y: number } | null;
    }[];
    readonly turnHints: ReturnType<typeof queryTurnAffordances>;
  };
}

export function projectSnapshotForPlayer(
  snapshot: MatchSessionSnapshot,
  viewerPlayerId: string
): ProjectedMatchSnapshot {
  const currentOffer =
    snapshot.state.round.auction.offers[snapshot.state.round.auction.currentOfferIndex] ?? null;

  return {
    sessionId: snapshot.sessionId,
    logLength: snapshot.logLength,
    state: {
      matchId: snapshot.state.matchId,
      settings: {
        totalRounds: snapshot.state.settings.totalRounds,
        roundOpenTreasureTarget: snapshot.state.settings.roundOpenTreasureTarget,
        rotationZone: snapshot.state.settings.rotationZone
      },
      players: snapshot.state.players,
      treasures: Object.fromEntries(
        Object.values(snapshot.state.treasures).map((treasure) => [
          treasure.id,
          {
            id: treasure.id,
            slot: treasure.slot,
            ownerPlayerId: treasure.ownerPlayerId,
            position: treasure.position,
            carriedByPlayerId: treasure.carriedByPlayerId,
            openedByPlayerId: treasure.openedByPlayerId,
            removedFromRound: treasure.removedFromRound,
            visiblePoints:
              treasure.ownerPlayerId === viewerPlayerId || treasure.openedByPlayerId !== null
                ? treasure.points
                : null
          }
        ])
      ),
      board: snapshot.state.board,
      round: {
        roundNumber: snapshot.state.round.roundNumber,
        phase: snapshot.state.round.phase,
        activePlayerId: snapshot.state.round.activePlayerId,
        turn: snapshot.state.round.turn,
        auction: {
          currentOffer,
          resolvedOffers: snapshot.state.round.auction.resolvedOffers,
          hasSubmittedBid: snapshot.state.round.auction.submittedBids[viewerPlayerId] !== null
        }
      },
      completed: snapshot.state.completed,
      result: snapshot.state.result
    },
    viewer: {
      playerId: viewerPlayerId,
      ownedTreasureCards: Object.values(snapshot.state.treasures)
        .filter((treasure) => treasure.ownerPlayerId === viewerPlayerId)
        .map((treasure) => ({
          id: treasure.id,
          slot: treasure.slot,
          points: treasure.points,
          placed: treasure.position !== null,
          opened: treasure.openedByPlayerId !== null,
          position: treasure.position
        })),
      turnHints: queryTurnAffordances(snapshot.state, viewerPlayerId)
    }
  };
}
