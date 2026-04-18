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
    host: "0.0.0.0",
    port: 9300
  });
});

test("server runtime config falls back to environment values", () => {
  const config = resolveHttpServerRuntimeConfig({
    argv: [],
    env: {
      HOST: "192.168.0.10",
      PORT: "9400"
    }
  });

  assert.deepEqual(config, {
    host: "192.168.0.10",
    port: 9400
  });
});

test("server runtime config uses localhost defaults", () => {
  const config = resolveHttpServerRuntimeConfig({
    argv: [],
    env: {}
  });

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 8787
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
