import type {
  CommandEnvelope,
  EventEnvelope,
  IdempotencyRecord,
  MatchSnapshotRecord,
  PlayerSessionRecord,
  RoomRecord,
  RuntimeStore,
  StreamEntry
} from "./ports.ts";

interface RedisStreamReplyEntry {
  readonly id: string;
  readonly message: Record<string, string>;
}

interface RedisRuntimeClient {
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<readonly string[]>;
  incr(key: string): Promise<number>;
  pExpireAt(key: string, millisecondsTimestamp: number): Promise<unknown>;
  xAdd(key: string, id: "*", message: Record<string, string>): Promise<string>;
  xRange(
    key: string,
    start: string,
    end: string,
    options?: { readonly COUNT: number }
  ): Promise<readonly RedisStreamReplyEntry[]>;
}

export interface RedisRuntimeStoreOptions {
  readonly client: RedisRuntimeClient;
  readonly keyPrefix?: string;
}

function normalizePrefix(prefix: string | undefined): string {
  return (prefix ?? "bh").replace(/:+$/, "");
}

function encode(value: unknown): string {
  return JSON.stringify(value);
}

function decode<TValue>(raw: string | null): TValue | null {
  if (raw === null) {
    return null;
  }

  return JSON.parse(raw) as TValue;
}

function assertRoomRecord(value: RoomRecord | null): RoomRecord | null {
  if (value === null) {
    return null;
  }

  if (!value.roomId || !value.inviteCode) {
    throw new Error("Invalid room record loaded from Redis.");
  }

  return value;
}

function assertSessionRecord(
  value: PlayerSessionRecord | null
): PlayerSessionRecord | null {
  if (value === null) {
    return null;
  }

  if (!value.tokenHash || !value.roomId || !value.playerId) {
    throw new Error("Invalid player session record loaded from Redis.");
  }

  return value;
}

function assertSnapshotRecord(
  value: MatchSnapshotRecord | null
): MatchSnapshotRecord | null {
  if (value === null) {
    return null;
  }

  if (!value.sessionId || !value.state || typeof value.revision !== "number") {
    throw new Error("Invalid match snapshot record loaded from Redis.");
  }

  return value;
}

function decodeStreamEntry<TValue>(entry: RedisStreamReplyEntry): StreamEntry<TValue> {
  const payload = entry.message.payload;

  if (!payload) {
    throw new Error(`Redis stream entry ${entry.id} is missing a payload.`);
  }

  return {
    streamId: entry.id,
    value: JSON.parse(payload) as TValue
  };
}

export function createRedisRuntimeStore(
  options: RedisRuntimeStoreOptions
): RuntimeStore {
  const prefix = normalizePrefix(options.keyPrefix);

  const keys = {
    room: (roomId: string) => `${prefix}:room:${roomId}`,
    roomPattern: () => `${prefix}:room:*`,
    session: (tokenHash: string) => `${prefix}:session:${tokenHash}`,
    snapshot: (sessionId: string) => `${prefix}:match:${sessionId}:snapshot`,
    commands: (sessionId: string) => `${prefix}:match:${sessionId}:commands`,
    events: (sessionId: string) => `${prefix}:match:${sessionId}:events`,
    idempotency: (sessionId: string, commandId: string) =>
      `${prefix}:match:${sessionId}:idempotency:${commandId}`,
    rateLimit: (key: string) => `${prefix}:ratelimit:${key}`
  };

  async function readRooms(): Promise<readonly RoomRecord[]> {
    const roomKeys = await options.client.keys(keys.roomPattern());
    const rooms = await Promise.all(
      roomKeys.map(async (key) => assertRoomRecord(decode<RoomRecord>(await options.client.get(key))))
    );

    return rooms.filter((room): room is RoomRecord => room !== null);
  }

  return {
    rooms: {
      async save(room) {
        await options.client.set(keys.room(room.roomId), encode(room));
      },
      async get(roomId) {
        return assertRoomRecord(decode<RoomRecord>(await options.client.get(keys.room(roomId))));
      },
      async findByInviteCode(inviteCode) {
        const normalizedInviteCode = inviteCode.toUpperCase();
        const rooms = await readRooms();
        return (
          rooms.find(
            (room) => room.inviteCode.toUpperCase() === normalizedInviteCode
          ) ?? null
        );
      },
      async listJoinable(listOptions) {
        const rooms = await readRooms();

        return rooms
          .filter(
            (room) =>
              room.visibility === "public" &&
              room.status === "lobby" &&
              (!listOptions.hasSeatOnly ||
                room.players.length < room.desiredPlayerCount)
          )
          .sort((left, right) => {
            if (listOptions.sort === "players") {
              return (
                right.players.length - left.players.length ||
                Date.parse(right.createdAt) - Date.parse(left.createdAt)
              );
            }

            return Date.parse(right.createdAt) - Date.parse(left.createdAt);
          });
      }
    },
    sessions: {
      async save(session) {
        await options.client.set(keys.session(session.tokenHash), encode(session));
      },
      async getByTokenHash(tokenHash) {
        return assertSessionRecord(
          decode<PlayerSessionRecord>(await options.client.get(keys.session(tokenHash)))
        );
      },
      async revoke(tokenHash, revokedAt) {
        const session = assertSessionRecord(
          decode<PlayerSessionRecord>(await options.client.get(keys.session(tokenHash)))
        );

        if (!session) {
          return;
        }

        await options.client.set(
          keys.session(tokenHash),
          encode({
            ...session,
            revokedAt
          })
        );
      }
    },
    matches: {
      async saveSnapshot(snapshot) {
        await options.client.set(keys.snapshot(snapshot.sessionId), encode(snapshot));
      },
      async getSnapshot(sessionId) {
        return assertSnapshotRecord(
          decode<MatchSnapshotRecord>(await options.client.get(keys.snapshot(sessionId)))
        );
      }
    },
    streams: {
      async appendCommand(sessionId, envelope) {
        return options.client.xAdd(keys.commands(sessionId), "*", {
          payload: encode(envelope)
        });
      },
      async readCommands(sessionId, afterStreamId, count) {
        const entries = await options.client.xRange(
          keys.commands(sessionId),
          `(${afterStreamId}`,
          "+",
          { COUNT: count }
        );

        return entries.map((entry) => decodeStreamEntry<CommandEnvelope>(entry));
      },
      async appendEvent(sessionId, envelope) {
        return options.client.xAdd(keys.events(sessionId), "*", {
          payload: encode(envelope)
        });
      },
      async readEvents(sessionId, afterStreamId, count) {
        const entries = await options.client.xRange(
          keys.events(sessionId),
          `(${afterStreamId}`,
          "+",
          { COUNT: count }
        );

        return entries.map((entry) => decodeStreamEntry<EventEnvelope>(entry));
      }
    },
    idempotency: {
      async save(sessionId, record) {
        await options.client.set(
          keys.idempotency(sessionId, record.commandId),
          encode(record)
        );
      },
      async get(sessionId, commandId) {
        return decode<IdempotencyRecord>(
          await options.client.get(keys.idempotency(sessionId, commandId))
        );
      }
    },
    rateLimits: {
      async increment(key, windowExpiresAt) {
        const redisKey = keys.rateLimit(key);
        const count = await options.client.incr(redisKey);

        if (count === 1) {
          await options.client.pExpireAt(redisKey, windowExpiresAt);
        }

        return count;
      }
    }
  };
}
