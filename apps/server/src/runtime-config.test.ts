import assert from "node:assert/strict";
import test from "node:test";

import { resolveHttpServerRuntimeConfig } from "./runtime-config.ts";

test("server runtime config prefers cli arguments over environment", () => {
  const config = resolveHttpServerRuntimeConfig({
    argv: ["--host", "0.0.0.0", "--port", "9300"],
    env: {
      HOST: "127.0.0.1",
      PORT: "8787"
    }
  });

  assert.deepEqual(config, {
    corsAllowedOrigins: [],
    host: "0.0.0.0",
    port: 9300,
    redisUrl: null,
    runtimeStore: "memory",
    sessionTokenSecret: "project-bh-local-session-secret"
  });
});

test("server runtime config falls back to environment values", () => {
  const config = resolveHttpServerRuntimeConfig({
    argv: [],
    env: {
      HOST: "192.168.0.10",
      PORT: "9400",
      RUNTIME_STORE: "redis",
      REDIS_URL: "redis://127.0.0.1:6379",
      SESSION_TOKEN_SECRET: "secret-from-env",
      CORS_ALLOWED_ORIGINS: "https://game.example,https://admin.example"
    }
  });

  assert.deepEqual(config, {
    corsAllowedOrigins: ["https://game.example", "https://admin.example"],
    host: "192.168.0.10",
    port: 9400,
    redisUrl: "redis://127.0.0.1:6379",
    runtimeStore: "redis",
    sessionTokenSecret: "secret-from-env"
  });
});

test("server runtime config uses localhost defaults", () => {
  const config = resolveHttpServerRuntimeConfig({
    argv: [],
    env: {}
  });

  assert.deepEqual(config, {
    corsAllowedOrigins: [],
    host: "127.0.0.1",
    port: 8787,
    redisUrl: null,
    runtimeStore: "memory",
    sessionTokenSecret: "project-bh-local-session-secret"
  });
});

test("server runtime config rejects invalid ports", () => {
  assert.throws(
    () =>
      resolveHttpServerRuntimeConfig({
        argv: ["--port", "abc"],
        env: {}
      }),
    /Invalid port/
  );
});

test("server runtime config requires redis url and session secret for redis mode", () => {
  assert.throws(
    () =>
      resolveHttpServerRuntimeConfig({
        argv: [],
        env: {
          RUNTIME_STORE: "redis",
          REDIS_URL: "redis://127.0.0.1:6379"
        }
      }),
    /SESSION_TOKEN_SECRET/
  );

  assert.throws(
    () =>
      resolveHttpServerRuntimeConfig({
        argv: [],
        env: {
          RUNTIME_STORE: "redis",
          SESSION_TOKEN_SECRET: "secret"
        }
      }),
    /REDIS_URL/
  );
});

test("server runtime config requires redis runtime in production", () => {
  assert.throws(
    () =>
      resolveHttpServerRuntimeConfig({
        argv: [],
        env: {
          NODE_ENV: "production",
          RUNTIME_STORE: "memory",
          REDIS_URL: "redis://redis.internal:6379",
          SESSION_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
          CORS_ALLOWED_ORIGINS: "https://game.example"
        }
      }),
    /RUNTIME_STORE=redis/
  );
});

test("server runtime config rejects weak production session secrets", () => {
  assert.throws(
    () =>
      resolveHttpServerRuntimeConfig({
        argv: [],
        env: {
          NODE_ENV: "production",
          RUNTIME_STORE: "redis",
          REDIS_URL: "redis://redis.internal:6379",
          SESSION_TOKEN_SECRET: "short-secret",
          CORS_ALLOWED_ORIGINS: "https://game.example"
        }
      }),
    /SESSION_TOKEN_SECRET/
  );
});

test("server runtime config requires explicit production cors origins", () => {
  assert.throws(
    () =>
      resolveHttpServerRuntimeConfig({
        argv: [],
        env: {
          NODE_ENV: "production",
          RUNTIME_STORE: "redis",
          REDIS_URL: "redis://redis.internal:6379",
          SESSION_TOKEN_SECRET: "0123456789abcdef0123456789abcdef"
        }
      }),
    /CORS_ALLOWED_ORIGINS/
  );
});

test("server runtime config accepts a production redis deployment config", () => {
  const config = resolveHttpServerRuntimeConfig({
    argv: [],
    env: {
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: "8787",
      RUNTIME_STORE: "redis",
      REDIS_URL: "rediss://redis.internal:6379",
      SESSION_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
      CORS_ALLOWED_ORIGINS: "https://game.example"
    }
  });

  assert.deepEqual(config, {
    corsAllowedOrigins: ["https://game.example"],
    host: "0.0.0.0",
    port: 8787,
    redisUrl: "rediss://redis.internal:6379",
    runtimeStore: "redis",
    sessionTokenSecret: "0123456789abcdef0123456789abcdef"
  });
});
