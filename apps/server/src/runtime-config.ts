interface HttpServerRuntimeConfigSources {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

export interface HttpServerRuntimeConfig {
  readonly host: string;
  readonly port: number;
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

export function resolveHttpServerRuntimeConfig(
  sources: HttpServerRuntimeConfigSources = {}
): HttpServerRuntimeConfig {
  const argv = sources.argv ?? process.argv.slice(2);
  const env = sources.env ?? process.env;

  const host = readOption(argv, "host") ?? env.HOST ?? "127.0.0.1";
  const port = parsePort(readOption(argv, "port") ?? env.PORT, 8787);

  if (!host.trim()) {
    throw new Error("Host must not be empty.");
  }

  return {
    host,
    port
  };
}
