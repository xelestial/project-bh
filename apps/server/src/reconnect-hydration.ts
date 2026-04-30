import type {
  PlayerSessionRecord,
  RoomRecord,
  RuntimeStore
} from "./runtime/ports.ts";
import { hashSessionToken } from "./security/session-token.ts";

export interface ReconnectContext {
  readonly room: RoomRecord;
  readonly session: PlayerSessionRecord;
  readonly tokenHash: string;
}

export interface LoadReconnectContextOptions {
  readonly store: RuntimeStore;
  readonly roomId: string;
  readonly sessionToken: string | null;
  readonly sessionTokenSecret: string;
  readonly now?: () => string;
}

function isActiveSession(
  session: PlayerSessionRecord,
  now: string
): boolean {
  return (
    session.revokedAt === null &&
    Date.parse(session.expiresAt) > Date.parse(now)
  );
}

function roomContainsPlayer(room: RoomRecord, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

export async function loadReconnectContext(
  options: LoadReconnectContextOptions
): Promise<ReconnectContext | null> {
  if (!options.sessionToken) {
    return null;
  }

  const tokenHash = hashSessionToken(
    options.sessionToken,
    options.sessionTokenSecret
  );
  const [room, session] = await Promise.all([
    options.store.rooms.get(options.roomId),
    options.store.sessions.getByTokenHash(tokenHash)
  ]);

  if (!room || !session) {
    return null;
  }

  if (session.roomId !== room.roomId) {
    return null;
  }

  if (!isActiveSession(session, options.now ? options.now() : new Date().toISOString())) {
    return null;
  }

  if (!roomContainsPlayer(room, session.playerId)) {
    return null;
  }

  return {
    room,
    session,
    tokenHash
  };
}
