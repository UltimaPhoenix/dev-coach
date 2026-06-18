import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"], // lcov → coverage/lcov.info for SonarQube Cloud
      include: ["src/**"],
      // bin shebang entry is the thin process wrapper; exercised end-to-end, not unit-counted.
      exclude: ["src/bin.ts"],
      // Gate near the achieved coverage (actuals ~95 lines / 94 statements / 98 functions) with a
      // small margin. Branches kept lower: many remaining branches are defensive catch/null-fallback
      // paths and git-detection branches that vary by environment/CI.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 70 },
    },
  },
});
