interface LocationLike {
  readonly origin: string;
  readonly protocol: string;
  readonly host: string;
}

interface BrowserTransportEnv {
  readonly VITE_BACKEND_HTTP_URL?: string;
  readonly VITE_BACKEND_WS_URL?: string;
}

export interface BrowserTransportConfig {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function createFallbackWebSocketOrigin(location: LocationLike): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}`;
}

function readBrowserTransportEnv(): BrowserTransportEnv {
  return (import.meta as ImportMeta & { readonly env: BrowserTransportEnv }).env;
}

export function createBrowserTransportConfig(
  location: LocationLike,
  env: BrowserTransportEnv = readBrowserTransportEnv()
): BrowserTransportConfig {
  return {
    httpBaseUrl: trimTrailingSlash(env.VITE_BACKEND_HTTP_URL || location.origin),
    wsBaseUrl: trimTrailingSlash(
      env.VITE_BACKEND_WS_URL || createFallbackWebSocketOrigin(location)
    )
  };
}

export function resolveHttpUrl(
  config: BrowserTransportConfig,
  path: string
): string {
  return new URL(path, `${config.httpBaseUrl}/`).toString();
}

export function resolveWebSocketUrl(
  config: BrowserTransportConfig,
  path: string
): string {
  return new URL(path, `${config.wsBaseUrl}/`).toString();
}
