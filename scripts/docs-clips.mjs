// Record the docs' short clips of the dashboard: docs/clips/<name>.{mp4,webm,png}.
// Same sandbox and fixture as scripts/screenshots.mjs (dates moved to "now"): each clip restores
// the demo data into its own isolated HOME, starts the real `devcoach ui`, and drives it with
// Playwright. Nothing is staged in the page: the clicks, keys and requests are the product's own.
//
// A clip is a storyboard, not a screen grab in real time: every frame is a screenshot taken when
// the page has settled, held for a set time, then the frames are encoded with ffmpeg. So each run
// tells the same story at the same pace, whatever the machine. Playwright records no pointer: a
// small cursor (and a ring on each click) is drawn in the page, above everything, from the
// script's own pointer position.
//
// Output per clip: an H.264 .mp4 (yuv420p, no audio, +faststart), a VP9 .webm and a poster .png
// (the clip's most telling frame), all 1640 px wide: twice the docs column, sharp on a
// high-density screen. Show one with the Clip component (website/src/components/Clip).
//
// Requires Playwright + Chromium (like scripts/screenshots.mjs) and ffmpeg on the PATH.
// Run after `npm run build` (`npm run docs:clips` does both).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bin,
  restoreDemo,
  root,
  shrinkPng,
  startDashboard,
  waitForServer,
} from "./lib/docs-capture.mjs";

const OUT_DIR = join(root, "docs", "clips");
const PORT = 7865;
const BASE = `http://127.0.0.1:${PORT}`;
const SCALE = 2; // captured at twice the density, then scaled to OUT_WIDTH
const OUT_WIDTH = 1640; // the docs column is about 820 px wide
const FPS = 25;
const STEP = 1000 / FPS; // one frame of movement
const RING_FRAMES = 6; // a click's ring grows and fades over this many frames

// The cursor layer: an arrow and a ring, fixed above the page, never in the way of the pointer.
// Positioned by the script (window.__dcCursor / __dcRing), so every frame is exact.
const CURSOR = `(() => {
  if (window.top !== window) return;
  const mount = () => {
    if (document.getElementById("dc-cursor")) return;
    const layer = document.createElement("div");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    layer.innerHTML =
      '<div id="dc-ring" style="position:absolute;left:0;top:0;border-radius:50%;border:3px solid #5eead4;opacity:0"></div>' +
      '<svg id="dc-cursor" width="26" height="26" viewBox="0 0 26 26" style="position:absolute;left:0;top:0;display:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">' +
      '<path d="M4 3v18l4.6-4.4 3.3 7.2 3.2-1.5-3.2-7h6.6Z" fill="#fff" stroke="#17181b" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(layer);
  };
  window.__dcCursor = (x, y) => {
    mount();
    const c = document.getElementById("dc-cursor");
    c.style.display = "block";
    c.style.transform = "translate(" + (x - 4) + "px," + (y - 3) + "px)";
  };
  window.__dcRing = (x, y, p) => {
    mount();
    const r = document.getElementById("dc-ring");
    if (p < 0) { r.style.opacity = "0"; return; }
    const d = 10 + 34 * p;
    r.style.width = r.style.height = d + "px";
    r.style.transform = "translate(" + (x - d / 2 - 3) + "px," + (y - d / 2 - 3) + "px)";
    r.style.opacity = String(0.95 * (1 - 0.85 * p));
  };
})();`;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The storyboard of one clip: frames (screenshots) with how long each one stays on screen. */
function storyboard(page, dir, start) {
  const frames = [];
  let pointer = { ...start };
  let poster = null;

  const shoot = async (ms) => {
    await page.evaluate(({ x, y }) => window.__dcCursor?.(x, y), pointer);
    const file = join(dir, `f${String(frames.length).padStart(4, "0")}.png`);
    // Transitions are fast-forwarded: each frame is a settled state, the hold sets the pace.
    await page.screenshot({ path: file, animations: "disabled" });
    frames.push({ file, ms });
  };

  const center = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Not on screen: ${locator}`);
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  };

  const r = {
    /** Keep what is on screen for `ms`. */
    hold: (ms) => shoot(ms),
    /** The frame just taken is the poster. */
    poster: () => {
      poster = frames.at(-1).file;
    },
    /** Glide the pointer to a point or an element, at a pace the eye can follow. */
    async glide(target, ms = 700) {
      const to = typeof target.x === "number" ? target : await center(target);
      const from = { ...pointer };
      const steps = Math.max(2, Math.round(ms / STEP));
      for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps);
        pointer = {
          x: Math.round(from.x + (to.x - from.x) * t),
          y: Math.round(from.y + (to.y - from.y) * t),
        };
        await page.mouse.move(pointer.x, pointer.y);
        await shoot(STEP);
      }
    },
    /** A ring at the pointer, then the real click there; `settle` waits for what it starts. */
    async click(settle = () => page.waitForTimeout(250)) {
      for (let i = 1; i <= RING_FRAMES; i++) {
        await page.evaluate(
          ([x, y, p]) => window.__dcRing?.(x, y, p),
          [pointer.x, pointer.y, i / RING_FRAMES],
        );
        await shoot(STEP);
      }
      await page.evaluate(() => window.__dcRing?.(0, 0, -1));
      await page.mouse.click(pointer.x, pointer.y);
      await settle();
    },
    /** Type into the focused field, one key per frame. */
    async type(text, perKey = 110) {
      for (const key of text) {
        await page.keyboard.type(key);
        await shoot(perKey);
      }
    },
    /** Scroll the page to `y` smoothly (the pointer stays where it is). */
    async scrollTo(y, ms = 1000) {
      const from = await page.evaluate(() => window.scrollY);
      const steps = Math.max(2, Math.round(ms / STEP));
      for (let i = 1; i <= steps; i++) {
        const top = Math.round(from + (y - from) * ease(i / steps));
        await page.evaluate((t) => window.scrollTo({ top: t, behavior: "instant" }), top);
        await shoot(STEP);
      }
    },
    center,
    get frames() {
      return frames;
    },
    get posterFile() {
      return poster ?? frames.at(-1).file;
    },
  };
  return r;
}

const loaded = (page) => page.waitForLoadState("networkidle").then(() => page.waitForTimeout(300));

// ── The clips ────────────────────────────────────────────────────────────────────────────────
// Viewports follow scripts/screenshots.mjs: 1280 shows every column of the lessons table, 1024 the
// knowledge map's two columns, 1100 a course page with its step list, 960 a lesson. The pointer
// starts and ends on an empty spot, so the first and last frames show no hover state.
const CLIPS = [
  {
    name: "lessons-find",
    viewport: { width: 1280, height: 720 },
    path: "/lessons",
    start: { x: 1000, y: 690 },
    async play(page, r) {
      await r.hold(1000);
      await r.glide(page.getByPlaceholder("Search lessons…"), 800);
      await r.click();
      await r.type("cache");
      await r.hold(400);
      await page.keyboard.press("Enter");
      await loaded(page);
      await r.hold(1100);
      // A level pill in a row is a filter: the senior ones among the matches.
      const row = page.locator("tr[data-id='lesson-redis-cache-stampede-001']");
      await r.glide(row.getByRole("link", { name: "senior", exact: true }), 900);
      await r.click(() => loaded(page));
      await r.hold(1200);
      r.poster();
      await r.glide(row.getByRole("link", { name: /Cache stampede/ }), 800);
      await r.click(() => loaded(page));
      await r.hold(1600);
    },
  },
  {
    name: "lesson-feedback",
    viewport: { width: 960, height: 600 },
    path: "/lessons/lesson-docker-layer-cache-001",
    start: { x: 640, y: 330 },
    // The answer buttons close the lesson; the answer shows at its top, next to the date.
    async play(page, r) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
      await r.hold(1400);
      await r.glide(page.getByRole("button", { name: "💡 Understood" }), 800);
      await r.click(() =>
        page
          .locator("#lesson-meta", { hasText: "💡 Understood" })
          .waitFor()
          .then(() => page.waitForTimeout(250)),
      );
      await r.hold(1000);
      await r.scrollTo(0, 1100);
      await r.glide(page.locator("#lesson-meta").getByText("💡 Understood"), 700);
      await r.hold(1900);
    },
  },
  {
    name: "knowledge-edit",
    viewport: { width: 1024, height: 640 },
    path: "/knowledge",
    start: { x: 720, y: 165 },
    async play(page, r) {
      await r.hold(1000);
      await r.glide(page.getByRole("button", { name: /Edit/ }), 800);
      await r.click();
      await r.hold(900);
      const django = page.locator("#topic-row-django");
      await r.glide(django.getByRole("button", { name: "+", exact: true }), 900);
      await r.click(() =>
        page
          .locator("#topic-row-django", { hasText: "4" })
          .waitFor()
          .then(() => page.waitForTimeout(250)),
      );
      await r.hold(1100);
      r.poster();
      await r.glide(page.getByRole("button", { name: /Done/ }), 900);
      await r.click();
      await r.glide({ x: 720, y: 165 }, 600);
      await r.hold(1600);
    },
  },
  {
    name: "course-steps",
    viewport: { width: 1100, height: 720 },
    path: "/courses/from-a-cache-miss-to-a-stampede?step=1",
    start: { x: 620, y: 520 },
    async play(page, r) {
      const frameReady = (anchor) =>
        page
          .waitForFunction(
            (a) =>
              document.querySelector(`#course-steps li[data-anchor="${a}"] [data-step-actions]`) &&
              !document
                .querySelector(`#course-steps li[data-anchor="${a}"] [data-step-actions]`)
                .classList.contains("hidden"),
            anchor,
          )
          .then(() => page.waitForTimeout(700));
      await frameReady("step-1");
      await r.hold(1100);
      const step = (n) => page.locator(`#course-steps a[data-anchor="step-${n}"]`);
      await r.glide(step(2), 800);
      await r.click(() => frameReady("step-2"));
      await r.hold(1100);
      await r.glide(step(3), 600);
      await r.click(() => frameReady("step-3"));
      await r.hold(1100);
      await r.glide(
        page.locator('#course-steps li[data-anchor="step-3"]').getByRole("button", {
          name: "✓ Mark done",
        }),
        700,
      );
      await r.click(() => loaded(page).then(() => frameReady("step-3")));
      await r.hold(1800);
    },
  },
  {
    name: "share-lesson",
    viewport: { width: 1280, height: 720 },
    path: "/lessons",
    start: { x: 700, y: 690 },
    setup: (env) => execFileSync("node", [bin, "set", "share_name", "Alex"], { env }),
    async play(page, r) {
      await r.hold(900);
      const row = page.locator("tr[data-id='lesson-docker-layer-cache-001']");
      await r.glide(row.getByRole("link", { name: /Docker layer caching/ }), 800);
      await r.hold(300);
      await r.glide(row.getByRole("button", { name: "Share this lesson" }), 800);
      await r.click(() =>
        page
          .locator("#share-payloads")
          .waitFor()
          .then(() => page.waitForTimeout(250)),
      );
      await r.hold(900);
      const panel = page.getByRole("dialog", { name: "Share this lesson" });
      await r.glide(panel.getByLabel("Your name"), 700);
      await r.hold(500);
      await r.glide(panel.getByText("Include where it happened"), 700);
      await r.hold(700);
      await r.glide(panel.getByRole("button", { name: "🔗 Copy link" }), 700);
      await r.click(() =>
        panel
          .getByRole("button", { name: "✓ Copied" })
          .waitFor()
          .then(() => page.waitForTimeout(50)),
      );
      await r.hold(1500);
      r.poster();
    },
  },
  {
    name: "import-lesson",
    viewport: { width: 1280, height: 720 },
    path: "/lessons",
    start: { x: 1000, y: 690 },
    // A teammate's devcoach (its own sandbox, named Sam) shares a lesson with the real CLI; this
    // one does not have that lesson yet, so the import adds it rather than a second copy.
    setup(env) {
      const teammate = { ...env, HOME: mkdtempSync(join(tmpdir(), "dc-clip-sam-")) };
      teammate.USERPROFILE = teammate.HOME;
      restoreDemo(teammate.HOME);
      const text = execFileSync(
        "node",
        [bin, "share", "lesson-ci-cd-pipeline-stages-001", "--by", "Sam"],
        { env: teammate, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      rmSync(teammate.HOME, { recursive: true, force: true });
      execFileSync("node", [bin, "delete", "lesson-ci-cd-pipeline-stages-001"], {
        env,
        stdio: "ignore",
      });
      return { code: text.trim().split("\n").at(-1) };
    },
    async play(page, r, { code }) {
      await r.hold(1000);
      await r.glide(page.getByTitle("Import a lesson someone shared"), 900);
      await r.click(() => page.waitForTimeout(300));
      await r.hold(500);
      // A real paste: the code goes on the clipboard, then Ctrl+V in the box.
      await page.evaluate((text) => navigator.clipboard.writeText(text), code);
      await page.keyboard.press("ControlOrMeta+V");
      await page.waitForFunction(() => document.querySelector("textarea[name=text]")?.value);
      await r.hold(900);
      await r.glide(page.getByRole("button", { name: "Import", exact: true }), 700);
      await r.click(() => loaded(page));
      await r.hold(1700);
      await r.glide(page.getByRole("link", { name: "← Back to lessons" }), 900);
      await r.click(() => loaded(page));
      await r.glide(
        page.locator("tr[data-id='lesson-ci-cd-pipeline-stages-001']").getByText("🤝 Sam"),
        900,
      );
      await r.hold(1800);
      r.poster();
    },
  },
];

function encode(frames, dir, name, poster) {
  // The concat list holds each frame for its time; ffmpeg turns it into a steady 25 fps.
  const list = join(dir, "frames.txt");
  const lines = ["ffconcat version 1.0"];
  for (const f of frames) lines.push(`file '${f.file}'`, `duration ${(f.ms / 1000).toFixed(3)}`);
  lines.push(`file '${frames.at(-1).file}'`); // the last duration only counts with a next entry
  writeFileSync(list, `${lines.join("\n")}\n`);
  const input = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list];
  const vf = `fps=${FPS},scale=${OUT_WIDTH}:-2:flags=lanczos,format=yuv420p`;
  const mp4 = join(OUT_DIR, `${name}.mp4`);
  const webm = join(OUT_DIR, `${name}.webm`);
  const png = join(OUT_DIR, `${name}.png`);
  execFileSync("ffmpeg", [
    ...input,
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryslow",
    // level 4.1 keeps the reference frames within what phones decode in hardware
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-tune",
    "animation",
    "-crf",
    "26",
    "-g",
    "250",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  execFileSync("ffmpeg", [
    ...input,
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "40",
    "-b:v",
    "0",
    "-g",
    "250",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "1",
    // no random segment id in the container: the same frames give the same file
    "-fflags",
    "+bitexact",
    webm,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    poster,
    "-vf",
    `scale=${OUT_WIDTH}:-2:flags=lanczos`,
    png,
  ]);
  shrinkPng(png);
  const seconds = frames.reduce((sum, f) => sum + f.ms, 0) / 1000;
  const kb = (file) => `${Math.round(statSync(file).size / 1024)} KB`;
  console.log(
    `  ${name}: ${seconds.toFixed(1)} s · mp4 ${kb(mp4)} · webm ${kb(webm)} · poster ${kb(png)}`,
  );
}

async function record(browser, clip) {
  const home = mkdtempSync(join(tmpdir(), `dc-clip-${clip.name}-`));
  const frames = mkdtempSync(join(tmpdir(), `dc-frames-${clip.name}-`));
  const env = restoreDemo(home);
  const extra = clip.setup?.(env) ?? {};
  const server = startDashboard(env, PORT);
  try {
    await waitForServer(BASE);
    const ctx = await browser.newContext({
      viewport: clip.viewport,
      deviceScaleFactor: SCALE,
      colorScheme: "dark",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await ctx.addInitScript(CURSOR);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${clip.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.mouse.move(clip.start.x, clip.start.y);
    const r = storyboard(page, frames, clip.start);
    await clip.play(page, r, extra);
    await ctx.close();
    const { width, height } = clip.viewport;
    console.log(`  ${clip.name}: ${r.frames.length} frames at ${width}×${height}`);
    encode(r.frames, frames, clip.name, r.posterFile);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
    }
    rmSync(frames, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

async function main() {
  const only = process.argv.slice(2);
  const clips = only.length ? CLIPS.filter((c) => only.includes(c.name)) : CLIPS;
  if (!clips.length) throw new Error(`No such clip. Clips: ${CLIPS.map((c) => c.name).join(", ")}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const clip of clips) {
      console.log(`Recording ${clip.name}…`);
      await record(browser, clip);
    }
  } finally {
    await browser.close();
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
