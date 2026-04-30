import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntimeStore } from "./runtime/in-memory-runtime-store.ts";
import { exportReplay } from "./replay-exporter.ts";

test("replay exporter converts runtime streams into durable external records", async () => {
  const store = createInMemoryRuntimeStore();

  await store.streams.appendCommand("session-replay", {
    commandId: "command-1",
    roomId: "room-replay",
    playerId: "player-1",
    receivedAt: "2026-04-30T00:00:00.000Z",
    payload: {
      type: "match.endTurn",
      version: 1,
      matchId: "match-replay",
      playerId: "player-1"
    }
  });
  await store.streams.appendEvent("session-replay", {
    commandId: "command-1",
    roomId: "room-replay",
    playerId: "player-1",
    processedAt: "2026-04-30T00:00:00.100Z",
    revision: 1,
    result: {
      state: {} as never,
      events: [{ type: "turnEnded" }],
      rejection: null
    }
  });

  const replay = await exportReplay({
    store,
    replayId: "replay-export-test",
    sessionId: "session-replay",
    matchId: "match-replay",
    exportedAt: "2026-04-30T00:00:01.000Z",
    initialRevision: 0
  });

  assert.deepEqual(replay, {
    format: "project-bh.replay.v1",
    version: 1,
    replayId: "replay-export-test",
    sessionId: "session-replay",
    matchId: "match-replay",
    exportedAt: "2026-04-30T00:00:01.000Z",
    initialRevision: 0,
    finalRevision: 1,
    commands: [
      {
        streamId: "1-0",
        commandId: "command-1",
        roomId: "room-replay",
        playerId: "player-1",
        receivedAt: "2026-04-30T00:00:00.000Z",
        payload: {
          type: "match.endTurn",
          version: 1,
          matchId: "match-replay",
          playerId: "player-1"
        }
      }
    ],
    events: [
      {
        streamId: "1-0",
        commandId: "command-1",
        roomId: "room-replay",
        playerId: "player-1",
        processedAt: "2026-04-30T00:00:00.100Z",
        revision: 1,
        eventTypes: ["turnEnded"],
        rejection: null
      }
    ]
  });
});
