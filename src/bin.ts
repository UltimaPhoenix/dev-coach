// devcoach entry: the MCP server over stdio, and nothing else. The shebang is injected by tsup.
// There is no CLI in this design — the hooks are `mcp_tool` entries that call the server's own
// hook tools, and the dashboard starts from the `open_ui` tool — so every argument but
// `--version` / `--help` is ignored (`mcp`, the subcommand every manifest still passes, included).
// The one static import is `core/runtime` (node:fs + node:os + the version): it must load on ANY
// Node, to say what is wrong; the server loads via a dynamic import tsup splits into its own chunk.
import { describeRuntime, describeWhere, nodeProblem } from "./core/runtime";

const args = new Set(process.argv.slice(2));

const HELP =
  "devcoach is an MCP server: install it as a Claude Code plugin (/plugin install " +
  "devcoach@ultimaphoenix) or add it to your agent's MCP config as `devcoach` over stdio; " +
  "the web dashboard opens from the `open_ui` tool. Options: --version, --help.";

/** `devcoach 2.6.3 (homebrew): ` — so a crash in a host's log says which install it came from. */
function prefix(): string {
  const info = describeRuntime();
  return `devcoach ${info.version} (${describeWhere(info.where)}): `;
}

// Below Node 24 `node:sqlite` does not exist, and the first import of it dies with a bare
// stack. Say it instead.
const tooOld = nodeProblem(process.versions.node);
if (tooOld) {
  console.error(`${tooOld} at ${process.execPath}. Upgrade Node, then restart.`);
  process.exit(1);
}

if (args.has("--version") || args.has("-v")) {
  console.log(describeRuntime().version);
  process.exit(0);
}
if (args.has("--help") || args.has("-h")) {
  console.log(HELP);
  process.exit(0);
}

try {
  const { runStdio } = await import("./mcp/server");
  await runStdio();
} catch (err) {
  console.error(prefix(), err);
  process.exit(1);
}
