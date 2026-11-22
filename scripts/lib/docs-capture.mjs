// Shared by the docs captures (scripts/screenshots.mjs, scripts/docs-clips.mjs): the demo data
// with its dates moved to "now", a sandboxed dashboard, and a PNG made small without visible loss.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const bin = join(root, "dist", "bin.js");
export const fixture = join(root, "scripts", "screenshots", "fixture.zip");

// The committed fixture keeps static timestamps; the Lessons page renders relative dates
// ("2 months ago"), so we shift them to fixed offsets from *now* at capture time — the
// screenshots then read the same whenever they are regenerated.
const DAY = 86_400_000;
const LESSON_AGES_DAYS = [3, 5, 9, 16, 34, 61]; // newest → oldest, in the fixture's own order
// Courses: [created, updated] ages in days — the active one is recent, the completed one older.
const COURSE_AGES_DAYS = {
  "from-a-cache-miss-to-a-stampede": [3, 1],
  "retry-with-exponential-backoff-and-jitter": [20, 12],
};
const stamp = (now, ageDays) =>
  new Date(now - ageDays * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");

/** The fixture with its dates moved to fixed ages from now, written as `<outDir>/fixture-now.zip`. */
export function freshenFixture(zipPath, outDir) {
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

/** Restore the freshened fixture into `home` (an isolated HOME) and return its environment. */
export function restoreDemo(home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1" };
  execFileSync("node", [bin, "restore", freshenFixture(fixture, home)], { env, stdio: "ignore" });
  return env;
}

/** `devcoach ui` on `port` for the sandbox `env`; stop it with `.kill("SIGTERM")`. */
export function startDashboard(env, port) {
  return spawn("node", [bin, "ui", "--port", String(port)], { env, stdio: "ignore" });
}

export async function waitForServer(url, timeoutMs = 30_000) {
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

export function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * A screenshot as an 8-bit palette PNG: a dashboard page has few colours, so 256 picked from the
 * image itself (no dithering: flat colours stay flat, text keeps its edges) look the same at a
 * third of the size. ffmpeg writes no metadata chunks. The original is kept when it is smaller.
 */
export function shrinkPng(file) {
  const tmp = `${file}.pal.png`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    file,
    "-vf",
    "split[a][b];[a]palettegen=max_colors=256:reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none",
    "-pix_fmt",
    "pal8",
    "-compression_level",
    "9",
    tmp,
  ]);
  if (statSync(tmp).size < statSync(file).size) renameSync(tmp, file);
  else rmSync(tmp);
}
