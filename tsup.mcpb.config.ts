import { defineConfig } from "tsup";

// Self-contained bundle for the Claude Desktop extension (.mcpb). The extension ships no
// node_modules, so every dependency (MCP SDK, Hono, Commander, Zod, fflate) is inlined here;
// only Node built-ins stay external. The npm package keeps the code-split, externals-based
// build in tsup.config.ts — this config exists solely for scripts/build-mcpb.mjs.
export default defineConfig({
  entry: { bin: "src/bin.ts" },
  outDir: "mcpb/build/dist",
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  noExternal: [/.*/],
  splitting: false,
  minify: true,
  treeshake: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
