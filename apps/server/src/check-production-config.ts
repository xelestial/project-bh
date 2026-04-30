import { fileURLToPath } from "node:url";

import { resolveHttpServerRuntimeConfig } from "./runtime-config.ts";

export interface ProductionRuntimeConfigSummary {
  readonly host: string;
  readonly port: number;
  readonly runtimeStore: "redis";
  readonly redisUrlConfigured: boolean;
  readonly sessionTokenSecretConfigured: boolean;
  readonly corsAllowedOrigins: readonly string[];
}

export function checkProductionRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): ProductionRuntimeConfigSummary {
  const config = resolveHttpServerRuntimeConfig({
    argv: [],
    env: {
      ...env,
      NODE_ENV: "production"
    }
  });

  if (config.runtimeStore !== "redis") {
    throw new Error("RUNTIME_STORE=redis is required for production.");
  }

  return {
    host: config.host,
    port: config.port,
    runtimeStore: config.runtimeStore,
    redisUrlConfigured: config.redisUrl !== null,
    sessionTokenSecretConfigured: config.sessionTokenSecret.length > 0,
    corsAllowedOrigins: config.corsAllowedOrigins
  };
}

function runCli(): void {
  try {
    const summary = checkProductionRuntimeConfig();
    console.log(JSON.stringify({ ok: true, config: summary }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Production config check failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
