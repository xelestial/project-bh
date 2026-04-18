import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import type { InlineConfig } from "vite";

interface WebRuntimeConfigSources {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

export interface WebRuntimeConfig {
  readonly webHost: string;
  readonly webPort: number;
  readonly backendHttpUrl: string;
  readonly backendWsUrl: string;
}

function readOption(argv: readonly string[], name: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument) {
      continue;
    }

    if (argument === `--${name}`) {
      return argv[index + 1];
    }

    if (argument.startsWith(`--${name}=`)) {
      return argument.slice(name.length + 3);
    }
  }

  return undefined;
}

function parsePort(rawValue: string | undefined, defaultPort: number): number {
  if (!rawValue) {
    return defaultPort;
  }

  const port = Number.parseInt(rawValue, 10);

  if (Number.isNaN(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${rawValue}`);
  }

  return port;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function toWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) {
    return `wss://${httpUrl.slice("https://".length)}`;
  }

  if (httpUrl.startsWith("http://")) {
    return `ws://${httpUrl.slice("http://".length)}`;
  }

  return httpUrl;
}

export function resolveWebRuntimeConfig(
  sources: WebRuntimeConfigSources = {}
): WebRuntimeConfig {
  const argv = sources.argv ?? process.argv.slice(2);
  const env = sources.env ?? process.env;

  const webHost =
    readOption(argv, "host") ??
    env.WEB_HOST ??
    env.VITE_WEB_HOST ??
    "127.0.0.1";
  const webPort = parsePort(
    readOption(argv, "port") ?? env.WEB_PORT ?? env.VITE_WEB_PORT,
    5173
  );

  const backendHost =
    readOption(argv, "backend-host") ??
    env.BACKEND_HOST ??
    env.VITE_BACKEND_HOST ??
    "127.0.0.1";
  const backendPort = parsePort(
    readOption(argv, "backend-port") ?? env.BACKEND_PORT ?? env.VITE_BACKEND_PORT,
    8787
  );

  const backendHttpUrl = trimTrailingSlash(
    readOption(argv, "backend-http-url") ??
      env.BACKEND_HTTP_URL ??
      env.VITE_BACKEND_HTTP_URL ??
      `http://${backendHost}:${backendPort}`
  );
  const backendWsUrl = trimTrailingSlash(
    readOption(argv, "backend-ws-url") ??
      env.BACKEND_WS_URL ??
      env.VITE_BACKEND_WS_URL ??
      toWebSocketUrl(backendHttpUrl)
  );

  if (!webHost.trim()) {
    throw new Error("Web host must not be empty.");
  }

  return {
    webHost,
    webPort,
    backendHttpUrl,
    backendWsUrl
  };
}

export function createWebViteConfig(
  runtimeConfig: WebRuntimeConfig = resolveWebRuntimeConfig()
): InlineConfig {
  process.env.VITE_BACKEND_HTTP_URL = runtimeConfig.backendHttpUrl;
  process.env.VITE_BACKEND_WS_URL = runtimeConfig.backendWsUrl;

  return {
    root: resolve(import.meta.dirname),
    plugins: [react()],
    server: {
      host: runtimeConfig.webHost,
      port: runtimeConfig.webPort,
      proxy: {
        "/api": runtimeConfig.backendHttpUrl,
        "/ws": {
          target: runtimeConfig.backendWsUrl,
          ws: true
        }
      }
    },
    build: {
      outDir: resolve(import.meta.dirname, "dist"),
      emptyOutDir: true
    }
  };
}
