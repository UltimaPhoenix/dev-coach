// devcoach CLI entry. The shebang is injected by tsup. Hook subcommands run on EVERY
// agent stop, so they load the lean hooks chunk (node built-ins + core only); every
// other subcommand loads the full CLI (Commander/zod/MCP SDK/Hono) via dynamic import,
// which tsup code-splits into separate chunks. The one static import is `core/runtime`
// (node:fs + node:os + the version): it must load on ANY Node, to say what is wrong.
import { describeRuntime, describeWhere, nodeProblem } from "./core/runtime";

const cmd = process.argv[2] ?? "";
const HOOK_CMDS = new Set([
  "stop-hook",
  "prompt-hook",
  "gemini-stop-hook",
  "gemini-prompt-hook",
  "codex-stop-hook",
  "codex-prompt-hook",
  "onboard-hook",
  "lesson-ready",
]);

/** `devcoach 2.6.3 (homebrew): ` — so a crash in a host's log says which install it came from. */
function prefix(): string {
  const info = describeRuntime();
  return `devcoach ${info.version} (${describeWhere(info.where)}): `;
}

// Below Node 24 `node:sqlite` does not exist, and the first import of it dies with a bare
// stack. Say it instead — except in a hook, which must never break the agent's turn.
const tooOld = nodeProblem(process.versions.node);
if (tooOld) {
  if (HOOK_CMDS.has(cmd)) process.exit(0);
  console.error(`${tooOld} at ${process.execPath}. Upgrade Node, then restart.`);
  process.exit(1);
}

try {
  if (HOOK_CMDS.has(cmd)) {
    const { runHook } = await import("./cli/hooks");
    runHook(cmd);
  } else {
    const { runCli } = await import("./cli/commands");
    await runCli();
  }
} catch (err) {
  // A write refused because the database was upgraded by a newer devcoach: the message says
  // which versions, no stack. Exit 3 tells it apart from a crash (1) and a usage error (2).
  if ((err as { name?: string } | null)?.name === "SchemaTooNewError") {
    console.error((err as Error).message);
    process.exit(3);
  }
  console.error(prefix(), err);
  process.exit(1);
}
