import { defineConfig } from "tsup";

export default defineConfig({
  entry: { bin: "src/bin.ts" },
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  // Split the dynamic imports in src/bin.ts into separate chunks: hooks (run on every
  // agent stop) load without paying for Commander/zod/MCP SDK/Hono.
  splitting: true,
  minify: true,
  treeshake: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
