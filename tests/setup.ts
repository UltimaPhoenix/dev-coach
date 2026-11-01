// Per-test-file isolation: redirect HOME to a unique temp dir so withConnection() (which reads
// ~/.devcoach from homedir at import) never touches the real database. Runs before each test file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HOME = mkdtempSync(join(tmpdir(), "dc-test-"));
process.env.NO_COLOR = "1";
// The hook tools are opt-in (the plugin's .mcp.json sets this); tests turn them on explicitly.
delete process.env.DEVCOACH_HOOK_TOOLS;
