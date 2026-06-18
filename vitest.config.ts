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
      // Gate just under the achieved coverage (actuals ~97 lines / 96 statements / 98 functions /
      // 83 branches) to lock it in. Branches sit lower because the remaining uncovered ones are
      // largely presentation-only ternaries (Tailwind class toggles in views.ts) and defensive
      // catch/null-fallback guards that assert nothing meaningful to test.
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 82 },
    },
  },
});
