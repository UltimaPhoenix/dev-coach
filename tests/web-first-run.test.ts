// First run and empty states, from a brand-new sandbox. A file of its own because tests/setup.ts
// gives every test file its own HOME, and web.test.ts seeds a lesson for all of its tests.
// The tests run in order: empty → settings change → topics, no lesson → the first lesson.
import { describe, expect, it } from "vitest";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";
import type { Channel } from "../src/core/runtime";
import { createApp } from "../src/web/app";

const apps = new Map<Channel | "default", ReturnType<typeof createApp>>();
function appFor(channel: Channel | "default") {
  let app = apps.get(channel);
  if (!app) {
    app = createApp(channel === "default" ? {} : { channel });
    apps.set(channel, app);
  }
  return app;
}
const page = async (path: string, channel: Channel | "default" = "default") =>
  (await appFor(channel).fetch(new Request(`http://localhost${path}`))).text();
const post = (path: string, fields: Record<string, string>) =>
  appFor("default").fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: new URLSearchParams(fields),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
  );
const setPacing = (max: number, gap: number) =>
  post("/settings", { max_per_day: String(max), min_gap_minutes: String(gap) });

/** The markup of one element, from its opening tag to the matching close. */
function element(html: string, id: string, tag: string): string {
  const start = html.indexOf(`<${tag} id="${id}"`);
  expect(start, `#${id}`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf(`</${tag}>`, start) + tag.length + 3);
}

/** The text with every `<span data-plugin-hint>…</span>` (nested spans included) cut out. */
function withoutPluginHints(html: string): { rest: string; hints: string[] } {
  const open = "<span data-plugin-hint>";
  const hints: string[] = [];
  let rest = html;
  for (let at = rest.indexOf(open); at > -1; at = rest.indexOf(open)) {
    let depth = 0;
    let i = at;
    do {
      const nextOpen = rest.indexOf("<span", i + 1);
      const nextClose = rest.indexOf("</span>", i + 1);
      if (nextOpen > -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen;
      } else {
        depth--;
        i = nextClose;
      }
    } while (depth >= 0);
    const end = i + "</span>".length;
    hints.push(rest.slice(at, end));
    rest = rest.slice(0, at) + rest.slice(end);
  }
  return { rest, hints };
}

describe("first run: a brand-new sandbox", () => {
  it("/knowledge shows the set-up block instead of an empty map and a row of zeros", async () => {
    const html = await page("/knowledge");
    const block = element(html, "first-run", "section");
    expect(block).toContain("Set up devcoach");
    expect(block).toContain("“set up devcoach”</em> to your agent");
    expect(block).toContain("/devcoach:setup");
    expect(block).toContain("at most 2 a day, 4 hours apart");
    // Tests run from the source tree: no `devcoach` on the PATH to point at.
    expect(block).toContain("npx -y devcoach doctor");
    expect(block).toContain('data-copy="npx -y devcoach doctor"');
    expect(html).not.toContain("lessons total");
    expect(html).not.toContain("Available now");
    expect(html).not.toContain('id="no-lesson-yet"');
  });

  it("/lessons shows the ghost lesson, the doctor command and the pacing, not a filter message", async () => {
    const html = await page("/lessons");
    const empty = element(html, "lessons-empty", "section");
    expect(empty).toContain("No lessons yet");
    expect(empty).toContain("What a lesson looks like");
    expect(empty).toContain("busy_timeout: SQLite has no lock queue");
    expect(empty).toContain("💡 <em>Senior tip:</em>");
    expect(empty).toContain("First, set up your profile.");
    expect(empty).toContain("npx -y devcoach doctor");
    expect(empty).toContain(
      "Pacing: at most 2 lessons a day, 4 hours apart, and only after real work.",
    );
    expect(empty).toContain('href="/settings"');
    expect(html).not.toContain("No lessons match");
    expect(html).not.toContain('id="lessons-filtered-empty"');
  });

  it("the pacing sentence reads the settings", async () => {
    await setPacing(3, 90);
    expect(await page("/lessons")).toContain("at most 3 lessons a day, 1 hour 30 minutes apart");
    expect(await page("/knowledge")).toContain("at most 3 a day, 1 hour 30 minutes apart");
    await setPacing(1, 45);
    expect(await page("/lessons")).toContain("at most 1 lesson a day, 45 minutes apart");
    await setPacing(5, 0); // no cooldown: no "apart" at all
    const html = await page("/lessons");
    expect(html).toContain("Pacing: at most 5 lessons a day, and only after real work.");
    expect(html).not.toContain(" apart");
    await setPacing(2, 60);
    expect(await page("/knowledge")).toContain("at most 2 a day, 1 hour apart");
    await setPacing(2, 240);
  });

  it("the diagnostic follows the install channel", async () => {
    for (const path of ["/knowledge", "/lessons"]) {
      const brew = await page(path, "homebrew");
      expect(brew).toContain('data-copy="devcoach doctor"');
      expect(brew).not.toContain("npx -y devcoach doctor");
      expect(await page(path, "npm-global")).toContain('data-copy="devcoach doctor"');
      expect(await page(path, "claude-desktop-extension")).toContain(
        'data-copy="npx -y devcoach doctor"',
      );
      const plugin = await page(path, "claude-plugin");
      expect(plugin).toContain('data-copy="/devcoach:setup"');
      expect(plugin).toContain("it checks the runtime, the server and your profile");
      expect(plugin).not.toContain("devcoach doctor");
    }
  });

  it('copy is host-neutral: "Claude Code" appears only in the /devcoach:setup hints', async () => {
    const channels: Channel[] = ["npx", "homebrew", "claude-plugin", "gemini-extension"];
    for (const channel of channels) {
      const blocks = [
        element(await page("/knowledge", channel), "first-run", "section"),
        element(await page("/lessons", channel), "lessons-empty", "section"),
      ];
      for (const block of blocks) {
        const { rest, hints } = withoutPluginHints(block);
        expect(rest, channel).not.toContain("Claude Code");
        expect(rest).toContain("your agent");
        expect(hints.length).toBeGreaterThan(0);
        for (const hint of hints) expect(hint).toContain("/devcoach:setup");
      }
    }
  });
});

describe("first run: set up, no lesson yet", () => {
  it("/knowledge renders the map with one line above it, linking to the lessons page", async () => {
    expect((await post("/knowledge", { topic: "sqlite", confidence: "5" })).status).toBe(303);
    const html = await page("/knowledge");
    const strip = element(html, "no-lesson-yet", "p");
    expect(strip).toContain(
      "No lesson yet — the first one arrives after real work in your agent, at most 2 a day, 4 hours apart.",
    );
    expect(strip).toMatch(/<a href="\/lessons"[^>]*>What a lesson looks like →<\/a>/);
    expect(strip).not.toContain("Claude Code");
    expect(html.indexOf('id="no-lesson-yet"')).toBeLessThan(html.indexOf(">sqlite<"));
    expect(html).not.toContain('id="first-run"');
    expect(html).not.toContain("lessons total"); // the strip replaces a row of zeros
  });

  it("/lessons keeps the empty state but no longer asks to set up", async () => {
    const empty = element(await page("/lessons"), "lessons-empty", "section");
    expect(empty).toContain("What a lesson looks like");
    expect(empty).not.toContain("First, set up your profile.");
  });
});

describe("after the first lesson", () => {
  it("the empty states step aside: the stats line and the list are back", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "first-one",
          timestamp: new Date().toISOString(),
          topic_id: "sqlite",
          categories: ["sqlite"],
          title: "The first lesson",
          level: "mid",
          summary: "s",
        }),
      ),
    );
    const knowledge = await page("/knowledge");
    expect(knowledge).toContain("lessons total");
    expect(knowledge).not.toContain('id="no-lesson-yet"');
    expect(knowledge).not.toContain('id="first-run"');
    const lessons = await page("/lessons");
    expect(lessons).toContain("The first lesson");
    expect(lessons).not.toContain('id="lessons-empty"');
  });

  it("an empty knowledge table still shows the set-up block, next to the stats", async () => {
    await post("/knowledge/sqlite/delete", {});
    const html = await page("/knowledge");
    expect(html).toContain("lessons total");
    expect(html).toContain('id="first-run"');
    // /lessons has a lesson to list, so it never asks whether the profile is set up.
    expect(await page("/lessons")).not.toContain("First, set up your profile.");
  });
});
