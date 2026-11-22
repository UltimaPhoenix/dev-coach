// Capture devcoach UI screenshots for the docs (Node + Playwright port of the old take_screenshots.py).
// Flow: restore a demo DB from the fixture into an isolated HOME → start `devcoach ui` → screenshot
// each page in light + dark → docs/screenshots/<name>-<scheme>.png → stop the server.
// The fixture also carries two demo courses (courses.json + courses/<id>/index.html, written to
// the contract in assets/references/course.md); their highlighter placeholder is filled by the
// restore, so the zip never holds the library. scripts/docs-clips.mjs records the docs' short
// clips from the same fixture (shared helpers: scripts/lib/docs-capture.mjs).
//
// Requires Playwright + Chromium (the CI workflow installs them; locally: `npm i -D playwright &&
// npx playwright install chromium`) and ffmpeg, which keeps the files small. Run after
// `npm run build`, and after `npm run build --prefix website`: the share page is captured from
// the site build.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import {
  bin,
  hasFfmpeg,
  restoreDemo,
  root,
  shrinkPng,
  startDashboard,
  waitForServer,
} from "./lib/docs-capture.mjs";

const outDir = join(root, "docs", "screenshots");
const PORT = 7862;
const BASE = `http://127.0.0.1:${PORT}`;
// The docs site's share page (website/src/pages/lesson.tsx), served from the site build when one
// exists: it is what a receiver sees when they open a share link.
const SITE_BUILD = join(root, "website", "build");
const SITE_PORT = 7863;
const SITE_BASE_PATH = "/dev-coach";

// Capture geometry. The docs show a screenshot in a text column about 820 px wide (about 360 on a
// phone, where ThemedShot's zoom shows it at full size). So each page is captured at the narrowest
// window that still shows what the guides describe, at twice the pixel density (sharp on a
// high-density screen and in the zoom), and clipped to the page's content: no browser-height
// padding, no empty band under a short table. The widths follow the dashboard's breakpoints
// (Tailwind's sm 640 / lg 1024 / xl 1280 in src/web/views.ts).
const WIDTH = {
  // the lessons table: Topic shows from sm, Categories from lg, Feedback from xl — every column
  // the web dashboard guide lists
  table: 1280,
  // the knowledge map (two columns of topics), Settings (two panels side by side from lg) and the
  // courses list
  page: 1024,
  // a course page: the step list sits beside the document from lg; at 1100 the document's text
  // is about 12 px tall at 820 (a code line longer than the step scrolls, as it does in the app)
  course: 1100,
  // a lesson (and the import preview) reads like an article: short lines, larger text
  lesson: 960,
  // the docs site's share page: its import panel sits beside the lesson from 997 px
  site: 1100,
};
const SCALE = 2;
const VIEWPORT_HEIGHT = 900;

// Lesson-sharing pages: the share popover open on a lesson, the import box open on the list, the
// read-only preview a share link lands on (its code is computed from the fixture at capture time),
// the moment right after an import, and how a shared lesson looks in the log.
const SHARE_LESSON_ID = "lesson-docker-layer-cache-001";
const SHARED_LESSON_ID = "wal-mode-readers"; // the fixture's imported lesson (shared by Ada)
const PAGES = [
  ["knowledge-map", "/knowledge", WIDTH.page],
  ["lessons", "/lessons", WIDTH.table],
  ["lessons-import", "/lessons?import=1", WIDTH.table],
  ["settings", "/settings", WIDTH.page],
  // the popover and the top of the lesson under it (see shareClipBottom)
  ["lesson-share", `/lessons/${SHARE_LESSON_ID}?share=1`, WIDTH.lesson],
  ["lesson-docker-layer-cache", "/lessons/lesson-docker-layer-cache-001", WIDTH.lesson],
  [
    "lesson-postgresql-explain-analyze",
    "/lessons/lesson-postgresql-explain-analyze-001",
    WIDTH.lesson,
  ],
  ["lesson-git-interactive-rebase", "/lessons/lesson-git-interactive-rebase-001", WIDTH.lesson],
  ["lesson-ci-cd-pipeline-stages", "/lessons/lesson-ci-cd-pipeline-stages-001", WIDTH.lesson],
  ["lesson-redis-cache-stampede", "/lessons/lesson-redis-cache-stampede-001", WIDTH.lesson],
  ["lessons-shared", "/lessons?imported=1", WIDTH.table],
  ["lesson-shared", `/lessons/${SHARED_LESSON_ID}`, WIDTH.lesson],
  ["lesson-imported", `/lessons/${SHARED_LESSON_ID}?imported=1`, WIDTH.lesson],
  // Courses: the list, then two course pages on a step with a chart (`?step=` selects the step)
  ["courses", "/courses", WIDTH.page],
  ["course-cache-stampede", "/courses/from-a-cache-miss-to-a-stampede?step=3", WIDTH.course],
  [
    "course-backoff-jitter",
    "/courses/retry-with-exponential-backoff-and-jitter?step=3",
    WIDTH.course,
  ],
];

/** The bottom of the dashboard's content: `<main>` ends with its own padding under the last card. */
const mainBottom = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("main");
    return Math.ceil(main.getBoundingClientRect().bottom + window.scrollY);
  });

/** The share popover's bottom edge, plus a band of the lesson under it for context. */
const shareClipBottom = (page) =>
  page.evaluate(() => {
    let el = document.getElementById("share-payloads");
    while (el && getComputedStyle(el).position !== "absolute") el = el.parentElement;
    if (!el) return null;
    return Math.ceil(el.getBoundingClientRect().bottom + window.scrollY + 96);
  });

// A course page is the document in a sandboxed frame that the viewer sizes from the frame's own
// height reports (course-viewer.js): `networkidle` fires before the frame has grown, so wait for
// the viewer to have set a height above its 320 px floor, then let the document settle. The
// frame is out-of-process (opaque origin), and Chromium's full-page capture paints such frames
// only within the original viewport — so the viewport is sized to the page and the capture is a
// plain one (observed: the document cut off ~270 px below the viewport with `fullPage`).
async function captureCoursePage(page, out, width) {
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("course-frame");
      return frame !== null && Number.parseInt(frame.style.height, 10) > 320;
    },
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: false });
}

// A static server for the site build under its base path — enough for the share page and its
// assets (Docusaurus writes `lesson.html` for `/lesson`).
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
function serveSite(dir, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let path = url.pathname.startsWith(`${SITE_BASE_PATH}/`)
      ? url.pathname.slice(SITE_BASE_PATH.length)
      : url.pathname;
    path = normalize(path).replace(/^(\.\.[/\\])+/, "");
    const candidates = [join(dir, path), join(dir, `${path}.html`), join(dir, path, "index.html")];
    const file = candidates.find((f) => f.startsWith(dir) && existsSync(f) && !f.endsWith("/"));
    if (!file || !extname(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

// The share page decodes the code client-side, then probes the dashboard: wait for the decoded
// title and for the probe's answer (the stubbed /ping says "up"), and match the site's theme to
// the capture scheme (Docusaurus keeps its own toggle, seeded from the OS preference). The capture
// ends with the page's own content: the site footer is not part of what the receiver reads.
async function captureSharePage(page, out, scheme, width) {
  await page.waitForSelector("h1", { timeout: 15_000 });
  await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);
  await page
    .waitForFunction(
      () => /Add to my lessons|Import into my devcoach/.test(document.body.innerText),
      { timeout: 15_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
  const bottom = await page.evaluate(() => {
    const main = document.querySelector("main");
    const margin = Number.parseFloat(getComputedStyle(main).marginTop) || 0;
    return Math.ceil(main.getBoundingClientRect().bottom + window.scrollY + margin);
  });
  await page.screenshot({ path: out, fullPage: true, clip: { x: 0, y: 0, width, height: bottom } });
}

async function main() {
  const home = mkdtempSync(join(tmpdir(), "dc-shots-"));
  console.log("Restoring the demo data (timestamps shifted to now)…");
  const env = restoreDemo(home);
  // A stable sender name for the share screenshots (the fixture keeps the product default: empty).
  execFileSync("node", [bin, "set", "share_name", "Alex"], { env, stdio: "ignore" });
  const shrink = hasFfmpeg();
  if (!shrink) console.warn("  (no ffmpeg on the PATH — the PNGs are saved as captured, larger)");

  console.log(`Starting devcoach UI on ${BASE}…`);
  const server = startDashboard(env, PORT);

  try {
    await waitForServer(BASE);
    const shareText = await (
      await fetch(`${BASE}/lessons/${SHARE_LESSON_ID}/share?format=text`)
    ).text();
    const shareCode = shareText.trim().split("\n").at(-1);
    const pages = [
      ...PAGES,
      [
        "lesson-import-preview",
        `/lessons/import?code=${encodeURIComponent(shareCode)}`,
        WIDTH.lesson,
      ],
    ];
    // The share page from the site build: the dashboard probe is answered by a stub (the real
    // one is CORS-locked to the docs origin), so the page shows its "dashboard running" state.
    let site = null;
    if (existsSync(join(SITE_BUILD, "lesson.html"))) {
      site = serveSite(SITE_BUILD, SITE_PORT);
      pages.push([
        "lesson-link-page",
        `http://127.0.0.1:${SITE_PORT}${SITE_BASE_PATH}/lesson#${shareCode}`,
        WIDTH.site,
      ]);
    } else {
      console.warn(
        "  (no website/build — skipping the share-page capture; run `npm run build --prefix website`)",
      );
    }
    const { chromium } = await import("playwright");
    mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: WIDTH.page, height: VIEWPORT_HEIGHT },
        deviceScaleFactor: SCALE,
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      await page.route(/\/ping(\?|$)/, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: '{"ok":true}',
        }),
      );
      for (const [name, path, width] of pages) {
        // The layout follows the window: size it before the page loads.
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        const url = path.startsWith("http") ? path : `${BASE}${path}`;
        await page.goto(url, { waitUntil: "networkidle" });
        const out = join(outDir, `${name}-${scheme}.png`);
        if (path.startsWith("/courses/")) await captureCoursePage(page, out, width);
        else if (name === "lesson-link-page") await captureSharePage(page, out, scheme, width);
        else {
          const bottom =
            (name === "lesson-share" && (await shareClipBottom(page))) || (await mainBottom(page));
          await page.screenshot({
            path: out,
            fullPage: true,
            clip: { x: 0, y: 0, width, height: bottom },
          });
        }
        if (shrink) shrinkPng(out);
        console.log(`  saved ${out}`);
      }
      await ctx.close();
    }
    await browser.close();
    site?.close();
  } finally {
    server.kill("SIGTERM");
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
