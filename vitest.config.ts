import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // bin shebang entry is the thin process wrapper; exercised end-to-end, not unit-counted.
      exclude: ["src/bin.ts"],
      // Python's gate is line-based (--cov-fail-under=80) — mirror that with lines/statements/functions
      // at 80 (actuals ~86/86/95). Branches kept lower: many remaining branches are defensive
      // catch/null-fallback paths and git-detection branches that vary by environment/CI.
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 60 },
    },
  },
});
