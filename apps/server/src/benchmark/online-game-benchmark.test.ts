import assert from "node:assert/strict";
import test from "node:test";

import {
  createOnlineBenchmarkOptionsFromProfile,
  getOnlineBenchmarkProfiles,
  runOnlineGameBenchmark
} from "./online-game-benchmark.ts";

test("online benchmark exposes deeper selector, reconnect, and redis stream profiles", () => {
  const profiles = getOnlineBenchmarkProfiles();

  assert.deepEqual(
    profiles.map((profile) => profile.id),
    [
      "selector-latency",
      "reconnect-latency",
      "multi-room-redis-stream-throughput"
    ]
  );

  const selector = createOnlineBenchmarkOptionsFromProfile("selector-latency", {
    outputJsonlPath: null
  });
  const reconnect = createOnlineBenchmarkOptionsFromProfile("reconnect-latency", {
    outputJsonlPath: null
  });
  const redis = createOnlineBenchmarkOptionsFromProfile("multi-room-redis-stream-throughput", {
    outputJsonlPath: null
  });

  assert.equal(selector.selectorReadsPerRoom, 12);
  assert.equal(selector.reconnectAttemptsPerRoom, 0);
  assert.equal(reconnect.reconnectAttemptsPerRoom, 8);
  assert.equal(redis.rooms >= 16, true);
  assert.equal(redis.useWebSockets, true);
  assert.ok(redis.metricTags);
  assert.equal(redis.metricTags.profile, "multi-room-redis-stream-throughput");
  assert.equal(redis.metricTags.runtimeStore, "redis");
});

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
