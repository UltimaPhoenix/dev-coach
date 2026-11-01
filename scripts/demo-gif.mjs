// Record the docs home's terminal demo (website/src/components/LessonLoop) as the README's GIF:
// docs/screenshots/lesson-loop.gif. Serves the site build under its base path, freezes the page
// clock and steps it frame by frame, so the GIF plays exactly what the component renders, at real
// speed, the same on every run. Run after `npm run build --prefix website`.
//
// Requires Playwright + Chromium (like scripts/screenshots.mjs) and ffmpeg on the PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_BUILD = join(root, "website", "build");
const OUT = join(root, "docs", "screenshots", "lesson-loop.gif");
const BASE_PATH = "/dev-coach";
const PORT = 7864;
const FPS = 10;
const DURATION_MS = 14_500; // the loop's last line lands at 11.7 s; hold the final frame a while
const OUT_WIDTH = 800;
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function serveSite(dir, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let path = url.pathname.startsWith(`${BASE_PATH}/`)
      ? url.pathname.slice(BASE_PATH.length)
      : url.pathname;
    path = normalize(path).replace(/^(\.\.[/\\])+/, "");
    const candidates = [join(dir, path), join(dir, `${path}.html`), join(dir, path, "index.html")];
    const file = candidates.find((f) => f.startsWith(dir) && existsSync(f) && extname(f));
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

async function main() {
  if (!existsSync(join(SITE_BUILD, "index.html"))) {
    throw new Error("No website/build — run `npm run build --prefix website` first.");
  }
  const server = serveSite(SITE_BUILD, PORT);
  const frames = mkdtempSync(join(tmpdir(), "dc-gif-"));
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      colorScheme: "dark",
      deviceScaleFactor: 2,
    });
    // Frozen clock: the component's timer and performance.now() only move when we step them.
    await page.clock.install({ time: new Date("2026-01-01T09:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T09:00:01Z"));
    await page.goto(`http://127.0.0.1:${PORT}${BASE_PATH}/`, { waitUntil: "networkidle" });
    // The Pause button means nothing in a GIF.
    await page.addStyleTag({ content: "figure button { visibility: hidden; }" });
    const terminal = page.locator("figure", { hasText: "claude — ~/shop-api" }).first();
    await terminal.scrollIntoViewIfNeeded();
    await page.clock.runFor(50);
    const step = Math.round(1000 / FPS);
    for (let i = 0; i * step < DURATION_MS; i++) {
      await terminal.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.png`) });
      await page.clock.runFor(step);
    }
  } finally {
    await browser.close();
    server.close();
  }
  mkdirSync(dirname(OUT), { recursive: true });
  // One palette for the whole clip (the terminal's colours), only changed rectangles re-encoded.
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(FPS),
    "-i",
    join(frames, "f%04d.png"),
    "-vf",
    `scale=${OUT_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    OUT,
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
