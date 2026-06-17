import { defineConfig } from "tsup";

export default defineConfig({
  entry: { bin: "src/bin.ts" },
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  minify: true,
  treeshake: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
