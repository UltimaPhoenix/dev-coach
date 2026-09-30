// Capture devcoach UI screenshots for the docs (Node + Playwright port of the old take_screenshots.py).
// Flow: restore a demo DB from the fixture into an isolated HOME → start `devcoach ui` → screenshot
// each page in light + dark → docs/screenshots/<name>-<scheme>.png → stop the server.
// The fixture also carries two demo courses (courses.json + courses/<id>/index.html, written to
// the contract in assets/references/course.md); their highlighter placeholder is filled by the
// restore, so the zip never holds the library.
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
// Courses: [created, updated] ages in days — the active one is recent, the completed one older.
const COURSE_AGES_DAYS = {
  "from-a-cache-miss-to-a-stampede": [3, 1],
  "retry-with-exponential-backoff-and-jitter": [20, 12],
};
const stamp = (now, ageDays) =>
  new Date(now - ageDays * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");

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
  if (files["courses.json"]) {
    const data = JSON.parse(strFromU8(files["courses.json"]));
    for (const course of data.courses) {
      const [created, updated] = COURSE_AGES_DAYS[course.id] ?? [3, 1];
      course.created_at = stamp(now, created);
      course.updated_at = stamp(now, updated);
      if (course.completed_at) course.completed_at = course.updated_at;
      const done = data.steps.filter((s) => s.course_id === course.id && s.done_at);
      done.forEach((s, i) => {
        // done steps spread evenly between creation and the last update
        s.done_at = stamp(now, created - ((created - updated) * (i + 1)) / (done.length + 1));
      });
    }
    files["courses.json"] = strToU8(JSON.stringify(data, null, 2));
  }
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

// Lesson-sharing pages: the share popover open on a lesson, the import box open on the list, and
// the read-only preview a share link lands on (its code is computed from the fixture at capture time).
const SHARE_LESSON_ID = "lesson-docker-layer-cache-001";
const PAGES = [
  ["knowledge-map", "/knowledge"],
  ["lessons", "/lessons"],
  ["lessons-import", "/lessons?import=1"],
  ["settings", "/settings"],
  ["lesson-share", `/lessons/${SHARE_LESSON_ID}?share=1`],
  ["lesson-docker-layer-cache", "/lessons/lesson-docker-layer-cache-001"],
  ["lesson-postgresql-explain-analyze", "/lessons/lesson-postgresql-explain-analyze-001"],
  ["lesson-git-interactive-rebase", "/lessons/lesson-git-interactive-rebase-001"],
  ["lesson-ci-cd-pipeline-stages", "/lessons/lesson-ci-cd-pipeline-stages-001"],
  ["lesson-redis-cache-stampede", "/lessons/lesson-redis-cache-stampede-001"],
  // Courses: the list, then two course pages on a step with a chart (`?step=` selects the step)
  ["courses", "/courses"],
  ["course-cache-stampede", "/courses/from-a-cache-miss-to-a-stampede?step=3"],
  ["course-backoff-jitter", "/courses/retry-with-exponential-backoff-and-jitter?step=3"],
];

// A course page is the document in a sandboxed frame that the viewer sizes from the frame's own
// height reports (course-viewer.js): `networkidle` fires before the frame has grown, so wait for
// the viewer to have set a height above its 320 px floor, then let the document settle. The
// frame is out-of-process (opaque origin), and Chromium's full-page capture paints such frames
// only within the original viewport — so the viewport is sized to the page and the capture is a
// plain one (observed: the document cut off ~270 px below the viewport with `fullPage`).
async function captureCoursePage(page, out) {
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("course-frame");
      return frame !== null && Number.parseInt(frame.style.height, 10) > 320;
    },
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: VIEWPORT.width, height });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: false });
  await page.setViewportSize(VIEWPORT);
}

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
  // A stable sender name for the share screenshots (the fixture keeps the product default: empty).
  execFileSync("node", [bin, "set", "share_name", "Alex"], { env, stdio: "ignore" });

  console.log(`Starting devcoach UI on ${BASE}…`);
  const server = spawn("node", [bin, "ui", "--port", String(PORT)], { env, stdio: "ignore" });

  try {
    await waitForServer(BASE);
    const shareText = await (
      await fetch(`${BASE}/lessons/${SHARE_LESSON_ID}/share?format=text`)
    ).text();
    const shareCode = shareText.trim().split("\n").at(-1);
    const pages = [
      ...PAGES,
      ["lesson-import-preview", `/lessons/import?code=${encodeURIComponent(shareCode)}`],
    ];
    const { chromium } = await import("playwright");
    mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, colorScheme: scheme });
      const page = await ctx.newPage();
      for (const [name, path] of pages) {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        const out = join(outDir, `${name}-${scheme}.png`);
        if (path.startsWith("/courses/")) await captureCoursePage(page, out);
        else await page.screenshot({ path: out, fullPage: true });
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
