import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket } from "ws";

import { startHttpServer } from "./http-server.ts";
import type { ProjectedMatchSnapshot } from "./client-state-projector.ts";

interface RoomResponse {
  readonly room: {
    readonly roomId: string;
    readonly inviteCode: string;
    readonly hostPlayerId: string;
    readonly players: readonly { readonly id: string; readonly name: string }[];
    readonly status: "lobby" | "started";
    readonly sessionId: string | null;
  };
  readonly playerId: string;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function waitForMessage<TPayload>(socket: WebSocket): Promise<TPayload> {
  return new Promise((resolve, reject) => {
    socket.once("message", (message) => {
      try {
        resolve(JSON.parse(message.toString("utf8")) as TPayload);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

function isListenPermissionError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EPERM";
}

test("http server supports room lifecycle and websocket lobby broadcast", async (context) => {
  let server;

  try {
    server = await startHttpServer({ port: 0, host: "127.0.0.1" });
  } catch (error) {
    if (isListenPermissionError(error)) {
      context.skip("Sandbox blocks local port binding; run this test in a normal local shell.");
      return;
    }

    throw error;
  }

  const baseUrl = `http://${server.host}:${server.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const createRoom = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Host",
        playerCount: 2
      })
    });
    assert.equal(createRoom.status, 201);

    const createPayload = (await createRoom.json()) as RoomResponse;
    assert.equal(createPayload.room.players.length, 1);
    assert.equal(createPayload.room.status, "lobby");
    assert.equal(createPayload.room.inviteCode.length, 6);

    const inviteLookup = await fetch(`${baseUrl}/api/invite/${createPayload.room.inviteCode}`);
    assert.equal(inviteLookup.status, 200);
    const invitePayload = (await inviteLookup.json()) as {
      readonly room: RoomResponse["room"];
    };
    assert.equal(invitePayload.room.roomId, createPayload.room.roomId);

    const socket = new WebSocket(
      `ws://${server.host}:${server.port}/ws?roomId=${createPayload.room.roomId}&playerId=${createPayload.playerId}`
    );
    const initialRoomUpdate = waitForMessage<{ type: string }>(socket);
    await waitForOpen(socket);
    await initialRoomUpdate;

    const lobbyUpdatePromise = waitForMessage<{
      readonly type: string;
      readonly room: {
        readonly players: readonly { readonly id: string; readonly name: string }[];
      };
      readonly snapshot: null;
    }>(socket);
    const joinRoom = await fetch(`${baseUrl}/api/invite/${createPayload.room.inviteCode}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Guest"
      })
    });
    assert.equal(joinRoom.status, 200);
    const joinPayload = (await joinRoom.json()) as RoomResponse;

    const lobbyUpdate = await lobbyUpdatePromise;
    assert.equal(lobbyUpdate.type, "room.updated");
    assert.equal(lobbyUpdate.room.players.length, 2);
    assert.equal(lobbyUpdate.snapshot, null);

    const startRoom = await fetch(`${baseUrl}/api/rooms/${createPayload.room.roomId}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerId: createPayload.playerId
      })
    });
    assert.equal(startRoom.status, 200);

    const startedRoom = await fetch(
      `${baseUrl}/api/rooms/${createPayload.room.roomId}?playerId=${createPayload.playerId}`
    );
    assert.equal(startedRoom.status, 200);
    const startedPayload = (await startedRoom.json()) as {
      readonly room: RoomResponse["room"];
      readonly snapshot: ProjectedMatchSnapshot | null;
    };
    assert.equal(startedPayload.room.status, "started");
    assert.ok(startedPayload.snapshot);
    assert.deepEqual(Object.keys(startedPayload.snapshot.viewer).sort(), [
      "playerId",
      "revealedTreasureCards",
      "self",
      "treasurePlacementHand",
      "turnHints"
    ]);
    assert.equal(
      "specialInventory" in startedPayload.snapshot.state.players[joinPayload.playerId]!,
      false
    );
    assert.equal(
      "availablePriorityCards" in startedPayload.snapshot.state.players[joinPayload.playerId]!,
      false
    );
    assert.equal(
      "carriedTreasureId" in startedPayload.snapshot.state.players[joinPayload.playerId]!,
      false
    );
    assert.match(Object.keys(startedPayload.snapshot.state.treasures)[0] ?? "", /^treasure-token-/);

    socket.close();
  } finally {
    await server.close();
  }
});

test("http server returns 404 for unknown rooms without crashing the process", async (context) => {
  let server;

  try {
    server = await startHttpServer({ port: 0, host: "127.0.0.1" });
  } catch (error) {
    if (isListenPermissionError(error)) {
      context.skip("Sandbox blocks local port binding; run this test in a normal local shell.");
      return;
    }

    throw error;
  }

  const baseUrl = `http://${server.host}:${server.port}`;

  try {
    const missingRoom = await fetch(`${baseUrl}/api/rooms/not-real`);
    assert.equal(missingRoom.status, 404);
    assert.deepEqual(await missingRoom.json(), { error: "Unknown room: not-real" });

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  } finally {
    await server.close();
  }
});
