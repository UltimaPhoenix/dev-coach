// Capture devcoach UI screenshots for the docs (Node + Playwright port of the old take_screenshots.py).
// Flow: restore a demo DB from the fixture into an isolated HOME → start `devcoach ui` → screenshot
// each page in light + dark → docs/screenshots/<name>-<scheme>.png → stop the server.
//
// Requires Playwright + Chromium (the CI workflow installs them; locally: `npm i -D playwright &&
// npx playwright install chromium`). Run after `npm run build`.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "bin.js");
const fixture = join(root, "scripts", "screenshots", "fixture.zip");
const outDir = join(root, "docs", "screenshots");
const PORT = 7862;
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1440, height: 900 };

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

  console.log(`Restoring demo data from ${fixture}…`);
  execFileSync("node", [bin, "restore", fixture], { env, stdio: "inherit" });

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
