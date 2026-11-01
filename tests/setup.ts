// Per-test-file isolation: redirect HOME to a unique temp dir so withConnection() (which reads
// ~/.devcoach from homedir at import) never touches the real database. Runs before each test file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "dc-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home; // os.homedir() reads USERPROFILE on Windows, HOME elsewhere
// Claude Desktop's config lives under %APPDATA% on Windows: never the real one from a test.
process.env.APPDATA = join(home, "AppData", "Roaming");
process.env.LOCALAPPDATA = join(home, "AppData", "Local");
process.env.NO_COLOR = "1";
