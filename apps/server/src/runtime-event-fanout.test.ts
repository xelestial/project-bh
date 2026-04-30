import assert from "node:assert/strict";
import test from "node:test";

import type { EventEnvelope } from "./runtime/ports.ts";
import { createInMemoryRuntimeStore } from "./runtime/in-memory-runtime-store.ts";
import { createRuntimeEventFanout } from "./runtime-event-fanout.ts";

function createEvent(commandId: string, revision: number): EventEnvelope {
  return {
    commandId,
    roomId: "room-fanout",
    playerId: "p1",
    processedAt: "2026-04-30T00:00:00.000Z",
    revision,
    result: {
      state: {} as EventEnvelope["result"]["state"],
      events: [],
      rejection: null
    }
  };
}

test("runtime event fanout resumes event cursor across backend instances", async () => {
  const store = createInMemoryRuntimeStore();
  const delivered: EventEnvelope[] = [];

  await store.streams.appendEvent("session-fanout", createEvent("command-1", 1));
  await store.streams.appendEvent("session-fanout", createEvent("command-2", 2));

  const firstBackend = createRuntimeEventFanout({
    store,
    sessionId: "session-fanout",
    consumerName: "backend-a",
    onEvent: (event) => {
      delivered.push(event);
    }
  });

  assert.equal(await firstBackend.poll(), 2);
  assert.deepEqual(
    delivered.map((event) => event.commandId),
    ["command-1", "command-2"]
  );

  await store.streams.appendEvent("session-fanout", createEvent("command-3", 3));

  const restartedBackend = createRuntimeEventFanout({
    store,
    sessionId: "session-fanout",
    consumerName: "backend-a",
    onEvent: (event) => {
      delivered.push(event);
    }
  });

  assert.equal(await restartedBackend.poll(), 1);
  assert.deepEqual(
    delivered.map((event) => event.commandId),
    ["command-1", "command-2", "command-3"]
  );
});
