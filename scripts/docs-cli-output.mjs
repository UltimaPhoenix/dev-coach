// Capture the CLI output the docs show (website/src/data/cli-output.json, rendered by the site's
// <Terminal> component): real output, in colour (FORCE_COLOR=1), never typed by hand.
//
// Every command runs the way a user's install runs it, in a throwaway home: devcoach is packed
// from this checkout (`npm pack`, the tarball npm publishes) and installed with `npm install -g`
// into an nvm-style Node (`~/.nvm/versions/node/v<x>/`: this Node, hard-linked there), whose
// `bin/` is first on PATH, so `doctor` reports an npm-global install on Node via nvm instead of
// a source checkout. When `claude` is on your PATH it is linked into `~/.local/bin/` (where
// Claude Code's installer puts it) and `devcoach install` registers through `claude mcp add`, as
// on a real machine; it then writes only the throwaway home's `~/.claude.json`. The data is the
// screenshots' fixture with its dates shifted to offsets from today. In the output the throwaway
// home (and the home the demo lessons were recorded in) becomes `~`; nothing else is changed.
//
// `npm run docs:cli-output` builds first, then runs this; macOS or Linux, Node 24+, and the npm
// registry reachable (the tarball's dependencies are installed from it).
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "scripts", "screenshots", "fixture.zip");
const outFile = join(root, "website", "src", "data", "cli-output.json");

const LESSON_ID = "lesson-redis-cache-stampede-001"; // the seed of the active demo course
const COURSE_ID = "from-a-cache-miss-to-a-stampede";
// The demo lessons were recorded in this home (their `folder`): shown as `~` too.
const FIXTURE_HOME = "/home/user";

// ── The demo data, dated from today ─────────────────────────────────────────────────────────
// Copied from scripts/screenshots.mjs (`freshenFixture`), which runs its capture on import and
// so cannot be imported from: keep the two in step.
const DAY = 86_400_000;
const LESSON_AGES_DAYS = [3, 5, 9, 16, 34, 61]; // newest → oldest, in the fixture's own order
const COURSE_AGES_DAYS = {
  "from-a-cache-miss-to-a-stampede": [3, 1],
  "retry-with-exponential-backoff-and-jitter": [20, 12],
};
const stamp = (now, ageDays) =>
  new Date(now - ageDays * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");

function freshenFixture(zipPath, out) {
  const files = unzipSync(readFileSync(zipPath));
  const now = Date.now();
  const lessons = JSON.parse(strFromU8(files["lessons.json"]));
  lessons
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .forEach((lesson, i) => {
      lesson.timestamp = stamp(now, LESSON_AGES_DAYS[Math.min(i, LESSON_AGES_DAYS.length - 1)]);
    });
  files["lessons.json"] = strToU8(JSON.stringify(lessons, null, 2));
  if (files["courses.json"]) {
    const data = JSON.parse(strFromU8(files["courses.json"]));
    for (const course of data.courses) {
      const [created, updated] = COURSE_AGES_DAYS[course.id] ?? [3, 1];
      course.created_at = stamp(now, created);
      course.updated_at = stamp(now, updated);
      if (course.completed_at) course.completed_at = course.updated_at;
      const done = data.steps.filter((s) => s.course_id === course.id && s.done_at);
      done.forEach((s, i) => {
        s.done_at = stamp(now, created - ((created - updated) * (i + 1)) / (done.length + 1));
      });
    }
    files["courses.json"] = strToU8(JSON.stringify(data, null, 2));
  }
  if (files["learning-state.md"]) {
    files["learning-state.md"] = strToU8(
      strFromU8(files["learning-state.md"]).replace(
        /^_Last updated: .*_$/m,
        `_Last updated: ${stamp(now, LESSON_AGES_DAYS[0])}_`,
      ),
    );
  }
  writeFileSync(out, zipSync(files));
}

// ── The install ─────────────────────────────────────────────────────────────────────────────

/** `name` on a PATH string, or null. */
function onPath(name, path = process.env.PATH ?? "") {
  for (const dir of path.split(delimiter)) {
    const candidate = dir && join(dir, name);
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/** npm's own entry script: the npm running this script, the one beside this Node, or PATH's. */
function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const fromPath = onPath("npm");
  if (fromPath) candidates.push(realpathSync(fromPath));
  const found = candidates.find((p) => p?.endsWith("npm-cli.js") && existsSync(p));
  if (!found) throw new Error("npm not found (looked for npm-cli.js beside node and on PATH)");
  return found;
}

/** This Node at `target`: a hard link (same file, no copy), else a copy. */
function placeNode(target) {
  mkdirSync(dirname(target), { recursive: true });
  try {
    linkSync(process.execPath, target);
  } catch {
    copyFileSync(process.execPath, target);
    chmodSync(target, 0o755);
  }
}

// The variables npm may need to reach the registry (proxy, CA); nothing else of this shell.
const NETWORK_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(https?_proxy|no_proxy|node_extra_ca_certs|ssl_cert_file|npm_config_(https?_)?proxy|npm_config_noproxy|npm_config_cafile|npm_config_registry)$/i.test(
      key,
    ),
  ),
);

function install(home, nodeDir) {
  const node = join(nodeDir, "bin", "node");
  const npm = npmCli();
  const env = {
    ...NETWORK_ENV,
    HOME: home,
    PATH: `${join(nodeDir, "bin")}${delimiter}/usr/bin:/bin`,
  };
  const run = (args) =>
    execFileSync(node, [npm, ...args], { cwd: home, env, encoding: "utf8" }).trim();
  const tarball = run(["pack", root, "--ignore-scripts", "--pack-destination", home, "--silent"])
    .split("\n")
    .at(-1);
  try {
    run(["install", "-g", "--prefix", nodeDir, "--no-fund", "--no-audit", join(home, tarball)]);
    console.log(`  installed ${tarball} with npm into ${nodeDir}`);
  } catch (err) {
    // Offline: link the checkout's build instead. doctor then says "source", not "npm-global".
    console.warn(`  npm install failed (${err.message.split("\n")[0]}) — linking dist/bin.js`);
    symlinkSync(join(root, "dist", "bin.js"), join(nodeDir, "bin", "devcoach"));
  }
}

// ── The captures ────────────────────────────────────────────────────────────────────────────
// [key, args]: a page shows `cli.<key>` under the command `devcoach <args>`. In this order: a
// fresh install, then the demo data, then the wiring, so each capture shows the state a reader is
// in at that point. `cwd` is the throwaway home.
const BACKUP_IN = ["Downloads", "devcoach-backup.zip"];
const CAPTURES = [
  ["help", ["--help"]],
  ["doctorNotInstalled", ["doctor"]],
  ["restore", ["restore", `~/${BACKUP_IN.join("/")}`]],
  ["install", ["install"]],
  ["doctor", ["doctor"]],
  ["stats", ["stats"]],
  ["profile", ["profile"]],
  ["lessons", ["lessons"]],
  ["lessonsImported", ["lessons", "--imported"]],
  ["lesson", ["lesson", LESSON_ID]],
  ["courses", ["courses"]],
  ["course", ["course", COURSE_ID]],
  ["settings", ["settings"]],
  ["shareLast", ["share", "--last"]],
  ["backup", ["backup", "devcoach-backup.zip"]],
  ["installGemini", ["install", "--gemini"]],
  ["installCodex", ["install", "--codex"]],
  ["uninstall", ["uninstall"]],
];

function main() {
  const major = Number.parseInt(process.versions.node, 10);
  if (major < 24) throw new Error(`Node ${process.versions.node}: devcoach needs Node 24 or newer`);
  if (!existsSync(join(root, "dist", "bin.js"))) throw new Error("no dist/bin.js: npm run build");

  const home = mkdtempSync(join(tmpdir(), "dc-cli-"));
  const homes = [...new Set([realpathSync(home), home])].sort((a, b) => b.length - a.length);
  const nodeDir = join(home, ".nvm", "versions", "node", `v${process.versions.node}`);
  try {
    console.log(`Installing devcoach into a throwaway home (${home})…`);
    placeNode(join(nodeDir, "bin", "node"));
    install(home, nodeDir);
    const localBin = join(home, ".local", "bin");
    mkdirSync(localBin, { recursive: true });
    const claude = onPath("claude");
    if (claude) symlinkSync(realpathSync(claude), join(localBin, "claude"));
    console.log(
      claude
        ? `  claude found (${claude}): install registers through \`claude mcp add\``
        : "  no claude on PATH: install writes ~/.claude.json itself",
    );
    mkdirSync(join(home, ...BACKUP_IN.slice(0, -1)), { recursive: true });
    freshenFixture(fixture, join(home, ...BACKUP_IN));

    const env = {
      HOME: home,
      PATH: [join(nodeDir, "bin"), localBin, "/usr/bin", "/bin"].join(delimiter),
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
      // Claude Code, when linked: no update check, no telemetry from the throwaway home.
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ...(process.env.TZ ? { TZ: process.env.TZ } : {}),
    };
    const tilde = (text) =>
      homes
        .reduce((s, h) => s.split(h).join("~"), text)
        .split(`${FIXTURE_HOME}/`)
        .join("~/");
    const output = {};
    for (const [key, args] of CAPTURES) {
      // A share name for the share capture, as the screenshots use (the fixture keeps it empty).
      if (key === "shareLast")
        execFileSync("devcoach", ["set", "share_name", "Alex"], {
          cwd: home,
          env,
          stdio: "ignore",
        });
      const real = args.map((a) => (a.startsWith("~/") ? join(home, a.slice(2)) : a));
      const r = spawnSync("devcoach", real, { cwd: home, env, encoding: "utf8" });
      if (r.error) throw r.error;
      output[key] = tilde(`${r.stdout}${r.stderr}`).replace(/\s+$/, "");
      const status = r.status === 0 ? "" : ` (exit ${r.status})`;
      console.log(`  devcoach ${args.join(" ")}${status}`);
      // e.g. `claude mcp add failed:` from a Claude Code that will not run in a bare home
      if (/\bfailed\b/.test(output[key])) console.warn(`    ↳ the output says "failed": read it`);
    }
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Wrote ${outFile} (${Object.keys(output).length} captures).`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
