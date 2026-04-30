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
  readonly useWebSockets: boolean;
  readonly outputJsonlPath: string | null;
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
  operation: () => Promise<TValue>
): Promise<TValue> {
  const start = performance.now();
  const value = await operation();
  metrics.push(createMetric(name, performance.now() - start, "ms", tags));
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

  try {
    const hosts: RoomResponse[] = [];
    let playersJoined = 0;

    for (let roomIndex = 0; roomIndex < options.rooms; roomIndex += 1) {
      const host = await measure(
        metrics,
        "room.create.latencyMs",
        { roomIndex: String(roomIndex) },
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
        () =>
          postJson<StartedRoomResponse>(
            `${baseUrl}/api/rooms/${host.room.roomId}/start`,
            { sessionToken: host.sessionToken }
          )
      );

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

    metrics.push(createMetric("rooms.created", hosts.length, "count"));
    metrics.push(createMetric("players.joined", playersJoined, "count"));
    metrics.push(createMetric("commands.sent", commandsSent, "count"));
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
  const result = await runOnlineGameBenchmark({
    rooms: Number.parseInt(process.env.BH_BENCH_ROOMS ?? "100", 10),
    playersPerRoom: Number.parseInt(process.env.BH_BENCH_PLAYERS ?? "4", 10),
    commandsPerRoom: Number.parseInt(process.env.BH_BENCH_COMMANDS ?? "1", 10),
    useWebSockets: process.env.BH_BENCH_WEBSOCKETS === "true",
    outputJsonlPath: process.env.BH_BENCH_OUTPUT ?? null
  });

  console.log(JSON.stringify(result, null, 2));
}
