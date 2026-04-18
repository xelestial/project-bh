import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebRuntimeConfig } from "./config.ts";

test("web runtime config resolves bind and backend ports from cli arguments", () => {
  const config = resolveWebRuntimeConfig({
    argv: ["--host", "0.0.0.0", "--port", "5200", "--backend-port", "9900"],
    env: {}
  });

  assert.deepEqual(config, {
    webHost: "0.0.0.0",
    webPort: 5200,
    backendHttpUrl: "http://127.0.0.1:9900",
    backendWsUrl: "ws://127.0.0.1:9900"
  });
});

test("web runtime config honors explicit backend urls", () => {
  const config = resolveWebRuntimeConfig({
    argv: ["--backend-http-url", "https://game.example.com", "--backend-ws-url", "wss://game.example.com/socket"],
    env: {}
  });

  assert.deepEqual(config, {
    webHost: "127.0.0.1",
    webPort: 5173,
    backendHttpUrl: "https://game.example.com",
    backendWsUrl: "wss://game.example.com/socket"
  });
});

test("web runtime config falls back to environment variables", () => {
  const config = resolveWebRuntimeConfig({
    argv: [],
    env: {
      WEB_HOST: "127.0.0.1",
      WEB_PORT: "5300",
      BACKEND_HOST: "192.168.0.20",
      BACKEND_PORT: "9300"
    }
  });

  assert.deepEqual(config, {
    webHost: "127.0.0.1",
    webPort: 5300,
    backendHttpUrl: "http://192.168.0.20:9300",
    backendWsUrl: "ws://192.168.0.20:9300"
  });
});
