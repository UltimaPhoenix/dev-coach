// Per-test-file isolation: redirect HOME to a unique temp dir so withConnection() (which reads
// ~/.devcoach from homedir at import) never touches the real database. Runs before each test file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HOME = mkdtempSync(join(tmpdir(), "dc-test-"));
process.env.NO_COLOR = "1";
// `devcoach lesson` looks for a running dashboard: point it at a closed port, so a dashboard
// running on this machine (7860) is never pinged nor linked by a test.
process.env.DEVCOACH_UI_PORT = "9";
