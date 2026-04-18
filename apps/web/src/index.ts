import type { AuctionBidState, Position, RotationDirection, RotationSelection, SpecialCardType } from "../../../packages/domain/src/index.ts";
import { getCommandVersion } from "../../../packages/protocol/src/index.ts";
import type { MatchSessionSnapshot, ServerCompositionRoot } from "../../server/src/index.ts";

export interface MatchViewModel {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly phase: string;
  readonly activePlayerId: string | null;
  readonly currentPlayerId: string;
  readonly currentPlayerScore: number;
  readonly currentPlayerSpecialCards: readonly SpecialCardType[];
  readonly auctionOffers: readonly {
    slot: number;
    cardType: SpecialCardType;
  }[];
  readonly players: readonly {
    id: string;
    name: string;
    position: { x: number; y: number };
    score: number;
    hitPoints: number;
    eliminated: boolean;
    carriedTreasureId: string | null;
  }[];
  readonly treasures: readonly {
    id: string;
    position: { x: number; y: number } | null;
    carriedByPlayerId: string | null;
    openedByPlayerId: string | null;
    removedFromRound: boolean;
  }[];
  readonly tiles: readonly {
    position: { x: number; y: number };
    kind: string;
  }[];
  readonly fences: readonly {
    id: string;
    positions: readonly [{ x: number; y: number }, { x: number; y: number }];
  }[];
}

export interface WebCompositionRoot {
  readonly mode: "react-shell";
  readonly authoritativeStateSource: "server";
  readonly createClient: (
    server: ServerCompositionRoot,
    sessionId: string,
    playerId: string
  ) => LocalMatchClientAdapter;
}

function buildMatchViewModel(
  snapshot: MatchSessionSnapshot,
  playerId: string
): MatchViewModel {
  const currentPlayer = snapshot.state.players[playerId];

  if (!currentPlayer) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  return {
    matchId: snapshot.state.matchId,
    roundNumber: snapshot.state.round.roundNumber,
    phase: snapshot.state.round.phase,
    activePlayerId: snapshot.state.round.activePlayerId,
    currentPlayerId: playerId,
    currentPlayerScore: currentPlayer.score,
    currentPlayerSpecialCards: currentPlayer.specialCards,
    auctionOffers: snapshot.state.round.auction.offers,
    players: Object.values(snapshot.state.players).map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      score: player.score,
      hitPoints: player.hitPoints,
      eliminated: player.eliminated,
      carriedTreasureId: player.carriedTreasureId
    })),
    treasures: Object.values(snapshot.state.treasures).map((treasure) => ({
      id: treasure.id,
      position: treasure.position,
      carriedByPlayerId: treasure.carriedByPlayerId,
      openedByPlayerId: treasure.openedByPlayerId,
      removedFromRound: treasure.removedFromRound
    })),
    tiles: Object.entries(snapshot.state.board.tiles).map(([key, tile]) => {
      const [xText, yText] = key.split(",");
      return {
        position: {
          x: Number.parseInt(xText ?? "0", 10),
          y: Number.parseInt(yText ?? "0", 10)
        },
        kind: tile.kind
      };
    }),
    fences: Object.values(snapshot.state.board.fences).map((fence) => ({
      id: fence.id,
      positions: fence.positions
    }))
  };
}

export class LocalMatchClientAdapter {
  private readonly server: ServerCompositionRoot;
  private readonly sessionId: string;
  private readonly playerId: string;
  private snapshot: MatchSessionSnapshot;
  private unsubscribe: (() => void) | null;

  public constructor(
    server: ServerCompositionRoot,
    sessionId: string,
    playerId: string
  ) {
    this.server = server;
    this.sessionId = sessionId;
    this.playerId = playerId;
    this.snapshot = this.server.reconnect(sessionId, playerId).snapshot;
    this.unsubscribe = this.server.subscribe(sessionId, (snapshot) => {
      this.snapshot = snapshot;
    });
  }

  public disconnect(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  public getSnapshot(): MatchSessionSnapshot {
    return this.snapshot;
  }

  public getViewModel(): MatchViewModel {
    return buildMatchViewModel(this.snapshot, this.playerId);
  }

  public submitAuctionBids(bids: readonly AuctionBidState[]) {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.submitAuctionBids",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId,
      bids
    });
  }

  public submitPriority(priorityCard: 1 | 2 | 3 | 4 | 5 | 6) {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.submitPriority",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId,
      priorityCard
    });
  }

  public move(direction: "north" | "east" | "south" | "west") {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.movePlayer",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId,
      direction
    });
  }

  public throwTile(source: Position, target: Position) {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.throwTile",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId,
      source,
      target
    });
  }

  public rotateTiles(selection: RotationSelection, direction: RotationDirection) {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.rotateTiles",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId,
      selection,
      direction
    });
  }

  public useSpecialCard(input: {
    cardType: SpecialCardType;
    targetPosition?: Position;
    targetPlayerId?: string;
    fencePositions?: readonly [Position, Position];
    selection?: RotationSelection;
    direction?: RotationDirection;
  }) {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.useSpecialCard",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId,
      ...input
    });
  }

  public openTreasure() {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.openTreasure",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId
    });
  }

  public endTurn() {
    return this.server.dispatchCommand(this.sessionId, {
      type: "match.endTurn",
      version: getCommandVersion() as 1,
      matchId: this.snapshot.state.matchId,
      playerId: this.playerId
    });
  }

  public prepareNextRound(treasurePlacements?: Record<string, Position>) {
    return this.server.dispatchCommand(
      this.sessionId,
      treasurePlacements
        ? {
            type: "match.prepareNextRound",
            version: getCommandVersion() as 1,
            matchId: this.snapshot.state.matchId,
            playerId: this.playerId,
            treasurePlacements
          }
        : {
            type: "match.prepareNextRound",
            version: getCommandVersion() as 1,
            matchId: this.snapshot.state.matchId,
            playerId: this.playerId
          }
    );
  }
}

export function createWebCompositionRoot(): WebCompositionRoot {
  return {
    mode: "react-shell",
    authoritativeStateSource: "server",
    createClient: (server, sessionId, playerId) =>
      new LocalMatchClientAdapter(server, sessionId, playerId)
  };
}
