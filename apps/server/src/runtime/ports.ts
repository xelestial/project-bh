import type { MatchState } from "../../../../packages/domain/src/index.ts";
import type {
  CommandHandlingResult,
  MatchCommand
} from "../../../../packages/application/src/index.ts";

export type RoomStatus = "lobby" | "started";
export type RoomVisibility = "public" | "private";

export interface RoomPlayerRecord {
  readonly id: string;
  readonly name: string;
}

export interface RoomRecord {
  readonly roomId: string;
  readonly inviteCode: string;
  readonly roomName: string;
  readonly visibility: RoomVisibility;
  readonly hostPlayerId: string;
  readonly desiredPlayerCount: number;
  readonly createdAt: string;
  readonly players: readonly RoomPlayerRecord[];
  readonly status: RoomStatus;
  readonly sessionId: string | null;
}

export interface PlayerSessionRecord {
  readonly tokenHash: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly clientInstanceId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface MatchSnapshotRecord {
  readonly sessionId: string;
  readonly state: MatchState;
  readonly logLength: number;
  readonly revision: number;
}

export interface CommandEnvelope {
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly receivedAt: string;
  readonly payload: MatchCommand;
}

export interface EventEnvelope {
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly processedAt: string;
  readonly result: CommandHandlingResult;
  readonly revision: number;
}

export interface StreamEntry<TValue> {
  readonly streamId: string;
  readonly value: TValue;
}

export interface RoomRepository {
  save(room: RoomRecord): Promise<void>;
  get(roomId: string): Promise<RoomRecord | null>;
  findByInviteCode(inviteCode: string): Promise<RoomRecord | null>;
  listJoinable(options: {
    readonly sort: "recent" | "players";
    readonly hasSeatOnly: boolean;
  }): Promise<readonly RoomRecord[]>;
}

export interface SessionRepository {
  save(session: PlayerSessionRecord): Promise<void>;
  getByTokenHash(tokenHash: string): Promise<PlayerSessionRecord | null>;
  revoke(tokenHash: string, revokedAt: string): Promise<void>;
}

export interface MatchRepository {
  saveSnapshot(snapshot: MatchSnapshotRecord): Promise<void>;
  getSnapshot(sessionId: string): Promise<MatchSnapshotRecord | null>;
}

export interface RuntimeStreams {
  appendCommand(sessionId: string, envelope: CommandEnvelope): Promise<string>;
  readCommands(
    sessionId: string,
    afterStreamId: string,
    count: number
  ): Promise<readonly StreamEntry<CommandEnvelope>[]>;
  appendEvent(sessionId: string, envelope: EventEnvelope): Promise<string>;
  readEvents(
    sessionId: string,
    afterStreamId: string,
    count: number
  ): Promise<readonly StreamEntry<EventEnvelope>[]>;
}

export interface RuntimeStore {
  readonly rooms: RoomRepository;
  readonly sessions: SessionRepository;
  readonly matches: MatchRepository;
  readonly streams: RuntimeStreams;
}
