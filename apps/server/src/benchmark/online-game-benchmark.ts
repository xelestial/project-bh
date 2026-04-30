import { appendFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { WebSocket } from "ws";

import { startHttpServer } from "../http-server.ts";
import type { ProjectedMatchSnapshot } from "../client-state-projector.ts";

export interface BenchmarkMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: "ms" | "count";
  readonly tags: Readonly<Record<string, string>>;
  readonly timestamp: string;
}

export interface OnlineGameBenchmarkOptions {
  readonly rooms: number;
  readonly playersPerRoom: number;
  readonly commandsPerRoom: number;
  readonly selectorReadsPerRoom?: number;
  readonly reconnectAttemptsPerRoom?: number;
  readonly useWebSockets: boolean;
  readonly outputJsonlPath: string | null;
  readonly metricTags?: Readonly<Record<string, string>>;
}

export interface OnlineGameBenchmarkResult {
  readonly roomsCreated: number;
  readonly playersJoined: number;
  readonly commandsSent: number;
  readonly metrics: readonly BenchmarkMetric[];
}

interface RoomResponse {
  readonly room: {
    readonly roomId: string;
    readonly inviteCode: string;
  };
  readonly playerId: string;
  readonly sessionToken: string;
}

interface StartedRoomResponse {
  readonly snapshot: ProjectedMatchSnapshot;
}

export type OnlineBenchmarkProfileId =
  | "selector-latency"
  | "reconnect-latency"
  | "multi-room-redis-stream-throughput";

export interface OnlineBenchmarkProfile {
  readonly id: OnlineBenchmarkProfileId;
  readonly description: string;
  readonly options: Omit<OnlineGameBenchmarkOptions, "outputJsonlPath">;
}

const ONLINE_BENCHMARK_PROFILES: readonly OnlineBenchmarkProfile[] = [
  {
    id: "selector-latency",
    description: "Measures repeated selector-projected room refresh latency across active rooms.",
    options: {
      rooms: 8,
      playersPerRoom: 4,
      commandsPerRoom: 1,
      selectorReadsPerRoom: 12,
      reconnectAttemptsPerRoom: 0,
      useWebSockets: false,
      metricTags: {
        profile: "selector-latency",
        focus: "selector"
      }
    }
  },
  {
    id: "reconnect-latency",
    description: "Measures authenticated room refresh latency as the reconnect recovery path.",
    options: {
      rooms: 8,
      playersPerRoom: 4,
      commandsPerRoom: 1,
      selectorReadsPerRoom: 2,
      reconnectAttemptsPerRoom: 8,
      useWebSockets: false,
      metricTags: {
        profile: "reconnect-latency",
        focus: "reconnect"
      }
    }
  },
  {
    id: "multi-room-redis-stream-throughput",
    description: "Stresses many rooms and queued commands for Redis stream throughput checks.",
    options: {
      rooms: 24,
      playersPerRoom: 4,
      commandsPerRoom: 4,
      selectorReadsPerRoom: 2,
      reconnectAttemptsPerRoom: 2,
      useWebSockets: true,
      metricTags: {
        profile: "multi-room-redis-stream-throughput",
        focus: "runtime-streams",
        runtimeStore: "redis"
      }
    }
  }
];

export function getOnlineBenchmarkProfiles(): readonly OnlineBenchmarkProfile[] {
  return ONLINE_BENCHMARK_PROFILES;
}

export function createOnlineBenchmarkOptionsFromProfile(
  profileId: OnlineBenchmarkProfileId,
  overrides: Partial<OnlineGameBenchmarkOptions> = {}
): OnlineGameBenchmarkOptions {
  const profile = ONLINE_BENCHMARK_PROFILES.find((candidate) => candidate.id === profileId);

  if (!profile) {
    throw new Error(`Unknown online benchmark profile: ${profileId}`);
  }

  return {
    ...profile.options,
    ...overrides,
    outputJsonlPath: overrides.outputJsonlPath ?? null,
    metricTags: {
      ...profile.options.metricTags,
      ...overrides.metricTags
    }
  };
}

function createMetric(
  name: string,
  value: number,
  unit: BenchmarkMetric["unit"],
  tags: Readonly<Record<string, string>> = {}
): BenchmarkMetric {
  return {
    name,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString()
  };
}

async function measure<TValue>(
  metrics: BenchmarkMetric[],
  name: string,
  tags: Readonly<Record<string, string>>,
  baseTags: Readonly<Record<string, string>>,
  operation: () => Promise<TValue>
): Promise<TValue> {
  const start = performance.now();
  const value = await operation();
  metrics.push(createMetric(name, performance.now() - start, "ms", {
    ...baseTags,
    ...tags
  }));
  return value;
}

async function postJson<TValue>(
  url: string,
  body: unknown
): Promise<TValue> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Benchmark request failed: ${response.status} ${url}`);
  }

  return (await response.json()) as TValue;
}

async function getJson<TValue>(url: string): Promise<TValue> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Benchmark request failed: ${response.status} ${url}`);
  }

  return (await response.json()) as TValue;
}

async function writeMetricsJsonl(
  outputJsonlPath: string | null,
  metrics: readonly BenchmarkMetric[]
): Promise<void> {
  if (!outputJsonlPath) {
    return;
  }

  const lines = metrics.map((metric) => JSON.stringify(metric)).join("\n");
  await appendFile(outputJsonlPath, `${lines}\n`, "utf8");
}

export async function runOnlineGameBenchmark(
  options: OnlineGameBenchmarkOptions
): Promise<OnlineGameBenchmarkResult> {
  const metrics: BenchmarkMetric[] = [];
  const server = await startHttpServer({ port: 0, host: "127.0.0.1" });
  const baseUrl = `http://${server.host}:${server.port}`;
  const sockets: WebSocket[] = [];
  const metricTags = options.metricTags ?? {};

  try {
    const hosts: RoomResponse[] = [];
    let playersJoined = 0;

    for (let roomIndex = 0; roomIndex < options.rooms; roomIndex += 1) {
      const host = await measure(
        metrics,
        "room.create.latencyMs",
        { roomIndex: String(roomIndex) },
        metricTags,
        () =>
          postJson<RoomResponse>(`${baseUrl}/api/rooms`, {
            name: `Host ${roomIndex}`,
            playerCount: options.playersPerRoom,
            roomName: `Benchmark Room ${roomIndex}`
          })
      );
      hosts.push(host);
      playersJoined += 1;

      for (let playerIndex = 1; playerIndex < options.playersPerRoom; playerIndex += 1) {
        await measure(
          metrics,
          "room.join.latencyMs",
          {
            roomIndex: String(roomIndex),
            playerIndex: String(playerIndex)
          },
          metricTags,
          () =>
            postJson<RoomResponse>(
              `${baseUrl}/api/invite/${host.room.inviteCode}/join`,
              { name: `Player ${roomIndex}-${playerIndex}` }
            )
        );
        playersJoined += 1;
      }

      if (options.useWebSockets) {
        const socket = new WebSocket(
          `ws://${server.host}:${server.port}/ws?roomId=${host.room.roomId}&sessionToken=${host.sessionToken}`
        );
        sockets.push(socket);
      }
    }

    let commandsSent = 0;

    for (const [roomIndex, host] of hosts.entries()) {
      const started = await measure(
        metrics,
        "room.start.latencyMs",
        { roomIndex: String(roomIndex) },
        metricTags,
        () =>
          postJson<StartedRoomResponse>(
            `${baseUrl}/api/rooms/${host.room.roomId}/start`,
            { sessionToken: host.sessionToken }
          )
      );

      for (let readIndex = 0; readIndex < (options.selectorReadsPerRoom ?? 0); readIndex += 1) {
        await measure(
          metrics,
          "selector.snapshot.latencyMs",
          {
            roomIndex: String(roomIndex),
            readIndex: String(readIndex)
          },
          metricTags,
          () =>
            getJson(
              `${baseUrl}/api/rooms/${host.room.roomId}?sessionToken=${encodeURIComponent(host.sessionToken)}`
            )
        );
      }

      for (let reconnectIndex = 0; reconnectIndex < (options.reconnectAttemptsPerRoom ?? 0); reconnectIndex += 1) {
        await measure(
          metrics,
          "reconnect.hydrate.latencyMs",
          {
            roomIndex: String(roomIndex),
            reconnectIndex: String(reconnectIndex)
          },
          metricTags,
          () =>
            getJson(
              `${baseUrl}/api/rooms/${host.room.roomId}?sessionToken=${encodeURIComponent(host.sessionToken)}`
            )
        );
      }

      for (let commandIndex = 0; commandIndex < options.commandsPerRoom; commandIndex += 1) {
        const offerSlot =
          started.snapshot.state.round.auction.currentOffer?.slot ?? 0;
        await measure(
          metrics,
          "command.submit.latencyMs",
          {
            roomIndex: String(roomIndex),
            commandIndex: String(commandIndex)
          },
          metricTags,
          () =>
            postJson(`${baseUrl}/api/rooms/${host.room.roomId}/commands`, {
              commandId: `benchmark-${roomIndex}-${commandIndex}`,
              sessionToken: host.sessionToken,
              type: "match.submitAuctionBids",
              version: 1,
              matchId: started.snapshot.state.matchId,
              playerId: host.playerId,
              bids: [{ offerSlot, amount: 0 }]
            })
        );
        commandsSent += 1;
      }
    }

    metrics.push(createMetric("rooms.created", hosts.length, "count", metricTags));
    metrics.push(createMetric("players.joined", playersJoined, "count", metricTags));
    metrics.push(createMetric("commands.sent", commandsSent, "count", metricTags));
    await writeMetricsJsonl(options.outputJsonlPath, metrics);

    return {
      roomsCreated: hosts.length,
      playersJoined,
      commandsSent,
      metrics
    };
  } finally {
    for (const socket of sockets) {
      socket.close();
    }

    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profileId = process.env.BH_BENCH_PROFILE as OnlineBenchmarkProfileId | undefined;
  const result = await runOnlineGameBenchmark(
    profileId
      ? createOnlineBenchmarkOptionsFromProfile(profileId, {
          outputJsonlPath: process.env.BH_BENCH_OUTPUT ?? null
        })
      : {
          rooms: Number.parseInt(process.env.BH_BENCH_ROOMS ?? "100", 10),
          playersPerRoom: Number.parseInt(process.env.BH_BENCH_PLAYERS ?? "4", 10),
          commandsPerRoom: Number.parseInt(process.env.BH_BENCH_COMMANDS ?? "1", 10),
          selectorReadsPerRoom: Number.parseInt(process.env.BH_BENCH_SELECTOR_READS ?? "0", 10),
          reconnectAttemptsPerRoom: Number.parseInt(process.env.BH_BENCH_RECONNECTS ?? "0", 10),
          useWebSockets: process.env.BH_BENCH_WEBSOCKETS === "true",
          outputJsonlPath: process.env.BH_BENCH_OUTPUT ?? null
        }
  );

  console.log(JSON.stringify(result, null, 2));
}
