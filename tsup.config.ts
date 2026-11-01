import { defineConfig } from "tsup";

export default defineConfig({
  entry: { bin: "src/bin.ts" },
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  // Split the dynamic imports into separate chunks: bin.js stays a thin entry, the MCP server
  // (zod + the SDK) is its own chunk, and the Hono dashboard loads only when open_ui runs.
  splitting: true,
  minify: true,
  treeshake: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
