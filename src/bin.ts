// devcoach CLI entry. The shebang is injected by tsup. Dispatches all subcommands (incl. `mcp`).
import { runCli } from "./cli/commands";

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
