// Capture devcoach UI screenshots for the docs (Node + Playwright port of the old take_screenshots.py).
// Flow: restore a demo DB from the fixture into an isolated HOME → start `devcoach ui` → screenshot
// each page in light + dark → docs/screenshots/<name>-<scheme>.png → stop the server.
//
// Requires Playwright + Chromium (the CI workflow installs them; locally: `npm i -D playwright &&
// npx playwright install chromium`). Run after `npm run build`.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "bin.js");
const fixture = join(root, "scripts", "screenshots", "fixture.zip");
const outDir = join(root, "docs", "screenshots");
const PORT = 7862;
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1440, height: 900 };

// The committed fixture keeps static timestamps; the Lessons page renders relative dates
// ("2 months ago"), so we shift them to fixed offsets from *now* at capture time — the
// screenshots then read the same whenever they are regenerated.
const DAY = 86_400_000;
const LESSON_AGES_DAYS = [3, 9, 16, 34, 61]; // newest → oldest, in the fixture's own order

function freshenFixture(zipPath, outDir) {
  const files = unzipSync(readFileSync(zipPath));
  const now = Date.now();
  const lessons = JSON.parse(strFromU8(files["lessons.json"]));
  lessons
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .forEach((lesson, i) => {
      const age = LESSON_AGES_DAYS[Math.min(i, LESSON_AGES_DAYS.length - 1)];
      lesson.timestamp = new Date(now - age * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");
    });
  files["lessons.json"] = strToU8(JSON.stringify(lessons, null, 2));
  if (files["learning-state.md"]) {
    const stamp = new Date(now - LESSON_AGES_DAYS[0] * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");
    files["learning-state.md"] = strToU8(
      strFromU8(files["learning-state.md"]).replace(
        /^_Last updated: .*_$/m,
        `_Last updated: ${stamp}_`,
      ),
    );
  }
  const out = join(outDir, "fixture-now.zip");
  writeFileSync(out, zipSync(files));
  return out;
}

const PAGES = [
  ["knowledge-map", "/"],
  ["lessons", "/lessons"],
  ["settings", "/settings"],
  ["lesson-docker-layer-cache", "/lessons/lesson-docker-layer-cache-001"],
  ["lesson-postgresql-explain-analyze", "/lessons/lesson-postgresql-explain-analyze-001"],
  ["lesson-git-interactive-rebase", "/lessons/lesson-git-interactive-rebase-001"],
  ["lesson-ci-cd-pipeline-stages", "/lessons/lesson-ci-cd-pipeline-stages-001"],
  ["lesson-redis-cache-stampede", "/lessons/lesson-redis-cache-stampede-001"],
];

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function main() {
  const home = mkdtempSync(join(tmpdir(), "dc-shots-"));
  const env = { ...process.env, HOME: home, NO_COLOR: "1" };

  console.log(`Restoring demo data from ${fixture} (timestamps shifted to now)…`);
  execFileSync("node", [bin, "restore", freshenFixture(fixture, home)], { env, stdio: "inherit" });

  console.log(`Starting devcoach UI on ${BASE}…`);
  const server = spawn("node", [bin, "ui", "--port", String(PORT)], { env, stdio: "ignore" });

  try {
    await waitForServer(BASE);
    const { chromium } = await import("playwright");
    mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, colorScheme: scheme });
      const page = await ctx.newPage();
      for (const [name, path] of PAGES) {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        const out = join(outDir, `${name}-${scheme}.png`);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`  saved ${out}`);
      }
      await ctx.close();
    }
    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
