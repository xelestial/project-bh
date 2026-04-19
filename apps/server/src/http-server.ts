import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";

import {
  type CreateMatchStateInput
} from "../../../packages/domain/src/index.ts";
import { queryCellActions } from "../../../packages/application/src/index.ts";
import { type PendingCellAction, validateActionQueryRequest } from "../../../packages/protocol/src/index.ts";
import { projectSnapshotForPlayer } from "./client-state-projector.ts";
import { createServerCompositionRoot, type MatchSessionSnapshot } from "./index.ts";
import { createMatchInputFromConfig } from "./match-config-creator.ts";
import { resolveHttpServerRuntimeConfig } from "./runtime-config.ts";
import { resolveClientTreasureId } from "./treasure-client-ids.ts";

type RoomStatus = "lobby" | "started";
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;

interface RoomPlayer {
  readonly id: string;
  readonly name: string;
}

interface RoomState {
  readonly roomId: string;
  readonly inviteCode: string;
  readonly hostPlayerId: string;
  readonly desiredPlayerCount: number;
  readonly players: readonly RoomPlayer[];
  readonly status: RoomStatus;
  readonly sessionId: string | null;
}

interface MutableRoom {
  roomId: string;
  inviteCode: string;
  hostPlayerId: string;
  desiredPlayerCount: number;
  players: RoomPlayer[];
  status: RoomStatus;
  sessionId: string | null;
  sockets: Map<string, Set<WebSocket>>;
}

interface CreateRoomRequest {
  readonly name: string;
  readonly playerCount: number;
}

interface JoinRoomRequest {
  readonly name: string;
}

interface StartRoomRequest {
  readonly playerId: string;
}

interface RoomActionQueryRequest {
  readonly version: 1;
  readonly playerId: string;
  readonly cell: { readonly x: number; readonly y: number };
  readonly pendingAction?: unknown;
}

function translateTreasureReferencesForCommand(
  snapshot: MatchSessionSnapshot,
  payload: unknown
): unknown {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.treasureId === "string") {
    const resolvedTreasureId = resolveClientTreasureId(snapshot, record.treasureId);

    if (resolvedTreasureId) {
      return {
        ...record,
        treasureId: resolvedTreasureId
      };
    }
  }

  if (
    record.type === "match.prepareNextRound" &&
    typeof record.treasurePlacements === "object" &&
    record.treasurePlacements !== null
  ) {
    const translatedPlacements = Object.fromEntries(
      Object.entries(record.treasurePlacements as Record<string, unknown>).flatMap(([clientTreasureId, position]) => {
        const resolvedTreasureId = resolveClientTreasureId(snapshot, clientTreasureId);
        return resolvedTreasureId ? [[resolvedTreasureId, position] as const] : [];
      })
    );

    return {
      ...record,
      treasurePlacements: translatedPlacements
    };
  }

  return payload;
}

function translateTreasureReferencesForPendingAction(
  snapshot: MatchSessionSnapshot,
  pendingAction: PendingCellAction | undefined
): PendingCellAction | undefined {
  if (
    typeof pendingAction !== "object" ||
    pendingAction === null ||
    !("kind" in pendingAction) ||
    pendingAction.kind !== "treasurePlacement" ||
    !("treasureId" in pendingAction) ||
    typeof pendingAction.treasureId !== "string"
  ) {
    return pendingAction;
  }

  const resolvedTreasureId = resolveClientTreasureId(snapshot, pendingAction.treasureId);

  if (!resolvedTreasureId) {
    return pendingAction;
  }

  return {
    ...pendingAction,
    treasureId: resolvedTreasureId
  };
}

interface StartHttpServerOptions {
  readonly port?: number;
  readonly host?: string;
}

function toRoomState(room: MutableRoom): RoomState {
  return {
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    hostPlayerId: room.hostPlayerId,
    desiredPlayerCount: room.desiredPlayerCount,
    players: room.players,
    status: room.status,
    sessionId: room.sessionId
  };
}

function buildMatchInput(room: MutableRoom): CreateMatchStateInput {
  return createMatchInputFromConfig(room.roomId, room.players);
}

async function readJson<TValue>(request: IncomingMessage): Promise<TValue> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as TValue;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as TValue;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.end(JSON.stringify(payload));
}

export async function startHttpServer(options: StartHttpServerOptions = {}) {
  const port = options.port ?? 8787;
  const host = options.host ?? "127.0.0.1";
  const engine = createServerCompositionRoot();
  const rooms = new Map<string, MutableRoom>();
  const websocketServer = new WebSocketServer({ noServer: true });

  function createInviteCode(): string {
    while (true) {
      const code = Array.from({ length: INVITE_CODE_LENGTH }, () => {
        const index = Math.floor(Math.random() * INVITE_CODE_ALPHABET.length);
        return INVITE_CODE_ALPHABET[index];
      }).join("");

      if (![...rooms.values()].some((room) => room.inviteCode === code)) {
        return code;
      }
    }
  }

  function broadcastRoom(roomId: string): void {
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    for (const [playerId, sockets] of room.sockets.entries()) {
      const payload = JSON.stringify({
        type: "room.updated",
        room: toRoomState(room),
        snapshot:
          room.sessionId ? projectSnapshotForPlayer(engine.getSnapshot(room.sessionId), playerId) : null
      });

      for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
        }
      }
    }
  }

  function assertRoom(roomId: string): MutableRoom {
    const room = rooms.get(roomId);

    if (!room) {
      throw new Error(`Unknown room: ${roomId}`);
    }

    return room;
  }

  function findRoomByInviteCode(inviteCode: string): MutableRoom | undefined {
    return [...rooms.values()].find((room) => room.inviteCode === inviteCode.toUpperCase());
  }

  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    try {
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (!request.url) {
        writeJson(response, 400, { error: "Missing URL." });
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/rooms") {
        const body = await readJson<CreateRoomRequest>(request);

        if (!body.name || !body.playerCount || body.playerCount < 2 || body.playerCount > 4) {
          writeJson(response, 400, { error: "name and playerCount(2-4) are required." });
          return;
        }

        const roomId = randomUUID().slice(0, 8);
        const hostPlayerId = randomUUID().slice(0, 8);
        const room: MutableRoom = {
          roomId,
          inviteCode: createInviteCode(),
          hostPlayerId,
          desiredPlayerCount: body.playerCount,
          players: [{ id: hostPlayerId, name: body.name }],
          status: "lobby",
          sessionId: null,
          sockets: new Map()
        };
        rooms.set(roomId, room);
        writeJson(response, 201, {
          room: toRoomState(room),
          playerId: hostPlayerId
        });
        return;
      }

      if (request.method === "GET" && /^\/api\/invite\/[^/]+$/.test(url.pathname)) {
        const inviteCode = url.pathname.split("/")[3];

        if (!inviteCode) {
          writeJson(response, 400, { error: "Missing invite code." });
          return;
        }

        const room = findRoomByInviteCode(inviteCode);

        if (!room) {
          writeJson(response, 404, { error: "Unknown invite code." });
          return;
        }

        writeJson(response, 200, {
          room: toRoomState(room)
        });
        return;
      }

    if (request.method === "POST" && /^\/api\/invite\/[^/]+\/join$/.test(url.pathname)) {
      const inviteCode = url.pathname.split("/")[3];

      if (!inviteCode) {
        writeJson(response, 400, { error: "Missing invite code." });
        return;
      }

      const room = findRoomByInviteCode(inviteCode);

      if (!room) {
        writeJson(response, 404, { error: "Unknown invite code." });
        return;
      }

      const body = await readJson<JoinRoomRequest>(request);

      if (!body.name) {
        writeJson(response, 400, { error: "name is required." });
        return;
      }

      if (room.status !== "lobby") {
        writeJson(response, 409, { error: "Room already started." });
        return;
      }

      if (room.players.length >= room.desiredPlayerCount) {
        writeJson(response, 409, { error: "Room is full." });
        return;
      }

      const playerId = randomUUID().slice(0, 8);
      room.players.push({ id: playerId, name: body.name });
      broadcastRoom(room.roomId);
      writeJson(response, 200, {
        room: toRoomState(room),
        playerId
      });
      return;
    }

    if (request.method === "POST" && /^\/api\/rooms\/[^/]+\/join$/.test(url.pathname)) {
      const roomId = url.pathname.split("/")[3];

      if (!roomId) {
        writeJson(response, 400, { error: "Missing room id." });
        return;
      }

      const room = assertRoom(roomId);
      const body = await readJson<JoinRoomRequest>(request);

      if (!body.name) {
        writeJson(response, 400, { error: "name is required." });
        return;
      }

      if (room.status !== "lobby") {
        writeJson(response, 409, { error: "Room already started." });
        return;
      }

      if (room.players.length >= room.desiredPlayerCount) {
        writeJson(response, 409, { error: "Room is full." });
        return;
      }

      const playerId = randomUUID().slice(0, 8);
      room.players.push({ id: playerId, name: body.name });
      broadcastRoom(roomId);
      writeJson(response, 200, {
        room: toRoomState(room),
        playerId
      });
      return;
    }

    if (request.method === "POST" && /^\/api\/rooms\/[^/]+\/start$/.test(url.pathname)) {
      const roomId = url.pathname.split("/")[3];

      if (!roomId) {
        writeJson(response, 400, { error: "Missing room id." });
        return;
      }

      const room = assertRoom(roomId);
      const body = await readJson<StartRoomRequest>(request);

      if (room.hostPlayerId !== body.playerId) {
        writeJson(response, 403, { error: "Only the host can start the room." });
        return;
      }

      if (room.players.length < 2) {
        writeJson(response, 409, { error: "At least two players are required." });
        return;
      }

      if (room.status !== "lobby") {
        writeJson(response, 409, { error: "Room already started." });
        return;
      }

      const nextSessionId = `session-${room.roomId}`;
      let matchInput: CreateMatchStateInput;

      try {
        matchInput = buildMatchInput(room);
        engine.createSession(nextSessionId, matchInput);
      } catch (error) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : "Unable to start the room."
        });
        return;
      }

      room.status = "started";
      room.sessionId = nextSessionId;
      broadcastRoom(roomId);
      writeJson(response, 200, {
        room: toRoomState(room),
        snapshot: projectSnapshotForPlayer(engine.getSnapshot(room.sessionId), body.playerId)
      });
      return;
    }

    if (request.method === "GET" && /^\/api\/rooms\/[^/]+$/.test(url.pathname)) {
      const roomId = url.pathname.split("/")[3];

      if (!roomId) {
        writeJson(response, 400, { error: "Missing room id." });
        return;
      }

      const room = assertRoom(roomId);
      const viewerPlayerId = url.searchParams.get("playerId");
      writeJson(response, 200, {
        room: toRoomState(room),
        snapshot:
          room.sessionId && viewerPlayerId
            ? projectSnapshotForPlayer(engine.getSnapshot(room.sessionId), viewerPlayerId)
            : null
      });
      return;
    }

    if (request.method === "POST" && /^\/api\/rooms\/[^/]+\/actions\/query$/.test(url.pathname)) {
      const roomId = url.pathname.split("/")[3];

      if (!roomId) {
        writeJson(response, 400, { error: "Missing room id." });
        return;
      }

      const room = assertRoom(roomId);

      if (!room.sessionId) {
        writeJson(response, 409, { error: "Room has not started." });
        return;
      }

      const payload = await readJson<RoomActionQueryRequest>(request);
      const validation = validateActionQueryRequest(payload);

      if (!validation.ok) {
        writeJson(response, 400, { error: validation.message });
        return;
      }

      const snapshot = engine.getSnapshot(room.sessionId);
      const actions = queryCellActions(
        snapshot.state,
        validation.value.playerId,
        validation.value.cell,
        translateTreasureReferencesForPendingAction(snapshot, validation.value.pendingAction)
      );

      writeJson(response, 200, {
        actions
      });
      return;
    }

      if (request.method === "POST" && /^\/api\/rooms\/[^/]+\/commands$/.test(url.pathname)) {
        const roomId = url.pathname.split("/")[3];

      if (!roomId) {
        writeJson(response, 400, { error: "Missing room id." });
        return;
      }

      const room = assertRoom(roomId);

      if (!room.sessionId) {
        writeJson(response, 409, { error: "Room has not started." });
        return;
      }

      const payload = await readJson<unknown>(request);
      const snapshot = engine.getSnapshot(room.sessionId);
      const translatedPayload = translateTreasureReferencesForCommand(snapshot, payload);
      const result = engine.dispatchRawCommand(room.sessionId, translatedPayload);
      broadcastRoom(roomId);
      const viewerPlayerId =
        typeof translatedPayload === "object" &&
        translatedPayload !== null &&
        "playerId" in translatedPayload &&
        typeof translatedPayload.playerId === "string"
          ? translatedPayload.playerId
          : null;
      writeJson(response, 200, {
        ...result,
        snapshot:
          viewerPlayerId !== null
            ? projectSnapshotForPlayer(engine.getSnapshot(room.sessionId), viewerPlayerId)
            : null
        });
        return;
      }

      writeJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown room:")) {
        writeJson(response, 404, { error: error.message });
        return;
      }

      throw error;
    }
  });

  websocketServer.on("connection", (socket: WebSocket, _request: IncomingMessage, connectionContext: unknown) => {
    const { roomId, playerId } = connectionContext as {
      roomId: string;
      playerId: string;
    };
    const room = rooms.get(roomId);

    if (!room) {
      socket.close();
      return;
    }

    const sockets = room.sockets.get(playerId) ?? new Set<WebSocket>();
    sockets.add(socket);
    room.sockets.set(playerId, sockets);
    broadcastRoom(roomId);

    socket.on("close", () => {
      const current = room.sockets.get(playerId);

      if (!current) {
        return;
      }

      current.delete(socket);

      if (current.size === 0) {
        room.sockets.delete(playerId);
      }
    });
  });

  server.on("upgrade", (request, socket, head) => {
    if (!request.url) {
      socket.destroy();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const roomId = url.searchParams.get("roomId");
    const playerId = url.searchParams.get("playerId");

    if (!roomId || !playerId || !rooms.has(roomId)) {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request, {
        roomId,
        playerId
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve HTTP server address.");
  }

  return {
    port: address.port,
    host,
    close: async () => {
      for (const room of rooms.values()) {
        for (const sockets of room.sockets.values()) {
          for (const socket of sockets) {
            socket.terminate();
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        websocketServer.close((websocketError) => {
          if (websocketError) {
            reject(websocketError);
            return;
          }

          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }

            resolve();
          });
        });
      });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port, host } = resolveHttpServerRuntimeConfig();
  const server = await startHttpServer({ port, host });
  console.log(`Project.BH server listening on http://${server.host}:${server.port}`);
}
