interface HttpServerRuntimeConfigSources {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

export interface HttpServerRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly runtimeStore: "memory" | "redis";
  readonly redisUrl: string | null;
  readonly sessionTokenSecret: string;
  readonly corsAllowedOrigins: readonly string[];
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

function parseRuntimeStore(rawValue: string | undefined): "memory" | "redis" {
  if (!rawValue || rawValue === "memory") {
    return "memory";
  }

  if (rawValue === "redis") {
    return "redis";
  }

  throw new Error(`Invalid runtime store: ${rawValue}`);
}

function parseCorsAllowedOrigins(rawValue: string | undefined): readonly string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production";
}

function validateProductionRuntimeConfig(input: {
  readonly runtimeStore: "memory" | "redis";
  readonly sessionTokenSecret: string;
  readonly corsAllowedOrigins: readonly string[];
}): void {
  if (input.runtimeStore !== "redis") {
    throw new Error("RUNTIME_STORE=redis is required when NODE_ENV=production.");
  }

  if (input.sessionTokenSecret.length < 32) {
    throw new Error(
      "SESSION_TOKEN_SECRET must be at least 32 characters when NODE_ENV=production."
    );
  }

  if (input.sessionTokenSecret === "project-bh-local-session-secret") {
    throw new Error(
      "SESSION_TOKEN_SECRET must not use the local default when NODE_ENV=production."
    );
  }

  if (input.corsAllowedOrigins.length === 0) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS must be explicitly configured when NODE_ENV=production."
    );
  }
}

export function resolveHttpServerRuntimeConfig(
  sources: HttpServerRuntimeConfigSources = {}
): HttpServerRuntimeConfig {
  const argv = sources.argv ?? process.argv.slice(2);
  const env = sources.env ?? process.env;

  const host = readOption(argv, "host") ?? env.HOST ?? "127.0.0.1";
  const port = parsePort(readOption(argv, "port") ?? env.PORT, 8787);
  const runtimeStore = parseRuntimeStore(env.RUNTIME_STORE);
  const redisUrl = env.REDIS_URL?.trim() || null;
  const sessionTokenSecret =
    env.SESSION_TOKEN_SECRET?.trim() || "project-bh-local-session-secret";
  const corsAllowedOrigins = parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (!host.trim()) {
    throw new Error("Host must not be empty.");
  }

  if (runtimeStore === "redis") {
    if (!redisUrl) {
      throw new Error("REDIS_URL is required when RUNTIME_STORE=redis.");
    }

    if (!env.SESSION_TOKEN_SECRET?.trim()) {
      throw new Error("SESSION_TOKEN_SECRET is required when RUNTIME_STORE=redis.");
    }
  }

  if (isProduction(env)) {
    validateProductionRuntimeConfig({
      runtimeStore,
      sessionTokenSecret,
      corsAllowedOrigins
    });
  }

  return {
    host,
    port,
    runtimeStore,
    redisUrl,
    sessionTokenSecret,
    corsAllowedOrigins
  };
}
