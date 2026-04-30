import type {
  CommandEnvelope,
  EventEnvelope,
  MatchSnapshotRecord,
  PlayerSessionRecord,
  RoomRecord,
  RuntimeStore,
  StreamEntry
} from "./ports.ts";

function clone<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function createStreamId(length: number): string {
  return `${length + 1}-0`;
}

function parseStreamSequence(streamId: string): number {
  const [sequence] = streamId.split("-");
  const parsed = Number(sequence);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readAfter<TValue>(
  entries: readonly StreamEntry<TValue>[],
  afterStreamId: string,
  count: number
): readonly StreamEntry<TValue>[] {
  const afterSequence = parseStreamSequence(afterStreamId);

  return entries
    .filter((entry) => parseStreamSequence(entry.streamId) > afterSequence)
    .slice(0, count)
    .map((entry) => clone(entry));
}

export function createInMemoryRuntimeStore(): RuntimeStore {
  const rooms = new Map<string, RoomRecord>();
  const sessions = new Map<string, PlayerSessionRecord>();
  const snapshots = new Map<string, MatchSnapshotRecord>();
  const commandStreams = new Map<string, StreamEntry<CommandEnvelope>[]>();
  const eventStreams = new Map<string, StreamEntry<EventEnvelope>[]>();

  return {
    rooms: {
      async save(room) {
        rooms.set(room.roomId, clone(room));
      },
      async get(roomId) {
        const room = rooms.get(roomId);
        return room ? clone(room) : null;
      },
      async findByInviteCode(inviteCode) {
        const normalizedInviteCode = inviteCode.toUpperCase();
        const room = [...rooms.values()].find(
          (candidate) => candidate.inviteCode.toUpperCase() === normalizedInviteCode
        );
        return room ? clone(room) : null;
      },
      async listJoinable(options) {
        return [...rooms.values()]
          .filter(
            (room) =>
              room.visibility === "public" &&
              room.status === "lobby" &&
              (!options.hasSeatOnly || room.players.length < room.desiredPlayerCount)
          )
          .sort((left, right) => {
            if (options.sort === "players") {
              return (
                right.players.length - left.players.length ||
                Date.parse(right.createdAt) - Date.parse(left.createdAt)
              );
            }

            return Date.parse(right.createdAt) - Date.parse(left.createdAt);
          })
          .map((room) => clone(room));
      }
    },
    sessions: {
      async save(session) {
        sessions.set(session.tokenHash, clone(session));
      },
      async getByTokenHash(tokenHash) {
        const session = sessions.get(tokenHash);
        return session ? clone(session) : null;
      },
      async revoke(tokenHash, revokedAt) {
        const session = sessions.get(tokenHash);

        if (!session) {
          return;
        }

        sessions.set(tokenHash, {
          ...session,
          revokedAt
        });
      }
    },
    matches: {
      async saveSnapshot(snapshot) {
        snapshots.set(snapshot.sessionId, clone(snapshot));
      },
      async getSnapshot(sessionId) {
        const snapshot = snapshots.get(sessionId);
        return snapshot ? clone(snapshot) : null;
      }
    },
    streams: {
      async appendCommand(sessionId, envelope) {
        const entries = commandStreams.get(sessionId) ?? [];
        const streamId = createStreamId(entries.length);
        entries.push({
          streamId,
          value: clone(envelope)
        });
        commandStreams.set(sessionId, entries);
        return streamId;
      },
      async readCommands(sessionId, afterStreamId, count) {
        return readAfter(commandStreams.get(sessionId) ?? [], afterStreamId, count);
      },
      async appendEvent(sessionId, envelope) {
        const entries = eventStreams.get(sessionId) ?? [];
        const streamId = createStreamId(entries.length);
        entries.push({
          streamId,
          value: clone(envelope)
        });
        eventStreams.set(sessionId, entries);
        return streamId;
      },
      async readEvents(sessionId, afterStreamId, count) {
        return readAfter(eventStreams.get(sessionId) ?? [], afterStreamId, count);
      }
    }
  };
}

export type {
  CommandEnvelope,
  EventEnvelope,
  MatchSnapshotRecord,
  PlayerSessionRecord,
  RoomRecord,
  RuntimeStore,
  StreamEntry
} from "./ports.ts";
