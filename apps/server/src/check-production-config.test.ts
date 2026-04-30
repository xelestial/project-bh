import assert from "node:assert/strict";
import test from "node:test";

import { checkProductionRuntimeConfig } from "./check-production-config.ts";

test("production config check forces production validation", () => {
  assert.throws(
    () =>
      checkProductionRuntimeConfig({
        RUNTIME_STORE: "memory",
        REDIS_URL: "redis://redis.internal:6379",
        SESSION_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
        CORS_ALLOWED_ORIGINS: "https://game.example"
      }),
    /RUNTIME_STORE=redis/
  );
});

test("production config check returns a redacted deployment summary", () => {
  const summary = checkProductionRuntimeConfig({
    HOST: "0.0.0.0",
    PORT: "8787",
    RUNTIME_STORE: "redis",
    REDIS_URL: "rediss://redis.internal:6379",
    SESSION_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
    CORS_ALLOWED_ORIGINS: "https://game.example,https://admin.example"
  });

  assert.deepEqual(summary, {
    corsAllowedOrigins: ["https://game.example", "https://admin.example"],
    host: "0.0.0.0",
    port: 8787,
    redisUrlConfigured: true,
    runtimeStore: "redis",
    sessionTokenSecretConfigured: true
  });
});
