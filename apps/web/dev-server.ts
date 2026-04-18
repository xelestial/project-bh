import { createServer } from "vite";

import { createWebViteConfig, resolveWebRuntimeConfig } from "./config.ts";

const runtimeConfig = resolveWebRuntimeConfig();
const server = await createServer({
  ...createWebViteConfig(runtimeConfig),
  configFile: false
});

await server.listen();
server.printUrls();

const closeServer = async () => {
  await server.close();
  process.exit(0);
};

process.once("SIGINT", () => {
  void closeServer();
});

process.once("SIGTERM", () => {
  void closeServer();
});
