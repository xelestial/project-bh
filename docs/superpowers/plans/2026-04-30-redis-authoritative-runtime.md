# Redis Authoritative Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Project. BH from process-local multiplayer state to a Redis-backed authoritative runtime with selector-only frontend payloads, backend/engine Redis communication, realistic online-game benchmarks, and hardened player session security.

**Architecture:** Preserve the existing domain/application/protocol boundaries. Add Redis as infrastructure behind explicit ports, split command application into an engine worker, and expose frontend data only through versioned protocol-validated selectors.

**Tech Stack:** TypeScript strict mode, Node test runner, Redis, Redis Streams, `ws`, existing `packages/domain`, `packages/application`, `packages/protocol`, and server-local runtime infrastructure adapters under `apps/server/src/runtime`.

---

## File Structure

Create or modify these files:

- Create: `packages/protocol/src/selector-schema.ts`
  - Versioned selector ids, selector output validation, and exact frontend payload schemas.
- Modify: `packages/protocol/src/index.ts`
  - Export selector schemas.
- Create: `packages/protocol/src/selector-schema.test.ts`
  - Selector payload validation and hidden-field rejection tests.
- Create: `apps/server/src/selectors/selector-registry.ts`
  - Registry that maps selector ids to projection functions.
- Create: `apps/server/src/selectors/selector-registry.test.ts`
  - Tests for public/viewer selector visibility and exact field output.
- Modify: `apps/server/src/client-state-projector.ts`
  - Refactor current projection to compose registered selectors.
- Create: `apps/server/src/security/session-token.ts`
  - High-entropy token generation, keyed token hashing, constant-time token comparison helpers.
- Create: `apps/server/src/security/session-token.test.ts`
  - Token entropy, no plaintext persistence, hash verification, and redaction tests.
- Create: `apps/server/src/runtime/ports.ts`
  - Repository, stream, clock, id generator, logger, and rate limiter interfaces.
- Create: `apps/server/src/runtime/in-memory-runtime-store.ts`
  - Test-friendly in-memory implementation of the runtime ports.
- Create: `apps/server/src/runtime/redis-runtime-store.ts`
  - Redis-backed implementation of room/session/snapshot repositories and stream operations.
- Create: `apps/server/src/runtime/runtime-store.test.ts`
  - Shared contract tests that run against in-memory implementation.
- Create: `apps/server/src/runtime/redis-runtime-store.integration.test.ts`
  - Optional Redis integration tests gated by `REDIS_URL`.
- Create: `apps/server/src/engine-worker.ts`
  - Engine worker that consumes command stream entries, applies `handleMatchCommand`, writes snapshots/events, and records idempotency.
- Create: `apps/server/src/engine-worker.test.ts`
  - Engine worker command application, rejection, idempotency, and event stream tests.
- Modify: `apps/server/src/index.ts`
  - Convert composition root from direct `Map` ownership to runtime store ports.
- Modify: `apps/server/src/http-server.ts`
  - Use runtime store, secure sessions, queued command envelopes, selector bundles, rate limits, and Redis/in-memory runtime configuration.
- Modify: `apps/server/src/http-server.test.ts`
  - Preserve current lifecycle tests and add token replay/selector boundary tests.
- Create: `apps/server/src/benchmark/online-game-benchmark.ts`
  - Programmatic load harness for rooms, players, sockets, commands, reconnects, and selector snapshots.
- Create: `apps/server/src/benchmark/online-game-benchmark.test.ts`
  - Small benchmark smoke test against in-memory runtime.
- Modify: `apps/server/package.json`
  - Add benchmark script.
- Modify: `package.json`
  - Add top-level benchmark script.
- Modify: `docs/architecture/overview.md`
  - Document Redis-backed backend/engine split.
- Modify: `docs/networking/protocol.md`
  - Document selector contracts, command envelopes, and session token policy.
- Modify: `docs/testing/test-strategy.md`
  - Document Redis, engine worker, security, selector, and benchmark tests.
- Modify: `docs/migration/unity-parity.md`
  - Document why selector/protocol contracts preserve Unity migration.

## Task 1: Add Selector Protocol Schemas

**Files:**
- Create: `packages/protocol/src/selector-schema.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/selector-schema.test.ts`

- [ ] **Step 1: Write failing selector schema tests**

Create `packages/protocol/src/selector-schema.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  validateSelectorEnvelope
} from "./selector-schema.ts";

test("selector envelope accepts an exact match snapshot bundle", () => {
  const result = validateSelectorEnvelope({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    version: 1,
    revision: 7,
    payload: {
      sessionId: "session-room-1",
      logLength: 6,
      state: {
        matchId: "match-1",
        players: {},
        board: { width: 20, height: 20, cells: [] },
        round: { roundNumber: 1, phase: "priority", activePlayerId: null },
        completed: false
      },
      viewer: {
        playerId: "player-1",
        self: {},
        turnHints: {}
      }
    }
  });

  assert.equal(result.ok, true);
});

test("selector envelope rejects extra top-level fields", () => {
  const result = validateSelectorEnvelope({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    version: 1,
    revision: 7,
    payload: {},
    leakedMatchState: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown selector envelope field/);
});

test("selector envelope rejects unknown selectors", () => {
  const result = validateSelectorEnvelope({
    selectorId: "match.rawState.v1",
    version: 1,
    revision: 1,
    payload: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown selector/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm test -- packages/protocol/src/selector-schema.test.ts
```

Expected: failure because `selector-schema.ts` does not exist.

- [ ] **Step 3: Implement selector schema module**

Create `packages/protocol/src/selector-schema.ts`:

```ts
export const MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID = "match.snapshotBundle.v1";

export type SelectorId = typeof MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID;

export interface SelectorEnvelope<TPayload = unknown> {
  readonly selectorId: SelectorId;
  readonly version: 1;
  readonly revision: number;
  readonly payload: TPayload;
}

export interface ValidationFailure {
  readonly ok: false;
  readonly message: string;
}

export interface ValidationSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

export type ValidationResult<TValue> = ValidationFailure | ValidationSuccess<TValue>;

const SELECTOR_IDS = new Set<string>([MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID]);
const ENVELOPE_FIELDS = new Set(["selectorId", "version", "revision", "payload"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSelectorEnvelope(value: unknown): ValidationResult<SelectorEnvelope> {
  if (!isRecord(value)) {
    return { ok: false, message: "Selector envelope must be an object." };
  }

  for (const key of Object.keys(value)) {
    if (!ENVELOPE_FIELDS.has(key)) {
      return { ok: false, message: `Unknown selector envelope field: ${key}` };
    }
  }

  if (typeof value.selectorId !== "string" || !SELECTOR_IDS.has(value.selectorId)) {
    return { ok: false, message: `Unknown selector: ${String(value.selectorId)}` };
  }

  if (value.version !== 1) {
    return { ok: false, message: "Selector envelope version must be 1." };
  }

  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0) {
    return { ok: false, message: "Selector envelope revision must be a non-negative integer." };
  }

  if (!("payload" in value)) {
    return { ok: false, message: "Selector envelope payload is required." };
  }

  return {
    ok: true,
    value: {
      selectorId: value.selectorId as SelectorId,
      version: 1,
      revision: value.revision,
      payload: value.payload
    }
  };
}
```

- [ ] **Step 4: Export selector schemas**

Modify `packages/protocol/src/index.ts`:

```ts
export * from "./action-query-schema.ts";
export * from "./match-command-schema.ts";
export * from "./selector-schema.ts";
```

- [ ] **Step 5: Run selector schema tests**

Run:

```bash
pnpm test -- packages/protocol/src/selector-schema.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/selector-schema.ts packages/protocol/src/selector-schema.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add selector envelope schema"
```

## Task 2: Refactor Player Projection Into Selector Registry

**Files:**
- Create: `apps/server/src/selectors/selector-registry.ts`
- Create: `apps/server/src/selectors/selector-registry.test.ts`
- Modify: `apps/server/src/client-state-projector.ts`

- [ ] **Step 1: Write selector registry tests**

Create `apps/server/src/selectors/selector-registry.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../../packages/domain/src/index.ts";
import {
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  validateSelectorEnvelope
} from "../../../../packages/protocol/src/index.ts";
import { selectForViewer } from "./selector-registry.ts";

test("snapshot bundle selector omits private fields from public player entries", () => {
  const state = createMatchState({
    matchId: "match-selector-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  const envelope = selectForViewer({
    selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
    revision: 1,
    snapshot: {
      sessionId: "session-selector-test",
      state,
      logLength: 0
    },
    viewerPlayerId: "p1"
  });

  const validation = validateSelectorEnvelope(envelope);
  assert.equal(validation.ok, true);

  const payload = envelope.payload as {
    readonly state: {
      readonly players: Record<string, Record<string, unknown>>;
    };
    readonly viewer: {
      readonly playerId: string;
      readonly self: Record<string, unknown>;
    };
  };

  assert.equal(payload.viewer.playerId, "p1");
  assert.equal("availablePriorityCards" in payload.state.players.p2!, false);
  assert.equal("specialInventory" in payload.state.players.p2!, false);
  assert.equal("carriedTreasureId" in payload.state.players.p2!, false);
  assert.equal("availablePriorityCards" in payload.viewer.self, true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm test -- apps/server/src/selectors/selector-registry.test.ts
```

Expected: failure because `selector-registry.ts` does not exist.

- [ ] **Step 3: Implement selector registry by wrapping existing projector**

Create `apps/server/src/selectors/selector-registry.ts`:

```ts
import {
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  type SelectorEnvelope,
  type SelectorId
} from "../../../../packages/protocol/src/index.ts";
import {
  projectSnapshotForPlayer,
  type ProjectedMatchSnapshot
} from "../client-state-projector.ts";
import type { MatchSessionSnapshot } from "../index.ts";

export interface ViewerSelectorRequest {
  readonly selectorId: SelectorId;
  readonly revision: number;
  readonly snapshot: MatchSessionSnapshot;
  readonly viewerPlayerId: string;
}

export function selectForViewer(
  request: ViewerSelectorRequest
): SelectorEnvelope<ProjectedMatchSnapshot> {
  switch (request.selectorId) {
    case MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID:
      return {
        selectorId: MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
        version: 1,
        revision: request.revision,
        payload: projectSnapshotForPlayer(request.snapshot, request.viewerPlayerId)
      };
  }
}
```

- [ ] **Step 4: Preserve existing projector export**

Keep `apps/server/src/client-state-projector.ts` behavior unchanged in this task. The registry composes it so this patch is low risk.

- [ ] **Step 5: Run selector and projector tests**

Run:

```bash
pnpm test -- apps/server/src/selectors/selector-registry.test.ts apps/server/src/client-state-projector.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/selectors/selector-registry.ts apps/server/src/selectors/selector-registry.test.ts
git commit -m "feat(server): add selector registry"
```

## Task 3: Add Secure Session Token Utilities

**Files:**
- Create: `apps/server/src/security/session-token.ts`
- Create: `apps/server/src/security/session-token.test.ts`

- [ ] **Step 1: Write security utility tests**

Create `apps/server/src/security/session-token.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  hashSessionToken,
  redactSessionToken,
  verifySessionTokenHash
} from "./session-token.ts";

test("createSessionToken returns high-entropy base64url tokens", () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
});

test("hashSessionToken verifies without exposing plaintext", () => {
  const token = createSessionToken();
  const secret = "test-secret";
  const hash = hashSessionToken(token, secret);

  assert.notEqual(hash, token);
  assert.equal(hash.includes(token), false);
  assert.equal(verifySessionTokenHash(token, secret, hash), true);
  assert.equal(verifySessionTokenHash(`${token}x`, secret, hash), false);
});

test("redactSessionToken keeps logs token-safe", () => {
  assert.equal(redactSessionToken("abcdef1234567890"), "abcd...7890");
  assert.equal(redactSessionToken("short"), "[redacted]");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm test -- apps/server/src/security/session-token.test.ts
```

Expected: failure because `session-token.ts` does not exist.

- [ ] **Step 3: Implement session token helpers**

Create `apps/server/src/security/session-token.ts`:

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function createSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("base64url");
}

export function verifySessionTokenHash(
  token: string,
  secret: string,
  expectedHash: string
): boolean {
  const actualHash = hashSessionToken(token, secret);
  const actual = Buffer.from(actualHash, "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function redactSessionToken(token: string): string {
  if (token.length < 12) {
    return "[redacted]";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
```

- [ ] **Step 4: Run security tests**

Run:

```bash
pnpm test -- apps/server/src/security/session-token.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/security/session-token.ts apps/server/src/security/session-token.test.ts
git commit -m "feat(server): add secure session token helpers"
```

## Task 4: Define Runtime Store Ports

**Files:**
- Create: `apps/server/src/runtime/ports.ts`
- Create: `apps/server/src/runtime/in-memory-runtime-store.ts`
- Create: `apps/server/src/runtime/runtime-store.test.ts`

- [ ] **Step 1: Write runtime store contract tests**

Create `apps/server/src/runtime/runtime-store.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../../packages/domain/src/index.ts";
import { createInMemoryRuntimeStore } from "./in-memory-runtime-store.ts";

test("runtime store persists rooms, sessions, snapshots, and commands", async () => {
  const store = createInMemoryRuntimeStore();
  const state = createMatchState({
    matchId: "match-runtime-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.rooms.save({
    roomId: "room-1",
    inviteCode: "ABC123",
    roomName: "Room One",
    visibility: "public",
    hostPlayerId: "p1",
    desiredPlayerCount: 2,
    createdAt: "2026-04-30T00:00:00.000Z",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ],
    status: "started",
    sessionId: "session-room-1"
  });

  await store.sessions.save({
    tokenHash: "hash-1",
    roomId: "room-1",
    playerId: "p1",
    clientInstanceId: "client-1",
    issuedAt: "2026-04-30T00:00:00.000Z",
    expiresAt: "2026-05-01T00:00:00.000Z",
    revokedAt: null
  });

  await store.matches.saveSnapshot({
    sessionId: "session-room-1",
    state,
    logLength: 0,
    revision: 0
  });

  const commandId = await store.streams.appendCommand("session-room-1", {
    commandId: "command-1",
    roomId: "room-1",
    playerId: "p1",
    receivedAt: "2026-04-30T00:00:01.000Z",
    payload: {
      type: "match.endTurn",
      version: 1,
      matchId: "match-runtime-test",
      playerId: "p1"
    }
  });

  assert.equal((await store.rooms.get("room-1"))?.roomName, "Room One");
  assert.equal((await store.sessions.getByTokenHash("hash-1"))?.playerId, "p1");
  assert.equal((await store.matches.getSnapshot("session-room-1"))?.revision, 0);
  assert.equal(commandId, "1-0");
  assert.equal((await store.streams.readCommands("session-room-1", "0-0", 10)).length, 1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm test -- apps/server/src/runtime/runtime-store.test.ts
```

Expected: failure because runtime store files do not exist.

- [ ] **Step 3: Implement runtime port types**

Create `apps/server/src/runtime/ports.ts`:

```ts
import type { MatchState } from "../../../../packages/domain/src/index.ts";
import type { CommandHandlingResult, MatchCommand } from "../../../../packages/application/src/index.ts";

export type RoomStatus = "lobby" | "started";
export type RoomVisibility = "public" | "private";

export interface RoomPlayerRecord {
  readonly id: string;
  readonly name: string;
}

export interface RoomRecord {
  readonly roomId: string;
  readonly inviteCode: string;
  readonly roomName: string;
  readonly visibility: RoomVisibility;
  readonly hostPlayerId: string;
  readonly desiredPlayerCount: number;
  readonly createdAt: string;
  readonly players: readonly RoomPlayerRecord[];
  readonly status: RoomStatus;
  readonly sessionId: string | null;
}

export interface PlayerSessionRecord {
  readonly tokenHash: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly clientInstanceId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface MatchSnapshotRecord {
  readonly sessionId: string;
  readonly state: MatchState;
  readonly logLength: number;
  readonly revision: number;
}

export interface CommandEnvelope {
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly receivedAt: string;
  readonly payload: MatchCommand;
}

export interface EventEnvelope {
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly processedAt: string;
  readonly result: CommandHandlingResult;
  readonly revision: number;
}

export interface StreamEntry<TValue> {
  readonly streamId: string;
  readonly value: TValue;
}

export interface RoomRepository {
  save(room: RoomRecord): Promise<void>;
  get(roomId: string): Promise<RoomRecord | null>;
  findByInviteCode(inviteCode: string): Promise<RoomRecord | null>;
  listJoinable(options: {
    readonly sort: "recent" | "players";
    readonly hasSeatOnly: boolean;
  }): Promise<readonly RoomRecord[]>;
}

export interface SessionRepository {
  save(session: PlayerSessionRecord): Promise<void>;
  getByTokenHash(tokenHash: string): Promise<PlayerSessionRecord | null>;
  revoke(tokenHash: string, revokedAt: string): Promise<void>;
}

export interface MatchRepository {
  saveSnapshot(snapshot: MatchSnapshotRecord): Promise<void>;
  getSnapshot(sessionId: string): Promise<MatchSnapshotRecord | null>;
}

export interface RuntimeStreams {
  appendCommand(sessionId: string, envelope: CommandEnvelope): Promise<string>;
  readCommands(
    sessionId: string,
    afterStreamId: string,
    count: number
  ): Promise<readonly StreamEntry<CommandEnvelope>[]>;
  appendEvent(sessionId: string, envelope: EventEnvelope): Promise<string>;
  readEvents(
    sessionId: string,
    afterStreamId: string,
    count: number
  ): Promise<readonly StreamEntry<EventEnvelope>[]>;
}

export interface RuntimeStore {
  readonly rooms: RoomRepository;
  readonly sessions: SessionRepository;
  readonly matches: MatchRepository;
  readonly streams: RuntimeStreams;
}
```

- [ ] **Step 4: Implement in-memory runtime store**

Create `apps/server/src/runtime/in-memory-runtime-store.ts` with `Map`-backed repositories and stream arrays. Keep this implementation deterministic and test-only friendly.

- [ ] **Step 5: Run runtime store tests**

Run:

```bash
pnpm test -- apps/server/src/runtime/runtime-store.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/runtime/ports.ts apps/server/src/runtime/in-memory-runtime-store.ts apps/server/src/runtime/runtime-store.test.ts
git commit -m "feat(server): add runtime store ports"
```

## Task 5: Add Redis Runtime Store Adapter

**Files:**
- Create: `apps/server/src/runtime/redis-runtime-store.ts`
- Create: `apps/server/src/runtime/redis-runtime-store.integration.test.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Add Redis client dependency**

Run:

```bash
pnpm add redis --filter @project-bh/server
```

Expected: `apps/server/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write Redis integration tests gated by REDIS_URL**

Create `apps/server/src/runtime/redis-runtime-store.integration.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createClient } from "redis";
import { createMatchState } from "../../../../packages/domain/src/index.ts";
import { createRedisRuntimeStore } from "./redis-runtime-store.ts";

test("redis runtime store persists snapshot and stream entries", async (context) => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    context.skip("REDIS_URL is not configured.");
    return;
  }

  const client = createClient({ url: redisUrl });
  await client.connect();

  try {
    const store = createRedisRuntimeStore({
      client,
      keyPrefix: `bh:test:${Date.now()}`
    });
    const state = createMatchState({
      matchId: "match-redis-test",
      players: [
        { id: "p1", name: "One" },
        { id: "p2", name: "Two" }
      ]
    });

    await store.matches.saveSnapshot({
      sessionId: "session-redis-test",
      state,
      logLength: 0,
      revision: 0
    });

    await store.streams.appendCommand("session-redis-test", {
      commandId: "command-redis-1",
      roomId: "room-redis",
      playerId: "p1",
      receivedAt: "2026-04-30T00:00:00.000Z",
      payload: {
        type: "match.endTurn",
        version: 1,
        matchId: "match-redis-test",
        playerId: "p1"
      }
    });

    assert.equal((await store.matches.getSnapshot("session-redis-test"))?.revision, 0);
    assert.equal((await store.streams.readCommands("session-redis-test", "0-0", 10)).length, 1);
  } finally {
    await client.quit();
  }
});
```

- [ ] **Step 3: Run Redis integration test without REDIS_URL**

Run:

```bash
pnpm test -- apps/server/src/runtime/redis-runtime-store.integration.test.ts
```

Expected: skip with `REDIS_URL is not configured.`

- [ ] **Step 4: Implement Redis runtime store**

Create `apps/server/src/runtime/redis-runtime-store.ts` using Redis JSON strings and Streams:

- room key: `bh:room:{roomId}`.
- session key: `bh:session:{tokenHash}`.
- match snapshot key: `bh:match:{sessionId}:snapshot`.
- command stream key: `bh:match:{sessionId}:commands`.
- event stream key: `bh:match:{sessionId}:events`.
- idempotency key: `bh:match:{sessionId}:idempotency:{commandId}`.

Validate parsed JSON enough to reject missing ids before returning data to callers.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test -- apps/server/src/runtime/runtime-store.test.ts apps/server/src/runtime/redis-runtime-store.integration.test.ts
```

Expected: in-memory tests pass; Redis test skips unless `REDIS_URL` is configured.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/runtime/redis-runtime-store.ts apps/server/src/runtime/redis-runtime-store.integration.test.ts
git commit -m "feat(server): add redis runtime store"
```

## Task 6: Add Engine Worker

**Files:**
- Create: `apps/server/src/engine-worker.ts`
- Create: `apps/server/src/engine-worker.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write engine worker tests**

Create `apps/server/src/engine-worker.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createMatchState } from "../../../packages/domain/src/index.ts";
import { createEngineWorker } from "./engine-worker.ts";
import { createInMemoryRuntimeStore } from "./runtime/in-memory-runtime-store.ts";

test("engine worker applies command envelopes and appends authoritative events", async () => {
  const store = createInMemoryRuntimeStore();
  const worker = createEngineWorker({ store });
  const state = createMatchState({
    matchId: "match-engine-test",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.matches.saveSnapshot({
    sessionId: "session-engine-test",
    state,
    logLength: 0,
    revision: 0
  });

  await store.streams.appendCommand("session-engine-test", {
    commandId: "command-engine-1",
    roomId: "room-engine",
    playerId: "p1",
    receivedAt: "2026-04-30T00:00:00.000Z",
    payload: {
      type: "match.endTurn",
      version: 1,
      matchId: "match-engine-test",
      playerId: "p1"
    }
  });

  const processed = await worker.processNextCommand("session-engine-test");
  const snapshot = await store.matches.getSnapshot("session-engine-test");
  const events = await store.streams.readEvents("session-engine-test", "0-0", 10);

  assert.equal(processed, true);
  assert.equal(snapshot?.revision, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.value.commandId, "command-engine-1");
});

test("engine worker records domain rejections without losing canonical state", async () => {
  const store = createInMemoryRuntimeStore();
  const worker = createEngineWorker({ store });
  const state = createMatchState({
    matchId: "match-engine-reject",
    players: [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" }
    ]
  });

  await store.matches.saveSnapshot({
    sessionId: "session-engine-reject",
    state,
    logLength: 0,
    revision: 0
  });

  await store.streams.appendCommand("session-engine-reject", {
    commandId: "command-engine-reject-1",
    roomId: "room-engine",
    playerId: "p2",
    receivedAt: "2026-04-30T00:00:00.000Z",
    payload: {
      type: "match.endTurn",
      version: 1,
      matchId: "match-engine-reject",
      playerId: "p2"
    }
  });

  await worker.processNextCommand("session-engine-reject");
  const snapshot = await store.matches.getSnapshot("session-engine-reject");
  const events = await store.streams.readEvents("session-engine-reject", "0-0", 10);

  assert.equal(snapshot?.revision, 1);
  assert.ok(events[0]!.value.result.rejection);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm test -- apps/server/src/engine-worker.test.ts
```

Expected: failure because `engine-worker.ts` does not exist.

- [ ] **Step 3: Implement engine worker**

Create `apps/server/src/engine-worker.ts` with:

- `createEngineWorker({ store, logger })`.
- `processNextCommand(sessionId)`.
- `processCommandEnvelope(sessionId, envelope)`.
- idempotency check before applying.
- snapshot load before applying.
- `handleMatchCommand(snapshot.state, command)`.
- snapshot save after result.
- event stream append after result.

- [ ] **Step 4: Keep direct composition root compatible**

Modify `apps/server/src/index.ts` so the existing direct in-memory API still works for tests while the new worker can share the same `CommandHandlingResult` shape.

- [ ] **Step 5: Run engine and existing server tests**

Run:

```bash
pnpm test -- apps/server/src/engine-worker.test.ts apps/server/src/index.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/engine-worker.ts apps/server/src/engine-worker.test.ts apps/server/src/index.ts
git commit -m "feat(server): add authoritative engine worker"
```

## Task 7: Route Backend Commands Through Runtime Store

**Files:**
- Modify: `apps/server/src/http-server.ts`
- Modify: `apps/server/src/http-server.test.ts`
- Modify: `apps/server/src/runtime-config.ts`
- Modify: `apps/server/src/runtime-config.test.ts`

- [ ] **Step 1: Add tests for queued command behavior**

Extend `apps/server/src/http-server.test.ts` with a test shaped like this:

```ts
test("command endpoint queues commands with resolved player identity", async (context) => {
  const server = await startHttpServer({ port: 0, host: "127.0.0.1" });
  const baseUrl = `http://${server.host}:${server.port}`;

  try {
    const createRoom = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Host", playerCount: 2 })
    });
    const host = (await createRoom.json()) as RoomResponse;

    const joinRoom = await fetch(`${baseUrl}/api/invite/${host.room.inviteCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guest" })
    });
    const guest = (await joinRoom.json()) as RoomResponse;

    await fetch(`${baseUrl}/api/rooms/${host.room.roomId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: host.sessionToken })
    });

    const command = await fetch(`${baseUrl}/api/rooms/${host.room.roomId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId: "http-command-1",
        sessionToken: host.sessionToken,
        type: "match.endTurn",
        version: 1,
        matchId: `match-${host.room.roomId}`,
        playerId: guest.playerId
      })
    });

    assert.equal(command.status, 200);
    const payload = (await command.json()) as {
      readonly snapshot: { readonly viewer: { readonly playerId: string } };
    };
    assert.equal(payload.snapshot.viewer.playerId, host.playerId);
  } catch (error) {
    if (isListenPermissionError(error)) {
      context.skip("Sandbox blocks local port binding; run this test in a normal local shell.");
      return;
    }
    throw error;
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run server tests and verify failure**

Run:

```bash
pnpm test -- apps/server/src/http-server.test.ts
```

Expected: failure for new queued-runtime expectations.

- [ ] **Step 3: Add runtime mode config**

Modify `apps/server/src/runtime-config.ts` to support:

- `RUNTIME_STORE=memory|redis`.
- `REDIS_URL`.
- `SESSION_TOKEN_SECRET`.
- `CORS_ALLOWED_ORIGINS`.

Require `SESSION_TOKEN_SECRET` when `RUNTIME_STORE=redis`.

- [ ] **Step 4: Update HTTP server dependencies**

Modify `startHttpServer` so options can inject:

- runtime store.
- engine worker or command dispatcher.
- token secret.
- CORS allowlist.
- clock.

Default local development may still use in-memory runtime.

- [ ] **Step 5: Change command endpoint flow**

In `POST /api/rooms/:roomId/commands`:

- require `sessionToken`.
- hash token and resolve session through runtime store.
- inject authoritative `playerId`.
- validate command.
- require or generate `commandId`.
- append to command stream.
- process through in-process engine worker in memory mode.
- read latest snapshot.
- return selector bundle for the resolved viewer.

- [ ] **Step 6: Run server tests**

Run:

```bash
pnpm test -- apps/server/src/http-server.test.ts apps/server/src/runtime-config.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/http-server.ts apps/server/src/http-server.test.ts apps/server/src/runtime-config.ts apps/server/src/runtime-config.test.ts
git commit -m "feat(server): route commands through runtime store"
```

## Task 8: Harden Invite Codes, CORS, Sessions, and Rate Limits

**Files:**
- Modify: `apps/server/src/http-server.ts`
- Create: `apps/server/src/security/rate-limit.ts`
- Create: `apps/server/src/security/rate-limit.test.ts`
- Modify: `docs/networking/protocol.md`

- [ ] **Step 1: Write security behavior tests**

Create `apps/server/src/security/rate-limit.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntimeStore } from "../runtime/in-memory-runtime-store.ts";
import { createFixedWindowRateLimiter } from "./rate-limit.ts";

test("fixed window rate limiter blocks requests after the configured limit", async () => {
  const store = createInMemoryRuntimeStore();
  const limiter = createFixedWindowRateLimiter({
    store,
    limit: 2,
    windowMs: 1000,
    now: () => 1000
  });

  assert.equal((await limiter.check({ scope: "room.create", identity: "ip-1" })).allowed, true);
  assert.equal((await limiter.check({ scope: "room.create", identity: "ip-1" })).allowed, true);
  const blocked = await limiter.check({ scope: "room.create", identity: "ip-1" });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterMs, 1000);
});
```

Extend `apps/server/src/http-server.test.ts` with explicit cases for:

- CORS rejects an origin outside `CORS_ALLOWED_ORIGINS`.
- room creation returns `429` when the limiter denies the request.
- invite lookup and WebSocket upgrade reject invalid session tokens.

- [ ] **Step 2: Run security tests and verify failure**

Run:

```bash
pnpm test -- apps/server/src/security/rate-limit.test.ts apps/server/src/http-server.test.ts
```

Expected: failure for rate-limit module and new behavior.

- [ ] **Step 3: Implement rate limiter**

Create a simple fixed-window limiter using runtime store counters:

- key format: `bh:ratelimit:{scope}:{identity}:{window}`.
- configurable limit and window.
- return `allowed`, `remaining`, and `retryAfterMs`.

- [ ] **Step 4: Replace invite randomness**

Replace `Math.random()` invite code generation with `crypto.randomInt`.

- [ ] **Step 5: Implement CORS allowlist**

Use configured allowed origins:

- local default may allow localhost origins.
- Redis/runtime deployment mode requires explicit allowlist.
- never reflect arbitrary origins.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- apps/server/src/security/rate-limit.test.ts apps/server/src/http-server.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/http-server.ts apps/server/src/security/rate-limit.ts apps/server/src/security/rate-limit.test.ts docs/networking/protocol.md
git commit -m "feat(server): harden sessions and request limits"
```

## Task 9: Add Online Game Benchmark Harness

**Files:**
- Create: `apps/server/src/benchmark/online-game-benchmark.ts`
- Create: `apps/server/src/benchmark/online-game-benchmark.test.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json`
- Modify: `docs/testing/test-strategy.md`

- [ ] **Step 1: Write benchmark smoke test**

Create `apps/server/src/benchmark/online-game-benchmark.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { runOnlineGameBenchmark } from "./online-game-benchmark.ts";

test("online benchmark smoke run records room, join, websocket, and command metrics", async (context) => {
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
});
```

- [ ] **Step 2: Run smoke test and verify failure**

Run:

```bash
pnpm test -- apps/server/src/benchmark/online-game-benchmark.test.ts
```

Expected: failure because benchmark module does not exist.

- [ ] **Step 3: Implement benchmark harness**

Create `apps/server/src/benchmark/online-game-benchmark.ts` with:

- `runOnlineGameBenchmark(options)`.
- room creation loop.
- join loop.
- optional WebSocket connection loop.
- start-room loop.
- command loop.
- reconnect loop option.
- metric collection with `name`, `value`, `unit`, `tags`, and `timestamp`.
- optional JSONL writer.

- [ ] **Step 4: Add scripts**

Modify `apps/server/package.json`:

```json
{
  "scripts": {
    "benchmark:online": "node --experimental-strip-types src/benchmark/online-game-benchmark.ts"
  }
}
```

Modify root `package.json`:

```json
{
  "scripts": {
    "benchmark:online": "pnpm --filter @project-bh/server benchmark:online"
  }
}
```

Keep existing scripts intact while adding the new entries.

- [ ] **Step 5: Run benchmark smoke test**

Run:

```bash
pnpm test -- apps/server/src/benchmark/online-game-benchmark.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/benchmark/online-game-benchmark.ts apps/server/src/benchmark/online-game-benchmark.test.ts apps/server/package.json package.json docs/testing/test-strategy.md
git commit -m "feat(server): add online game benchmark harness"
```

## Task 10: Update Architecture and Migration Documentation

**Files:**
- Modify: `docs/architecture/overview.md`
- Modify: `docs/networking/protocol.md`
- Modify: `docs/testing/test-strategy.md`
- Modify: `docs/migration/unity-parity.md`

- [ ] **Step 1: Update architecture overview**

Document:

- backend gateway responsibilities.
- engine worker responsibilities.
- Redis key model.
- selector-only frontend contract.
- Redis as infrastructure, not rules engine.

- [ ] **Step 2: Update protocol docs**

Document:

- command envelope with `commandId`.
- Redis command/event stream semantics.
- selector ids and versions.
- session token handling.
- CORS and WebSocket authentication policy.

- [ ] **Step 3: Update testing docs**

Document:

- selector schema tests.
- engine worker tests.
- runtime store contract tests.
- Redis integration tests gated by `REDIS_URL`.
- security tests.
- online benchmark smoke tests.

- [ ] **Step 4: Update Unity parity docs**

Document:

- Unity consumes backend selectors and protocol contracts.
- Unity does not need to reimplement browser projection internals.
- deterministic fixtures remain in domain/testkit.
- Redis does not create a Unity dependency.

- [ ] **Step 5: Check docs for forbidden ambiguity**

Run:

```bash
rg -n 'T''BD|T''ODO|implement la''ter|fill in de''tails' docs/architecture/overview.md docs/networking/protocol.md docs/testing/test-strategy.md docs/migration/unity-parity.md
```

Expected: no matches introduced by this work.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/overview.md docs/networking/protocol.md docs/testing/test-strategy.md docs/migration/unity-parity.md
git commit -m "docs: document redis authoritative runtime"
```

## Final Verification

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: pass. Tests that require local port binding may skip in restricted sandboxes using their existing skip behavior.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass.

- [ ] **Step 3: Run web build**

Run:

```bash
pnpm build:web
```

Expected: pass.

- [ ] **Step 4: Run benchmark smoke**

Run:

```bash
pnpm test -- apps/server/src/benchmark/online-game-benchmark.test.ts
```

Expected: pass.

- [ ] **Step 5: Run optional Redis integration**

Run with a local Redis instance:

```bash
REDIS_URL=redis://127.0.0.1:6379 pnpm test -- apps/server/src/runtime/redis-runtime-store.integration.test.ts
```

Expected: pass when Redis is available. Skip is acceptable when `REDIS_URL` is absent.

- [ ] **Step 6: Review diff**

Run:

```bash
git diff --stat
git diff --check
```

Expected: no whitespace errors and changes limited to the planned runtime, security, selector, benchmark, and documentation files.
