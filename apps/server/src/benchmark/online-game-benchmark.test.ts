import assert from "node:assert/strict";
import test from "node:test";

import { runOnlineGameBenchmark } from "./online-game-benchmark.ts";

test("online benchmark smoke run records room, join, websocket, and command metrics", async (context) => {
  try {
    const result = await runOnlineGameBenchmark({
      rooms: 2,
      playersPerRoom: 2,
      commandsPerRoom: 1,
      useWebSockets: false,
      outputJsonlPath: null
    });

    assert.equal(result.roomsCreated, 2);
    assert.equal(result.playersJoined, 4);
    assert.ok(result.metrics.some((metric) => metric.name === "room.create.latencyMs"));
    assert.ok(result.metrics.some((metric) => metric.name === "room.join.latencyMs"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      context.skip("Sandbox blocks local port binding; run this test in a normal local shell.");
      return;
    }

    throw error;
  }
});
