// devcoach CLI entry. The shebang is injected by tsup. Hook subcommands run on EVERY
// agent stop, so they load the lean hooks chunk (node built-ins + core only); every
// other subcommand loads the full CLI (Commander/zod/MCP SDK/Hono) via dynamic import,
// which tsup code-splits into separate chunks.
export {}; // top-level await needs module context — this file has no static imports

const cmd = process.argv[2] ?? "";
const HOOK_CMDS = new Set(["stop-hook", "prompt-hook", "onboard-hook", "lesson-ready"]);

try {
  if (HOOK_CMDS.has(cmd)) {
    const { runHook } = await import("./cli/hooks");
    runHook(cmd);
  } else {
    const { runCli } = await import("./cli/commands");
    await runCli();
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
