import { queryTurnAffordances } from "../../../packages/application/src/index.ts";
import type { MatchSessionSnapshot } from "./index.ts";
import { projectTreasureIdForClient } from "./treasure-client-ids.ts";

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
      readonly treasurePlacementZone: {
        readonly origin: { readonly x: number; readonly y: number };
        readonly width: number;
        readonly height: number;
      };
    };
    readonly treasureBoard: {
      readonly slots: readonly {
        readonly slot: number;
        readonly hasCard: boolean;
        readonly opened: boolean;
        readonly openedByPlayerId: string | null;
      }[];
    };
    readonly players: Readonly<
      Record<
        string,
        {
          readonly id: string;
          readonly name: string;
          readonly seat: number;
          readonly position: { readonly x: number; readonly y: number };
          readonly score: number;
          readonly hitPoints: number;
          readonly eliminated: boolean;
          readonly carryingTreasure: boolean;
        }
      >
    >;
    readonly treasures: Readonly<
      Record<
        string,
        {
          readonly id: string;
          readonly position: { readonly x: number; readonly y: number } | null;
          readonly carriedByPlayerId: string | null;
          readonly openedByPlayerId: string | null;
          readonly removedFromRound: boolean;
        }
      >
    >;
    readonly board: MatchSessionSnapshot["state"]["board"];
    readonly round: {
      readonly roundNumber: number;
      readonly phase: MatchSessionSnapshot["state"]["round"]["phase"];
      readonly activePlayerId: string | null;
      readonly turnOrder: readonly string[];
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
    readonly self: {
      readonly id: string;
      readonly carriedTreasureId: string | null;
      readonly openedTreasureIds: readonly string[];
      readonly availablePriorityCards: MatchSessionSnapshot["state"]["players"][string]["availablePriorityCards"];
      readonly specialInventory: MatchSessionSnapshot["state"]["players"][string]["specialInventory"];
      readonly status: MatchSessionSnapshot["state"]["players"][string]["status"];
    };
    readonly treasurePlacementHand: readonly {
      readonly id: string;
      readonly slot: number | null;
      readonly points: number;
      readonly isFake: boolean;
    }[];
    readonly revealedTreasureCards: readonly {
      readonly id: string;
      readonly slot: number;
      readonly points: number;
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
  const publicTreasureEntries = Object.values(snapshot.state.treasures)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((treasure) => {
      const publicId = projectTreasureIdForClient(snapshot, treasure.id);

      return [
        publicId,
        {
          id: publicId,
          position: treasure.position,
          carriedByPlayerId: treasure.carriedByPlayerId,
          openedByPlayerId: treasure.openedByPlayerId,
          removedFromRound: treasure.removedFromRound
        }
      ] as const;
    });

  return {
    sessionId: snapshot.sessionId,
    logLength: snapshot.logLength,
    state: {
      matchId: snapshot.state.matchId,
      settings: {
        totalRounds: snapshot.state.settings.totalRounds,
        roundOpenTreasureTarget: snapshot.state.settings.roundOpenTreasureTarget,
        rotationZone: snapshot.state.settings.rotationZone,
        treasurePlacementZone: snapshot.state.settings.treasurePlacementZone
      },
      treasureBoard: {
        slots: snapshot.state.treasureBoardSlots.map((slot) => {
          const treasure = Object.values(snapshot.state.treasures).find((candidate) => candidate.slot === slot);

          return {
            slot,
            hasCard: treasure !== undefined,
            opened: treasure !== undefined && treasure.openedByPlayerId !== null,
            openedByPlayerId: treasure?.openedByPlayerId ?? null
          };
        })
      },
      players: Object.fromEntries(
        Object.values(snapshot.state.players).map((player) => [
          player.id,
          {
            id: player.id,
            name: player.name,
            seat: player.seat,
            position: player.position,
            score: player.score,
            hitPoints: player.hitPoints,
            eliminated: player.eliminated,
            carryingTreasure: player.carriedTreasureId !== null
          }
        ])
      ),
      treasures: Object.fromEntries(publicTreasureEntries),
      board: snapshot.state.board,
      round: {
        roundNumber: snapshot.state.round.roundNumber,
        phase: snapshot.state.round.phase,
        activePlayerId: snapshot.state.round.activePlayerId,
        turnOrder: snapshot.state.round.turnOrder,
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
      self: {
        id: snapshot.state.players[viewerPlayerId]!.id,
        carriedTreasureId:
          snapshot.state.players[viewerPlayerId]!.carriedTreasureId === null
            ? null
            : projectTreasureIdForClient(
                snapshot,
                snapshot.state.players[viewerPlayerId]!.carriedTreasureId
              ),
        openedTreasureIds: snapshot.state.players[viewerPlayerId]!.openedTreasureIds.map((treasureId) =>
          projectTreasureIdForClient(snapshot, treasureId)
        ),
        availablePriorityCards: snapshot.state.players[viewerPlayerId]!.availablePriorityCards,
        specialInventory: snapshot.state.players[viewerPlayerId]!.specialInventory,
        status: snapshot.state.players[viewerPlayerId]!.status
      },
      treasurePlacementHand:
        snapshot.state.round.phase === "treasurePlacement"
          ? Object.values(snapshot.state.treasures)
            .filter((treasure) => treasure.ownerPlayerId === viewerPlayerId)
            .filter((treasure) => treasure.slot === null || treasure.position === null)
            .map((treasure) => ({
              id: projectTreasureIdForClient(snapshot, treasure.id),
              slot: treasure.slot,
              points: treasure.points,
              isFake: treasure.slot === null
            }))
          : [],
      revealedTreasureCards: Object.values(snapshot.state.treasures).flatMap((treasure) => {
        if (treasure.openedByPlayerId !== viewerPlayerId || treasure.slot === null) {
          return [];
        }

        return [{
          id: projectTreasureIdForClient(snapshot, treasure.id),
          slot: treasure.slot,
          points: treasure.points
        }];
      }),
      turnHints: queryTurnAffordances(snapshot.state, viewerPlayerId)
    }
  };
}
