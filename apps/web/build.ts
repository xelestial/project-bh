import { build } from "vite";

import { createWebViteConfig, resolveWebRuntimeConfig } from "./config.ts";

await build({
  ...createWebViteConfig(resolveWebRuntimeConfig()),
  configFile: false
});
