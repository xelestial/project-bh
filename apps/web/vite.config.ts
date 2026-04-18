import { defineConfig } from "vite";

import { createWebViteConfig, resolveWebRuntimeConfig } from "./config.ts";

export default defineConfig(createWebViteConfig(resolveWebRuntimeConfig()));
