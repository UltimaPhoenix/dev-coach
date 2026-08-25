import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // The suite writes to real SQLite files (autocommit → one fsync per statement) and spawns
    // real hook processes; on a slow shared CI runner the whole suite ran 4-5× slower than usual
    // and an ordinary DB test (~120 writes, 24 ms locally) hit the 5 s default (6.3 s, release run
    // 32907800503 on Node 26) while seven others sat at 2.3-3 s. 30 s matches the explicit
    // per-test timeouts already used by tests/hooks-spawn.test.ts.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"], // lcov → coverage/lcov.info for SonarQube Cloud
      include: ["src/**"],
      // bin shebang entry is the thin process wrapper; exercised end-to-end, not unit-counted.
      exclude: ["src/bin.ts"],
      // Gate near the achieved coverage (actuals ~95 lines / 94 statements / 97 functions) with a
      // small margin. Branches kept lower: many remaining branches are defensive catch/null-fallback
      // paths and git-detection branches that vary by environment/CI. Note: the hook spawn tests
      // run in child processes v8 can't see — tests/hooks.test.ts re-covers those lines in-process.
      thresholds: { lines: 92, functions: 95, statements: 91, branches: 76 },
    },
  },
});
