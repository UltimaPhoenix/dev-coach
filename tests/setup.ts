// Per-test-file isolation: redirect HOME to a unique temp dir so withConnection() (which reads
// ~/.devcoach from homedir at import) never touches the real database. Runs before each test file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HOME = mkdtempSync(join(tmpdir(), "dc-test-"));
process.env.NO_COLOR = "1";
