import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserTransportConfig,
  resolveHttpUrl,
  resolveWebSocketUrl
} from "./runtime-transport.ts";

test("browser transport config uses injected backend urls", () => {
  const config = createBrowserTransportConfig({
    origin: "http://127.0.0.1:5173",
    protocol: "http:",
    host: "127.0.0.1:5173"
  }, {
    VITE_BACKEND_HTTP_URL: "http://127.0.0.1:8787",
    VITE_BACKEND_WS_URL: "ws://127.0.0.1:8787"
  });

  assert.equal(config.httpBaseUrl, "http://127.0.0.1:8787");
  assert.equal(config.wsBaseUrl, "ws://127.0.0.1:8787");
  assert.equal(resolveHttpUrl(config, "/api/rooms"), "http://127.0.0.1:8787/api/rooms");
  assert.equal(
    resolveWebSocketUrl(config, "/ws?roomId=room-1&playerId=player-1"),
    "ws://127.0.0.1:8787/ws?roomId=room-1&playerId=player-1"
  );
});
