import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";
import { createClient } from "redis";

import {
  createMatchState,
  type CreateMatchStateInput
} from "../../../packages/domain/src/index.ts";
import { queryCellActions } from "../../../packages/application/src/index.ts";
import {
  type PendingCellAction,
  validateActionQueryRequest,
  validateMatchCommand
} from "../../../packages/protocol/src/index.ts";
import { projectSnapshotForPlayer } from "./client-state-projector.ts";
import { type MatchSessionSnapshot } from "./index.ts";
import { createEngineWorker } from "./engine-worker.ts";
import { createMatchInputFromConfig } from "./match-config-creator.ts";
import { resolveHttpServerRuntimeConfig } from "./runtime-config.ts";
import { createInMemoryRuntimeStore } from "./runtime/in-memory-runtime-store.ts";
import { createRedisRuntimeStore } from "./runtime/redis-runtime-store.ts";
import type {
  CommandEnvelope,
  MatchSnapshotRecord,
  RoomRecord,
  RuntimeStore
} from "./runtime/ports.ts";
import {
  createSessionToken,
  hashSessionToken
} from "./security/session-token.ts";
import { resolveClientTreasureId } from "./treasure-client-ids.ts";

type RoomStatus = "lobby" | "started";
type RoomVisibility = "public" | "private";
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;

interface RoomPlayer {
  readonly id: string;
  readonly name: string;
}

interface RoomPlayerSession {
  readonly playerId: string;
  readonly tokenHash: string;
}

interface RoomState {
  readonly roomId: string;
  readonly inviteCode: string;
  readonly roomName: string;
  readonly visibility: RoomVisibility;
  readonly hostPlayerId: string;
  readonly desiredPlayerCount: number;
  readonly players: readonly RoomPlayer[];
  readonly status: RoomStatus;
  readonly sessionId: string | null;
}

interface MutableRoom {
  roomId: string;
  inviteCode: string;
  roomName: string;
  visibility: RoomVisibility;
  hostPlayerId: string;
  desiredPlayerCount: number;
  createdAt: string;
  players: RoomPlayer[];
  status: RoomStatus;
  sessionId: string | null;
  sockets: Map<string, Set<WebSocket>>;
  playerSessions: Map<string, RoomPlayerSession>;
}

interface PublicRoomSummary {
  readonly roomId: string;
  readonly inviteCode: string;
  readonly roomName: string;
  readonly hostPlayerName: string;
  readonly playerCount: number;
  readonly desiredPlayerCount: number;
  readonly hasSeat: boolean;
  readonly createdAt: string;
}

interface CreateRoomRequest {
  readonly name: string;
  readonly playerCount: number;
  readonly roomName?: string;
  readonly visibility?: RoomVisibility;
}

interface JoinRoomRequest {
  readonly name: string;
}

interface StartRoomRequest {
  readonly sessionToken: string;
}

interface RoomActionQueryRequest {
  readonly version: 1;
  readonly sessionToken: string;
  readonly cell: { readonly x: number; readonly y: number };
  readonly pendingAction?: unknown;
}

interface CreateOrJoinRoomResponse {
  readonly room: RoomState;
  readonly playerId: string;
  readonly sessionToken: string;
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
  readonly runtimeStore?: RuntimeStore;
  readonly sessionTokenSecret?: string;
}

function toRoomState(room: MutableRoom): RoomState {
  return {
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    roomName: room.roomName,
    visibility: room.visibility,
    hostPlayerId: room.hostPlayerId,
    desiredPlayerCount: room.desiredPlayerCount,
    players: room.players,
    status: room.status,
    sessionId: room.sessionId
  };
}

function toRoomRecord(room: MutableRoom): RoomRecord {
  return {
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    roomName: room.roomName,
    visibility: room.visibility,
    hostPlayerId: room.hostPlayerId,
    desiredPlayerCount: room.desiredPlayerCount,
    createdAt: room.createdAt,
    players: room.players,
    status: room.status,
    sessionId: room.sessionId
  };
}

function toMatchSessionSnapshot(record: MatchSnapshotRecord): MatchSessionSnapshot {
  return {
    sessionId: record.sessionId,
    state: record.state,
    logLength: record.logLength
  };
}

function buildMatchInput(room: MutableRoom): CreateMatchStateInput {
  return createMatchInputFromConfig(room.roomId, room.players);
}

function createPlayerSession(
  playerId: string,
  sessionTokenSecret: string
): RoomPlayerSession & { readonly sessionToken: string } {
  const sessionToken = createSessionToken();

  return {
    playerId,
    sessionToken,
    tokenHash: hashSessionToken(sessionToken, sessionTokenSecret)
  };
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
  const runtimeStore = options.runtimeStore ?? createInMemoryRuntimeStore();
  const engineWorker = createEngineWorker({ store: runtimeStore });
  const sessionTokenSecret = options.sessionTokenSecret ?? "project-bh-local-session-secret";
  const rooms = new Map<string, MutableRoom>();
  const websocketServer = new WebSocketServer({ noServer: true });

  function listJoinableRooms(
    options: { readonly sort?: "recent" | "players"; readonly hasSeatOnly?: boolean } = {}
  ): readonly PublicRoomSummary[] {
    const sort = options.sort ?? "recent";
    const hasSeatOnly = options.hasSeatOnly ?? true;

    return [...rooms.values()]
      .filter(
        (room) =>
          room.visibility === "public" &&
          room.status === "lobby" &&
          (!hasSeatOnly || room.players.length < room.desiredPlayerCount)
      )
      .sort((left, right) => {
        if (sort === "players") {
          return (
            right.players.length - left.players.length ||
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
          );
        }

        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      })
      .map((room) => ({
        roomId: room.roomId,
        inviteCode: room.inviteCode,
        roomName: room.roomName,
        hostPlayerName: room.players.find((player) => player.id === room.hostPlayerId)?.name ?? "Host",
        playerCount: room.players.length,
        desiredPlayerCount: room.desiredPlayerCount,
        hasSeat: room.players.length < room.desiredPlayerCount,
        createdAt: room.createdAt
      }));
  }

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

  async function saveRoom(room: MutableRoom): Promise<void> {
    await runtimeStore.rooms.save(toRoomRecord(room));
  }

  async function savePlayerSession(
    room: MutableRoom,
    session: RoomPlayerSession
  ): Promise<void> {
    await runtimeStore.sessions.save({
      tokenHash: session.tokenHash,
      roomId: room.roomId,
      playerId: session.playerId,
      clientInstanceId: session.playerId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      revokedAt: null
    });
  }

  async function getMatchSnapshot(sessionId: string): Promise<MatchSessionSnapshot> {
    const snapshot = await runtimeStore.matches.getSnapshot(sessionId);

    if (!snapshot) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    return toMatchSessionSnapshot(snapshot);
  }

  async function broadcastRoom(roomId: string): Promise<void> {
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    for (const [playerId, sockets] of room.sockets.entries()) {
      const snapshot = room.sessionId ? await getMatchSnapshot(room.sessionId) : null;
      const payload = JSON.stringify({
        type: "room.updated",
        room: toRoomState(room),
        snapshot: snapshot ? projectSnapshotForPlayer(snapshot, playerId) : null
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

  function resolvePlayerSession(room: MutableRoom, sessionToken: string | null): RoomPlayerSession | null {
    if (!sessionToken) {
      return null;
    }

    return room.playerSessions.get(hashSessionToken(sessionToken, sessionTokenSecret)) ?? null;
  }

  function assertPlayerSession(room: MutableRoom, sessionToken: string | null): RoomPlayerSession {
    const playerSession = resolvePlayerSession(room, sessionToken);

    if (!playerSession) {
      throw new Error("Invalid player session.");
    }

    return playerSession;
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

        if (body.visibility && body.visibility !== "public" && body.visibility !== "private") {
          writeJson(response, 400, { error: "visibility must be public or private." });
          return;
        }

        const roomId = randomUUID().slice(0, 8);
        const hostPlayerId = randomUUID().slice(0, 8);
        const hostPlayerSession = createPlayerSession(hostPlayerId, sessionTokenSecret);
        const roomName = body.roomName?.trim() ? body.roomName.trim() : `${body.name.trim()}'s party`;
        const room: MutableRoom = {
          roomId,
          inviteCode: createInviteCode(),
          roomName,
          visibility: body.visibility ?? "public",
          hostPlayerId,
          desiredPlayerCount: body.playerCount,
          createdAt: new Date().toISOString(),
          players: [{ id: hostPlayerId, name: body.name }],
          status: "lobby",
          sessionId: null,
          sockets: new Map(),
          playerSessions: new Map([[hostPlayerSession.tokenHash, hostPlayerSession]])
        };
        rooms.set(roomId, room);
        await saveRoom(room);
        await savePlayerSession(room, hostPlayerSession);
        writeJson(response, 201, {
          room: toRoomState(room),
          playerId: hostPlayerId,
          sessionToken: hostPlayerSession.sessionToken
        } satisfies CreateOrJoinRoomResponse);
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

      if (request.method === "GET" && url.pathname === "/api/rooms") {
        const sort = url.searchParams.get("sort") === "players" ? "players" : "recent";
        const hasSeatOnly = url.searchParams.get("hasSeat") !== "false";
        writeJson(response, 200, {
          rooms: listJoinableRooms({ sort, hasSeatOnly })
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
      const playerSession = createPlayerSession(playerId, sessionTokenSecret);
      room.players.push({ id: playerId, name: body.name });
      room.playerSessions.set(playerSession.tokenHash, playerSession);
      await saveRoom(room);
      await savePlayerSession(room, playerSession);
      await broadcastRoom(room.roomId);
      writeJson(response, 200, {
        room: toRoomState(room),
        playerId,
        sessionToken: playerSession.sessionToken
      } satisfies CreateOrJoinRoomResponse);
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
      const playerSession = createPlayerSession(playerId, sessionTokenSecret);
      room.players.push({ id: playerId, name: body.name });
      room.playerSessions.set(playerSession.tokenHash, playerSession);
      await saveRoom(room);
      await savePlayerSession(room, playerSession);
      await broadcastRoom(roomId);
      writeJson(response, 200, {
        room: toRoomState(room),
        playerId,
        sessionToken: playerSession.sessionToken
      } satisfies CreateOrJoinRoomResponse);
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

      const playerSession = assertPlayerSession(room, body.sessionToken);

      if (room.hostPlayerId !== playerSession.playerId) {
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
        await runtimeStore.matches.saveSnapshot({
          sessionId: nextSessionId,
          state: createMatchState(matchInput),
          logLength: 0,
          revision: 0
        });
      } catch (error) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : "Unable to start the room."
        });
        return;
      }

      room.status = "started";
      room.sessionId = nextSessionId;
      await saveRoom(room);
      await broadcastRoom(roomId);
      writeJson(response, 200, {
        room: toRoomState(room),
        snapshot: projectSnapshotForPlayer(
          await getMatchSnapshot(room.sessionId),
          playerSession.playerId
        )
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
      const playerSession = resolvePlayerSession(room, url.searchParams.get("sessionToken"));

      if (url.searchParams.has("sessionToken") && !playerSession) {
        writeJson(response, 403, { error: "Invalid player session." });
        return;
      }

      writeJson(response, 200, {
        room: toRoomState(room),
        snapshot:
          room.sessionId && playerSession
            ? projectSnapshotForPlayer(
                await getMatchSnapshot(room.sessionId),
                playerSession.playerId
              )
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

      const snapshot = await getMatchSnapshot(room.sessionId);
      const playerSession = assertPlayerSession(room, validation.value.sessionToken);
      const actions = queryCellActions(
        snapshot.state,
        playerSession.playerId,
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
      const snapshot = await getMatchSnapshot(room.sessionId);
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("sessionToken" in payload) ||
        typeof payload.sessionToken !== "string"
      ) {
        writeJson(response, 400, { error: "sessionToken is required." });
        return;
      }

      const playerSession = assertPlayerSession(room, payload.sessionToken);
      const translatedPayload = translateTreasureReferencesForCommand(snapshot, payload);
      const authoritativePayload =
        typeof translatedPayload === "object" && translatedPayload !== null
          ? {
              ...translatedPayload,
              playerId: playerSession.playerId
            }
          : translatedPayload;
      const validation = validateMatchCommand(authoritativePayload);

      if (!validation.ok) {
        writeJson(response, 200, {
          state: snapshot.state,
          events: [],
          rejection: {
            code: "PROTOCOL_VALIDATION_FAILED",
            message: validation.message
          },
          snapshot: projectSnapshotForPlayer(snapshot, playerSession.playerId)
        });
        return;
      }

      const commandEnvelope: CommandEnvelope = {
        commandId:
          "commandId" in payload && typeof payload.commandId === "string"
            ? payload.commandId
            : randomUUID(),
        roomId,
        playerId: playerSession.playerId,
        receivedAt: new Date().toISOString(),
        payload: validation.value
      };
      await runtimeStore.streams.appendCommand(room.sessionId, commandEnvelope);
      const event = await engineWorker.processCommandEnvelope(
        room.sessionId,
        commandEnvelope
      );
      const nextSnapshot = await getMatchSnapshot(room.sessionId);
      await broadcastRoom(roomId);
      writeJson(response, 200, {
        ...event.result,
        snapshot: projectSnapshotForPlayer(nextSnapshot, playerSession.playerId)
        });
        return;
      }

      writeJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown room:")) {
        writeJson(response, 404, { error: error.message });
        return;
      }

      if (error instanceof Error && error.message === "Invalid player session.") {
        writeJson(response, 403, { error: error.message });
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
    void broadcastRoom(roomId);

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
    const sessionToken = url.searchParams.get("sessionToken");

    if (!roomId || !sessionToken || !rooms.has(roomId)) {
      socket.destroy();
      return;
    }

    const room = rooms.get(roomId);
    const playerSession = room ? resolvePlayerSession(room, sessionToken) : null;

    if (!room || !playerSession) {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request, {
        roomId,
        playerId: playerSession.playerId
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
  const config = resolveHttpServerRuntimeConfig();
  const redisClient =
    config.runtimeStore === "redis"
      ? createClient({ url: config.redisUrl! })
      : null;

  if (redisClient) {
    await redisClient.connect();
  }

  const server = await startHttpServer({
    port: config.port,
    host: config.host,
    ...(redisClient
      ? { runtimeStore: createRedisRuntimeStore({ client: redisClient }) }
      : {}),
    sessionTokenSecret: config.sessionTokenSecret
  });
  console.log(`Project.BH server listening on http://${server.host}:${server.port}`);
}
