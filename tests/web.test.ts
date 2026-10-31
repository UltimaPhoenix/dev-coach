import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as courses from "../src/core/courses";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";
import { fetchSharedInput } from "../src/core/share-fetch";
import { createApp, resolveHomePath } from "../src/web/app";

vi.mock("../src/core/share-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/share-fetch")>();
  return { ...actual, fetchSharedInput: vi.fn(actual.fetchSharedInput) };
});

const app = createApp();
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const postForm = (
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: new URLSearchParams(fields),
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    }),
  );
const post = (path: string, fields: Record<string, string>) => postForm(path, fields);

beforeAll(() => {
  db.withConnection((c) => {
    db.insertLesson(
      c,
      parseLesson({
        id: "w1",
        timestamp: "2026-06-16T10:00:00Z",
        topic_id: "python",
        categories: ["python"],
        title: "Webify",
        level: "mid",
        summary: "s",
        project: "dev-coach",
        branch: "main",
        commit_hash: "abcdef1234",
      }),
    );
  });
});

describe("web app", () => {
  it("GET / lands on lessons once there is one; the setting overrides", async () => {
    const home = await get("/");
    expect(home.status).toBe(302);
    expect(home.headers.get("location")).toBe("/lessons"); // the fixture seeded w1
    await post("/settings", { max_per_day: "2", min_gap_minutes: "240", ui_home: "knowledge" });
    expect((await get("/")).headers.get("location")).toBe("/knowledge");
    await post("/settings", { max_per_day: "2", min_gap_minutes: "240", ui_home: "bogus" });
    expect((await get("/")).headers.get("location")).toBe("/lessons"); // bogus → auto
    expect(resolveHomePath("auto", false)).toBe("/knowledge");
    expect(resolveHomePath("lessons", false)).toBe("/lessons");
    expect(resolveHomePath("knowledge", true)).toBe("/knowledge");
    const settings = await (await get("/settings")).text();
    expect(settings).toContain('name="ui_home" value="auto" checked');
  });

  it("GET /knowledge renders profile and reflects added topic", async () => {
    const added = await post("/knowledge", { topic: "rust", confidence: "7", group: "Languages" });
    expect(added.status).toBe(303);
    expect(added.headers.get("location")).toBe("/knowledge");
    const r = await get("/knowledge");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Knowledge Map");
    expect(html).toContain("rust");
  });

  it("knowledge + group routes redirect 303", async () => {
    expect((await post("/knowledge/rust", { delta: "1" })).status).toBe(303);
    expect((await post("/knowledge/rust/group", { group: "Backend" })).status).toBe(303);
    expect((await post("/knowledge/rust/group", { group: "Other" })).status).toBe(303);
    expect((await post("/groups", { group_name: "Extra" })).status).toBe(303);
    expect((await post("/groups/Extra/delete", {})).status).toBe(303);
    expect((await post("/knowledge/rust/delete", {})).status).toBe(303);
  });

  it("GET /lessons with filters + detail + 404", async () => {
    const r = await get("/lessons?period=all&level=mid&search=Web&sort=topic_id&order=asc");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Webify");
    const d = await get("/lessons/w1");
    expect(await d.text()).toContain("Webify");
    expect((await get("/lessons/missing")).status).toBe(404);
  });

  it("one vocabulary: the question comes first, then yes · new to me · lost me", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "v1",
          timestamp: "2026-06-17T10:00:00Z",
          topic_id: "python",
          categories: ["python"],
          title: "Vocab",
          level: "mid",
          summary: "s",
        }),
      ),
    );
    const page = await (await get("/lessons/v1")).text();
    const question = page.indexOf(">Already knew it?</p>");
    expect(question).toBeGreaterThan(0);
    expect(page).toContain('role="group" aria-label="Already knew it?"');
    const buttons = ["✅</span>yes", "✨</span>new to me", "❌</span>lost me"].map((b) =>
      page.indexOf(b),
    );
    expect(buttons.every((i) => i > question)).toBe(true);
    expect([...buttons].sort((a, b) => a - b)).toEqual(buttons); // in that order
    // the list's filter menu, chip and cell use the same words
    const list = await (await get("/lessons?feedback=understood")).text();
    for (const label of ["✅ Knew it", "✨ New to me", "❌ Lost me", "○ No answer yet"]) {
      expect(list).toContain(label);
    }
    await post("/lessons/v1/feedback", { feedback: "know", next: "/lessons/v1" });
    expect(await (await get("/lessons?feedback=know")).text()).toContain("✅ knew it</span>");
    // none of the retired words (the done-when grep keeps them out of the tree; these catch variants)
    for (const old of [
      /Understood/,
      /couldn.t follow/i,
      /I knew th/,
      /No response/,
      /💡/,
      /[✓✗] /,
    ]) {
      expect(page + list).not.toMatch(old);
    }
  });

  it("a yes on an untracked topic: the page says it is tracked now, at 6/10 — once", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "zz",
          timestamp: "2026-06-17T11:00:00Z",
          topic_id: "zig",
          categories: ["zig"],
          title: "Comptime",
          level: "mid",
          summary: "s",
        }),
      ),
    );
    const yes = await post("/lessons/zz/feedback", { feedback: "know", next: "/lessons/zz" });
    expect(yes.status).toBe(303);
    expect(yes.headers.get("location")).toBe("/lessons/zz?answered=topic-created");
    const flash = await (await get("/lessons/zz?answered=topic-created")).text();
    expect(flash).toContain(
      "Already knew it — it counts toward your confidence. zig wasn&#39;t on your knowledge map: it&#39;s tracked now, at 6/10.",
    );
    // the flash is one-shot: the plain page shows today's confidence, the same answer again no flash
    expect(await (await get("/lessons/zz")).text()).toContain(
      "Already knew it — it counts toward your confidence (zig: 6/10).",
    );
    const again = await post("/lessons/zz/feedback", { feedback: "know", next: "/lessons/zz" });
    expect(again.headers.get("location")).toBe("/lessons/zz");
    // a flash never rides to another page, and never on an answer that created nothing
    await post("/lessons/zz/feedback", { feedback: "clear", next: "/lessons/zz" });
    db.withConnection((c) => db.deleteKnowledge(c, "zig"));
    const elsewhere = await post("/lessons/zz/feedback", { feedback: "know", next: "/lessons" });
    expect(elsewhere.headers.get("location")).toBe("/lessons");
    const tracked = await post("/lessons/w1/feedback", { feedback: "know", next: "/lessons/w1" });
    expect(tracked.headers.get("location")).toBe("/lessons/w1");
    // a forged flash on an answer that isn't "yes" changes nothing
    await post("/lessons/zz/feedback", { feedback: "understood", next: "/lessons/zz" });
    expect(await (await get("/lessons/zz?answered=topic-created")).text()).not.toContain(
      "tracked now",
    );
  });

  it("star + feedback redirect 303", async () => {
    expect((await post("/lessons/w1/star", { starred: "1", next: "/lessons" })).status).toBe(303);
    expect(
      (await post("/lessons/w1/feedback", { feedback: "bogus", next: "/lessons" })).status,
    ).toBe(400);
    expect((await post("/lessons/w1/feedback", { feedback: "understood" })).status).toBe(303);
    const answered = await (await get("/lessons/w1")).text();
    // the question is the answer's one place: the reopened question marks it, no badge elsewhere
    expect(answered).toMatch(/data-key="n" [^>]*aria-pressed="true"/);
    expect(answered).toMatch(
      /New to me — recorded\. Only “yes” moves confidence \(python: \d+\/10\)\./,
    );
    expect(
      (await post("/lessons/w1/feedback", { feedback: "know", next: "//evil.com" })).status,
    ).toBe(303);
  });

  it("downloads send attachment headers", async () => {
    expect((await get("/lessons/export")).headers.get("content-disposition")).toContain(
      "devcoach-lessons.json",
    );
    expect((await get("/settings/export")).headers.get("content-type")).toBe("application/zip");
    expect((await get("/settings/notebook/download")).headers.get("content-disposition")).toContain(
      "notebook.md",
    );
  });

  it("settings page, update, notebook save", async () => {
    const settingsPage = await get("/settings");
    expect(settingsPage.status).toBe(200);
    const nav = await settingsPage.text();
    expect(nav).toContain('href="/settings" title="Settings"');
    expect(nav).toContain("<span>Settings</span>");
    expect(nav).toContain('aria-current="page"');
    expect(nav).not.toContain(">Settings</a>");
    expect(await (await get("/lessons")).text()).not.toContain('aria-current="page"');
    expect(
      (await post("/settings", { max_per_day: "5", min_gap_minutes: "120", ui_theme: "dark" }))
        .status,
    ).toBe(303);
    expect((await post("/settings/notebook", { content: "# notes" })).status).toBe(303);
    expect(await (await get("/settings?notebook_saved=1")).text()).toContain("Coaching Notebook");
  });

  it("multipart import (lessons.json + backup.zip)", async () => {
    const fd = new FormData();
    fd.append(
      "file",
      new File(
        [
          JSON.stringify([
            {
              id: "imp1",
              timestamp: "2026-06-16T10:00:00Z",
              topic_id: "go",
              categories: ["go"],
              title: "T",
              level: "mid",
              summary: "s",
            },
          ]),
        ],
        "l.json",
        { type: "application/json" },
      ),
    );
    const r = await app.fetch(
      new Request("http://localhost/lessons/import", { method: "POST", body: fd }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toContain("imported=1");

    const zip = db.withConnection((c) => db.createBackupZip(c));
    const fd2 = new FormData();
    fd2.append("file", new File([zip], "b.zip", { type: "application/zip" }));
    const r2 = await app.fetch(
      new Request("http://localhost/settings/import", { method: "POST", body: fd2 }),
    );
    expect(r2.status).toBe(303);
  });

  it("invalid lessons import → invalid=1", async () => {
    const fd = new FormData();
    fd.append("file", new File(["not json"], "x.json", { type: "application/json" }));
    const r = await app.fetch(
      new Request("http://localhost/lessons/import", { method: "POST", body: fd }),
    );
    expect(r.headers.get("location")).toContain("invalid=1");
  });

  it("static handler 404s missing files", async () => {
    expect((await get("/static/does-not-exist.css")).status).toBe(404);
    const js = await get("/static/table-resize.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect(await js.text()).toContain("resetLessonColumns");
  });
});

describe("web view branches (rich rendering)", () => {
  it("lesson detail: feedback + github git metadata + commit URL", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "g1",
          timestamp: "2026-06-16T10:00:00Z",
          topic_id: "go",
          categories: ["go", "mcp"],
          title: "GitLesson",
          level: "junior",
          summary: "# sum",
          body: "## body",
          feedback: "know",
          project: "dev-coach",
          repository: "UltimaPhoenix/dev-coach",
          repository_platform: "github",
          branch: "main",
          commit_hash: "abcdef1234567",
          folder: "/home/x",
        }),
      ),
    );
    const html = await (await get("/lessons/g1")).text();
    expect(html).toContain("Already knew it — it counts toward your confidence");
    expect(html).toContain("github.com/UltimaPhoenix/dev-coach");
    expect(html).toContain("/commit/abcdef1234567");
    expect(html).toContain("vscode://file//home/x");
  });

  it("lessons page: full filter set renders chips + clear-all", async () => {
    const html = await (
      await get("/lessons?period=week&level=mid&category=go&search=Git&starred=1&feedback=know")
    ).text();
    expect(html).toContain("Clear all");
    expect(html).toContain("Starred");
    expect(html).toContain("Knew it");
  });

  it("lessons page: custom date range label", async () => {
    const html = await (await get("/lessons?date_from=2026-06-01&date_to=2026-06-30")).text();
    expect(html).toContain("2026-06-01 → 2026-06-30");
  });

  it("lessons page: pagination across pages", async () => {
    db.withConnection((c) => {
      for (let i = 0; i < 30; i++) {
        db.insertLesson(
          c,
          parseLesson({
            id: `pg${i}`,
            timestamp: "2026-06-16T10:00:00Z",
            topic_id: "python",
            categories: ["python"],
            title: `L${i}`,
            level: "mid",
            summary: "s",
          }),
        );
      }
    });
    const html = await (await get("/lessons?page=2")).text();
    expect(html).toContain("Page 2 of");
    expect(html).toContain("Prev");
    expect(html).toContain("Next");
  });
});

describe("web view branches — exhaustive", () => {
  it("lesson detail: gitlab / bitbucket / local platforms, senior level, dont_know, task_context", async () => {
    db.withConnection((c) => {
      const mk = (o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            timestamp: "2026-06-16T10:00:00Z",
            topic_id: "t",
            categories: ["c"],
            title: String(o.id),
            level: "mid",
            summary: "s",
            body: "b",
            ...o,
          }),
        );
      mk({
        id: "gl",
        level: "senior",
        feedback: "dont_know",
        task_context: "why this",
        project: "P",
        repository: "grp/proj",
        repository_platform: "gitlab",
        branch: "dev",
        commit_hash: "deadbeef1234",
        folder: "/f",
      });
      mk({
        id: "bb",
        project: "P",
        repository: "grp/proj",
        repository_platform: "bitbucket",
        commit_hash: "cafe1234567",
      });
      mk({ id: "loc", project: "P", repository: "/Users/me/proj", repository_platform: "local" });
      mk({ id: "nometa" }); // hasMeta false
      mk({ id: "projonly", project: "OnlyProj" }); // project present, repoUrl null
    });
    const gl = await (await get("/lessons/gl")).text();
    expect(gl).toContain("/-/commit/deadbeef1234"); // gitlab commit URL form
    expect(gl).toMatch(/data-key="l" [^>]*aria-pressed="true"/); // dont_know branch
    expect(gl).toContain("Lost me — recorded. Ask your agent for a step-by-step course on it");
    expect(gl).toContain("/devcoach:course");
    expect(gl).toContain("Context:"); // task_context branch
    const bb = await (await get("/lessons/bb")).text();
    expect(bb).toContain("/commits/cafe123"); // bitbucket commit URL form
    const loc = await (await get("/lessons/loc")).text();
    expect(loc).toContain("vscode://file//Users/me/proj"); // local repoUrl
    expect(await (await get("/lessons/nometa")).text()).toContain("nometa");
    expect(await (await get("/lessons/projonly")).text()).toContain("OnlyProj");
  });

  it("lessons list: project/repository/branch/commit filter chips + sort asc/desc", async () => {
    const html = await (
      await get(
        "/lessons?project=P&repository=grp/proj&branch=dev&commit=deadbeef&sort=title&order=asc",
      )
    ).text();
    expect(html).toContain("📁 P"); // project chip
    expect(html).toContain("Clear all");
    const desc = await (await get("/lessons?sort=title&order=desc")).text();
    expect(desc).toContain("Lessons"); // renders with desc sort active
  });

  it("lessons list: empty state with active filter shows clear-all", async () => {
    const html = await (await get("/lessons?search=zzz-no-such-lesson")).text();
    expect(html).toContain("No lessons match");
    expect(html).toContain("Clear all filters");
  });

  it("profile: low/mid/high confidence tiers + ungrouped Other section", async () => {
    await post("/knowledge", { topic: "lowconf", confidence: "2" }); // red tier, Other group
    await post("/knowledge", { topic: "midconf", confidence: "5" }); // yellow tier
    const html = await (await get("/knowledge")).text();
    expect(html).toContain("lowconf");
    expect(html).toContain("midconf");
    expect(html).toContain("Other"); // ungrouped section header
  });

  it("settings: import flash with all counters (plural, skipped, invalid, groups, notebook)", async () => {
    const html = await (
      await get("/settings?imported=2&skipped=1&invalid=1&groups=2&notebook=1")
    ).text();
    expect(html).toContain("2 lessons imported");
    expect(html).toContain("skipped");
    expect(html).toContain("rejected");
    expect(html).toContain("groups added");
    expect(html).toContain("Notebook restored");
  });

  it("settings: import flash singular with zero secondary counters", async () => {
    const html = await (await get("/settings?imported=1")).text();
    expect(html).toContain("1 lesson imported."); // singular, no extra clauses
  });

  it("profile: rate-limit denied state renders the reason", async () => {
    await post("/settings", { max_per_day: "1", min_gap_minutes: "240", ui_theme: "system" });
    const now = new Date().toISOString();
    db.withConnection((c) => {
      for (let i = 0; i < 2; i++) {
        db.insertLesson(
          c,
          parseLesson({
            id: `rl${i}`,
            timestamp: now,
            topic_id: "python",
            categories: ["python"],
            title: `RL${i}`,
            level: "mid",
            summary: "s",
          }),
        );
      }
    });
    const html = await (await get("/knowledge")).text();
    // rateLimit.allowed === false → yellow reason branch instead of "Available now"
    expect(html).not.toContain("Available now");
  });
});

describe("web lesson sharing", () => {
  const seed = (id: string, title: string) =>
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id,
          timestamp: "2026-06-16T10:00:00Z",
          topic_id: "sqlite",
          categories: ["sqlite"],
          title,
          level: "mid",
          summary: "Readers never block writers.",
          body: "Body **bold**.",
          project: "proj",
          folder: "/Users/me/secret",
          repository: "local",
          repository_platform: "local",
        }),
      ),
    );

  it("share popover: fragment, text, link and .md download; folder never leaks", async () => {
    seed("sh1", "WAL mode");
    const page = await get("/lessons/sh1?share=1");
    const html = await page.text();
    expect(html).toContain('x-data="{ open: true }"');
    expect(html).toContain('id="share-payloads"');
    expect(html).toContain("devcoach:lesson:1:");
    expect(html).toContain("share.js");

    const frag = await get("/lessons/sh1/share");
    expect(frag.status).toBe(200);
    expect(await frag.text()).toContain("Copy text");

    const text = await (await get("/lessons/sh1/share?format=text")).text();
    expect(text).toContain("WAL mode");
    expect(text.trim().split("\n").at(-1)).toMatch(/^devcoach:lesson:1:/);
    const link = await (await get("/lessons/sh1/share?format=link")).text();
    expect(link).toMatch(
      /^https:\/\/ultimaphoenix\.github\.io\/dev-coach\/lesson#devcoach:lesson:1:/,
    );

    const md = await get("/lessons/sh1/share?format=md&name=Phoenix&include_context=1");
    expect(md.headers.get("content-disposition")).toBe('attachment; filename="sh1.devcoach.md"');
    const body = await md.text();
    expect(body).toContain("format: devcoach.lesson");
    expect(body).toContain('shared_by: "Phoenix"');
    expect(body).toContain("project:");
    expect(body).not.toContain("secret");
    // a GET renders with the name it carries but never persists it (only the popover POST does)
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBeNull();

    expect((await get("/lessons/nope/share")).status).toBe(404);
  });

  it("POST share re-renders the fragment; the name is persisted only on the change event (persist=1)", async () => {
    // a debounced keystroke re-renders but does not touch the setting
    const typing = await postForm("/lessons/sh1/share", { name: "Ad", include_context: "1" });
    expect(typing.status).toBe(200);
    expect(await typing.text()).toContain("Ad");
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBeNull();
    const r = await postForm("/lessons/sh1/share", {
      name: "  Ada ",
      include_context: "1",
      persist: "1",
    });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Ada");
    expect(html).toContain("includes project, branch and commit");
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBe("Ada");
    const anon = await (await postForm("/lessons/sh1/share", { name: "", persist: "1" })).text();
    expect(anon).toContain("Shared anonymously");
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBeNull();
    // every writer clamps to SHARE_NAME_MAX
    await postForm("/lessons/sh1/share", { name: "x".repeat(200), persist: "1" });
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toHaveLength(db.SHARE_NAME_MAX);
    await post("/settings", {
      max_per_day: "2",
      min_gap_minutes: "240",
      share_name: "y".repeat(200),
    });
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toHaveLength(db.SHARE_NAME_MAX);
    await post("/settings", { max_per_day: "2", min_gap_minutes: "240", share_name: "" });
  });

  it("share endpoint refuses cross-site requests, so another site cannot rename the sender", async () => {
    await postForm("/lessons/sh1/share", { name: "Ada", persist: "1" });
    const cross = await app.fetch(
      new Request("http://localhost/lessons/sh1/share?name=Attacker&format=text", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );
    expect(cross.status).toBe(403);
    const crossPost = await postForm(
      "/lessons/sh1/share",
      { name: "Attacker", persist: "1" },
      { "sec-fetch-site": "cross-site" },
    );
    expect(crossPost.status).toBe(403);
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBe("Ada");
  });

  it("markdown from lessons is sanitized before it reaches innerHTML (detail, preview, settings)", async () => {
    seed("xss", "Boom");
    db.withConnection((c) => db.deleteLesson(c, "xss"));
    const stored = parseLesson({
      id: "xss",
      timestamp: "2026-06-16T10:00:00Z",
      topic_id: "sqlite",
      categories: ["sqlite"],
      title: "Boom",
      level: "mid",
      summary: "s",
      body: '<img src=x onerror="alert(1)">',
    });
    db.withConnection((c) => db.insertLesson(c, stored));
    const detail = await (await get("/lessons/xss")).text();
    expect(detail).toContain("/static/vendor/purify.min.js");
    expect(detail).toMatch(/innerHTML = DOMPurify\.sanitize\(marked\.parse\(/);
    expect(detail).not.toMatch(/innerHTML = marked\.parse\(/);
    const code = (await (await get("/lessons/xss/share?format=text")).text())
      .trim()
      .split("\n")
      .at(-1);
    const preview = await (
      await get(`/lessons/import?code=${encodeURIComponent(code ?? "")}`)
    ).text();
    expect(preview).toContain("/static/vendor/purify.min.js");
    expect(preview).toMatch(/innerHTML = DOMPurify\.sanitize\(marked\.parse\(/);
    expect(preview).not.toMatch(/innerHTML = marked\.parse\(/);
    const settings = await (await get("/settings")).text();
    expect(settings).toContain("/static/vendor/purify.min.js");
    expect(settings).not.toMatch(/innerHTML = marked\.parse\(/);
    expect((await get("/static/vendor/purify.min.js")).status).toBe(200);
  });

  it("import from the paste box: new → detail banner, again → dup, junk → invalid", async () => {
    const text = await (await get("/lessons/sh1/share?format=text&name=Ada")).text();
    db.withConnection((c) => db.deleteLesson(c, "sh1"));

    const r = await postForm("/lessons/import", { from: "lessons", text });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/lessons/sh1?imported=1");
    const detail = await (await get("/lessons/sh1?imported=1")).text();
    expect(detail).toContain("✓ Imported “WAL mode”, shared by Ada");
    expect(detail).toContain("🤝 shared by");
    const stored = db.withConnection((c) => db.getLessonById(c, "sh1"));
    expect(stored?.imported).toBe(true);
    expect(stored?.folder).toBeNull();

    const code = text.trim().split("\n").at(-1) ?? "";
    const dup = await postForm("/lessons/import", {
      from: "lessons",
      text: `https://ultimaphoenix.github.io/dev-coach/lesson#${code}`,
    });
    expect(dup.headers.get("location")).toBe("/lessons/sh1?imported=dup");
    expect(await (await get("/lessons/sh1?imported=dup")).text()).toContain(
      "was already in your log",
    );

    const junk = await postForm("/lessons/import", { from: "lessons", text: "hello there" });
    expect(junk.headers.get("location")).toBe("/lessons?import=1&error=invalid");
    const lessons = await (await get("/lessons?import=1&error=invalid")).text();
    expect(lessons).toContain('x-data="{ open: true }"');
    expect(lessons).toContain("doesn't look like a devcoach lesson");
  });

  it("import: a dropped .devcoach.md file and a URL (fetched server-side)", async () => {
    const md = await (await get("/lessons/sh1/share?format=md")).text();
    db.withConnection((c) => db.deleteLesson(c, "sh1"));
    const fd = new FormData();
    fd.append("from", "lessons");
    fd.append("file", new File([md], "sh1.devcoach.md", { type: "text/markdown" }));
    const r = await app.fetch(
      new Request("http://localhost/lessons/import", { method: "POST", body: fd }),
    );
    expect(r.headers.get("location")).toBe("/lessons/sh1?imported=1");

    db.withConnection((c) => db.deleteLesson(c, "sh1"));
    const fetchSpy = vi.mocked(fetchSharedInput).mockResolvedValueOnce(md);
    try {
      const viaUrl = await postForm("/lessons/import", {
        from: "lessons",
        text: "https://example.com/raw/sh1.devcoach.md",
      });
      expect(viaUrl.headers.get("location")).toBe("/lessons/sh1?imported=1");
    } finally {
      fetchSpy.mockReset();
    }
  });

  it("import: a browser's untouched file input (zero-byte File) does not shadow the pasted text", async () => {
    const text = await (await get("/lessons/sh1/share?format=text")).text();
    db.withConnection((c) => db.deleteLesson(c, "sh1"));
    const fd = new FormData();
    fd.append("from", "lessons");
    fd.append("text", text);
    fd.append("file", new File([], "", { type: "application/octet-stream" }));
    const r = await app.fetch(
      new Request("http://localhost/lessons/import", { method: "POST", body: fd }),
    );
    expect(r.headers.get("location")).toBe("/lessons/sh1?imported=1");
  });

  it("import POST from another site is refused (Sec-Fetch-Site) and writes nothing", async () => {
    const text = await (await get("/lessons/sh1/share?format=text")).text();
    db.withConnection((c) => db.deleteLesson(c, "sh1"));
    const r = await postForm(
      "/lessons/import",
      { from: "lessons", text },
      { "sec-fetch-site": "cross-site" },
    );
    expect(r.headers.get("location")).toBe("/lessons?import=1&error=cross");
    expect(db.withConnection((c) => db.getLessonById(c, "sh1"))).toBeNull();
    expect(await (await get("/lessons?import=1&error=cross")).text()).toContain(
      "only work from this dashboard",
    );
    // same-origin browsers and header-less clients pass
    const ok = await postForm(
      "/lessons/import",
      { from: "lessons", text },
      { "sec-fetch-site": "same-origin" },
    );
    expect(ok.headers.get("location")).toBe("/lessons/sh1?imported=1");
  });

  it("GET /lessons/import previews a code without writing; bad code → friendly error; no code → paste form", async () => {
    seed("sh2", "Preview me");
    const code =
      (await (await get("/lessons/sh2/share?format=text&name=Bo")).text())
        .trim()
        .split("\n")
        .at(-1) ?? "";
    db.withConnection((c) => db.deleteLesson(c, "sh2"));
    const r = await get(`/lessons/import?code=${encodeURIComponent(code)}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Someone shared a lesson with you");
    expect(html).toContain("Preview me");
    expect(html).toContain("shared by <span");
    expect(html).toContain("Add to my lessons");
    expect(html).toContain("Nothing is saved until you click");
    expect(db.withConnection((c) => db.getLessonById(c, "sh2"))).toBeNull();

    const bad = await (await get("/lessons/import?code=devcoach:lesson:1:zzzz")).text();
    expect(bad).toContain("damaged or incomplete");
    const empty = await (await get("/lessons/import")).text();
    expect(empty).toContain("Import a shared lesson");
    expect(empty).toContain('id="import-form"');
  });

  it("legacy lessons.json upload from the settings page keeps its flash", async () => {
    const fd = new FormData();
    fd.append("file", new File(["nope"], "x.json", { type: "application/json" }));
    const r = await app.fetch(
      new Request("http://localhost/lessons/import", { method: "POST", body: fd }),
    );
    expect(r.headers.get("location")).toBe("/settings?imported=0&skipped=0&invalid=1");
  });

  it("settings form saves share_name; lessons page shows the ↗ share link", async () => {
    expect(
      (await post("/settings", { max_per_day: "2", min_gap_minutes: "240", share_name: " Zed " }))
        .status,
    ).toBe(303);
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBe("Zed");
    expect(await (await get("/settings")).text()).toContain('value="Zed"');
    seed("sh3", "Row share");
    const html = await (await get("/lessons?search=Row+share")).text();
    expect(html).toContain('hx-get="/lessons/sh3/share?format=panel"');
    expect(html).toContain('id="share-modal-body"');
    const panel = await (await get("/lessons/sh3/share?format=panel")).text();
    expect(panel).toContain("Row share");
    expect(panel).toContain('name="include_context"');
    expect(panel).toContain('id="share-payloads"');
    expect(html).toContain("＋ Import");
  });

  it("GET /ping answers the docs site with CORS + private-network headers", async () => {
    const r = await get("/ping");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    expect(r.headers.get("access-control-allow-origin")).toBe("https://ultimaphoenix.github.io");
    expect(r.headers.get("access-control-allow-private-network")).toBe("true");
    const pre = await app.fetch(new Request("http://localhost/ping", { method: "OPTIONS" }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("GET");
    // no other route is CORS-enabled
    expect((await get("/lessons")).headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("web lesson delete", () => {
  const seedDel = (id: string, title: string) =>
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id,
          timestamp: "2026-06-16T10:00:00Z",
          topic_id: "python",
          categories: ["python"],
          title,
          level: "mid",
          summary: "s",
        }),
      ),
    );
  const postIds = (ids: string[], next: string, headers: Record<string, string> = {}) =>
    app.fetch(
      new Request("http://localhost/lessons/delete", {
        method: "POST",
        body: new URLSearchParams([...ids.map((id) => ["id", id]), ["next", next]]),
        headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      }),
    );

  it("list: Select mode instead of a per-row control; detail: the ⋯ menu", async () => {
    seedDel("del1", "Doomed <lesson>");
    seedDel("del3", "Doomed too");
    const list = await (await get("/lessons?search=Doomed")).text();
    expect(list).toContain('aria-label="More actions"');
    expect(list).toContain("Delete lessons…");
    expect(list).toContain("✕ Cancel");
    expect(list).toContain("Reset column widths");
    expect(list).not.toContain("☑ Select</button>");
    expect(list).toContain('class="dc-check');
    expect(list).toContain('data-resizable="lessons"');
    expect(list).toContain("<colgroup>");
    expect(list).toContain('<col data-col="title" data-flex data-min="220" />');
    expect(list).toContain('<col data-col="date" data-min="96"');
    expect(list).toContain("table-resize.js");
    expect(list).not.toContain(">↗</a>");
    expect(list).toContain('data-id="del1"');
    expect(list).toContain('data-title="Doomed &lt;lesson&gt;"');
    expect(list).toContain('role="alertdialog"');
    expect(list).not.toContain("confirm(");
    expect(list).toContain('action="/lessons/delete"');
    expect(list).toContain("Delete selected");
    expect(list).not.toContain('hx-post="/lessons/del1/delete"');
    expect(list).not.toContain("🗑</button>");
    expect(list).toContain(
      'value="/lessons?period=all&amp;search=Doomed&amp;sort=timestamp&amp;order=desc&amp;page=1"',
    );
    const detail = await (await get("/lessons/del1")).text();
    expect(detail).toContain('aria-label="More actions"');
    expect(detail).not.toContain(">⋯</button>");
    expect(detail).toContain("Delete lesson…");
    expect(detail).toContain('name="id" value="del1"');
    expect(detail).toContain("Delete this lesson?");
    expect(detail).toContain("“Doomed &lt;lesson&gt;”");
    expect(detail).toContain('role="alertdialog"');
    expect(detail).not.toContain("confirm(");
  });

  it("POST /lessons/delete removes one or many ids and redirects to next", async () => {
    const r = await postIds(["del1", "del3", "nope"], "/lessons?search=Doomed");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/lessons?search=Doomed");
    expect((await get("/lessons/del1")).status).toBe(404);
    expect((await get("/lessons/del3")).status).toBe(404);
    expect(await (await get("/lessons?search=Doomed")).text()).not.toContain("/lessons/del1");
    seedDel("del4", "Single");
    expect(
      (await post("/lessons/delete", { id: "del4", next: "//evil" })).headers.get("location"),
    ).toBe("/lessons");
    expect((await get("/lessons/del4")).status).toBe(404);
    // nothing to delete is not an error
    expect((await post("/lessons/delete", { next: "/lessons" })).status).toBe(303);
  });

  it("delete from another site is refused and keeps the lesson", async () => {
    seedDel("del2", "Survivor");
    const r = await postIds(["del2"], "/lessons", { "sec-fetch-site": "cross-site" });
    expect(r.status).toBe(403);
    expect(db.withConnection((c) => db.getLessonById(c, "del2"))?.title).toBe("Survivor");
    expect((await postIds(["del2"], "/lessons", { "sec-fetch-site": "same-origin" })).status).toBe(
      303,
    );
    expect(db.withConnection((c) => db.getLessonById(c, "del2"))).toBeNull();
  });
});

describe("web shared-with-me filters", () => {
  it("filters by imported / sender, renders the dropdown, chip and row badge", async () => {
    db.withConnection((c) => {
      db.insertLesson(
        c,
        parseLesson({
          id: "from-ada",
          timestamp: "2026-06-16T10:00:00Z",
          topic_id: "sql",
          categories: ["sql"],
          title: "Ada's <index> tip",
          level: "mid",
          summary: "s",
          imported: true,
          shared_by: "Ada <Lovelace>",
        }),
      );
    });
    const all = await (await get("/lessons")).text();
    expect(all).toContain('data-shared-by="Ada &lt;Lovelace&gt;"');
    expect(all).toContain("🤝 Ada &lt;Lovelace&gt;"); // row badge under the topic
    expect(all).toContain("🤝 Shared"); // neutral button label

    const theirs = await (await get("/lessons?imported=1")).text();
    expect(theirs).toContain("/lessons/from-ada");
    expect(theirs).not.toContain("/lessons/w1");
    expect(theirs).toContain("🤝 Shared with me");

    const mine = await (await get("/lessons?imported=0&search=Webify")).text();
    expect(mine).toContain("/lessons/w1");
    expect(mine).toContain("👤 My own");
    expect(await (await get("/lessons?imported=0&search=index")).text()).not.toContain(
      "/lessons/from-ada",
    );

    const byAda = await (await get("/lessons?shared_by=Ada+%3CLovelace%3E")).text();
    expect(byAda).toContain("/lessons/from-ada");
    expect(byAda).not.toContain("/lessons/w1");
    expect(byAda).toContain("🤝 from Ada &lt;Lovelace&gt;"); // label + chip
    expect(byAda).toContain("Clear all");
    // the chip's clear link drops both fields; other filters survive
    expect(byAda).toMatch(/href="\?period=all(&amp;[^"]*)?&amp;sort=timestamp&amp;order=desc"/);

    const bySearch = await (await get("/lessons?search=lovelace")).text();
    expect(bySearch).toContain("/lessons/from-ada");
    expect((await get("/lessons?shared_by=Nobody")).status).toBe(200);
    expect(await (await get("/lessons?shared_by=Nobody")).text()).toContain("No lessons match");
    db.withConnection((c) => db.deleteLesson(c, "from-ada"));
  });
});

describe("web theme", () => {
  it("every page carries the palette tokens, a toggle that shows the current scheme, no indigo", async () => {
    const page = await (await get("/lessons")).text();
    // Tailwind's gray and the accent family point at the CSS variables of style.css
    expect(page).toContain("rgb(var(--dc-' + name + '-' + n + ') / <alpha-value>)");
    expect(page).toContain("gray: scale('gray'), accent: scale('accent')");
    expect(page).not.toContain("indigo-");
    // both glyphs ship; the .dark class picks one, so the icon is right from the first paint
    expect(page).toContain('<span class="dark:hidden" aria-hidden="true">☀️</span>');
    expect(page).toContain('<span class="hidden dark:inline" aria-hidden="true">🌙</span>');
    expect(page).toContain("Dark theme — switch to light");
    expect(page).toContain("new CustomEvent('dc:theme'");
    // the toggle's choice survives an explicit setting; only saving Settings clears it
    expect(page).not.toContain("if (serverTheme !== 'system') localStorage.removeItem");
    expect(page).toContain("addEventListener('change'");
    const settings = await (await get("/settings")).text();
    expect(settings).toContain("localStorage.removeItem('theme-override')");
    const css = await (await get("/static/style.css")).text();
    expect(css).toContain("--dc-gray-950: 30 31 34");
  });
});

describe("web on a database newer than this build (read-only)", () => {
  it("pages render, /ping carries the notice, a write answers 503 with the message", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "ro-web",
          timestamp: "2026-01-01T00:00:00Z",
          topic_id: "python",
          categories: [],
          title: "Still readable",
          level: "mid",
          summary: "s",
        }),
      ),
    );
    const raw = db.getConnection(db.DB_PATH);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    try {
      const page = await get("/lessons/ro-web");
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Still readable");
      const ping = (await (await get("/ping")).json()) as { compat: { message: string } };
      expect(ping.compat.message).toContain("schema v99");
      const write = await post("/lessons/ro-web/feedback", { feedback: "know" });
      expect(write.status).toBe(503);
      expect(await write.text()).toContain("older than your database");
    } finally {
      const back = db.getConnection(db.DB_PATH);
      back.exec(`PRAGMA user_version = ${db.SCHEMA_VERSION}`);
      back.close();
    }
  });
});

describe("web courses over a real socket", () => {
  it("serves each document at its own length (node-server mutates plain header objects)", async () => {
    const { startUi } = await import("../src/web/app");
    const one = db.withConnection((c) =>
      courses.createCourse(c, { title: "Short doc", topic_id: "node", prerequisites: [] }),
    );
    const two = db.withConnection((c) =>
      courses.createCourse(c, { title: "Long doc", topic_id: "node", prerequisites: [] }),
    );
    writeFileSync(courses.documentPath(one.id), '<section id="step-1">short → ✓</section>');
    writeFileSync(
      courses.documentPath(two.id),
      `<section id="step-1">${"long — ✗ ".repeat(400)}</section>`,
    );
    const server = startUi(0, { handleSignals: false });
    try {
      await new Promise<void>((r) => server.once("listening", () => r()));
      const port = (server.address() as { port: number }).port;
      const url = (id: string) => `http://127.0.0.1:${port}/courses/${id}/index.html`;
      const first = await (await fetch(url(one.id))).text();
      const second = await (await fetch(url(two.id))).text();
      expect(first).toContain("short → ✓");
      expect(first.trim().endsWith("</script>")).toBe(true);
      expect(second).toContain("</section>");
      expect(second.trim().endsWith("</script>")).toBe(true); // not cut to the first one's length
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      db.withConnection((c) => {
        courses.deleteCourse(c, one.id);
        courses.deleteCourse(c, two.id);
      });
    }
  });
});

describe("web course highlighting", () => {
  const CODE = '<pre><code class="language-js">const a = 1;</code></pre>';
  const count = (text: string, needle: string) => text.split(needle).length - 1;

  it("serves one highlighter: the document's own, or the fallback for a document without one", async () => {
    const course = db.withConnection((c) =>
      courses.createCourse(c, { title: "Highlight me", topic_id: "js" }),
    );
    try {
      // a document written before the highlighter existed: highlighted on the way out only
      const legacy = `<!doctype html><section id="step-1">${CODE}</section>`;
      writeFileSync(courses.documentPath(course.id), legacy);
      const served = await (await get(`/courses/${course.id}/index.html`)).text();
      expect(count(served, "hljs.highlightElement")).toBe(1);
      expect(served).toContain("Copyright (c) 2006, Ivan Sagalaev");
      expect(readFileSync(courses.documentPath(course.id), "utf8")).toBe(legacy);

      // a document that carries its own block: nothing is added twice
      writeFileSync(
        courses.documentPath(course.id),
        `${legacy}<script data-devcoach="highlighter"></script>`,
      );
      db.withConnection((c) =>
        courses.addStep(c, course.id, { title: "One", kind: "example", anchor: "step-1" }),
      );
      const own = await (await get(`/courses/${course.id}/index.html`)).text();
      expect(count(own, "hljs.highlightElement")).toBe(1);
      expect(own).toContain('setAttribute("data-embedded", "1")');
    } finally {
      db.withConnection((c) => courses.deleteCourse(c, course.id));
    }
  });
});

describe("web courses", () => {
  it("lists, shows the sandboxed document, tracks progress, deletes", async () => {
    const empty = await (await get("/courses")).text();
    expect(empty).toContain("No courses yet");
    expect(empty).toContain(
      'answer <span class="font-mono">l</span> (lost me) under a lesson card',
    );
    expect(empty).toContain('href="/courses"'); // nav entry
    const course = db.withConnection((c) =>
      courses.createCourse(c, {
        title: "From sums to powers",
        topic_id: "python",
        goal: "Read 2³",
        lesson_id: "w1",
        prerequisites: [
          { concept: "powers", known: false },
          { concept: "sums", known: true },
        ],
      }),
    );
    // no document yet → 404 on the frame route, placeholder on the page
    expect((await get(`/courses/${course.id}/index.html`)).status).toBe(404);
    expect(await (await get(`/courses/${course.id}`)).text()).toContain("hasn't been written yet");
    writeFileSync(
      courses.documentPath(course.id),
      '<!doctype html><section id="step-1">one → ✓</section><section id="step-2">two — ✗</section>',
    );
    db.withConnection((c) => {
      courses.addStep(c, course.id, { title: "Sums", kind: "concept", anchor: "step-1" });
      courses.addStep(c, course.id, { title: "Powers", kind: "check", anchor: "step-2" });
    });

    const list = await (await get("/courses")).text();
    expect(list).toContain("From sums to powers");
    expect(list).toContain("0/2");
    expect(list).toContain("Webify"); // seeded-from lesson title

    const detail = await (await get(`/courses/${course.id}`)).text();
    expect(detail).toContain(`src="/courses/${course.id}/index.html#step-1"`);
    expect(detail).toContain('sandbox="allow-scripts allow-forms"');
    expect(detail).toContain('id="course-frame"');
    expect(detail).toContain('scrolling="no"'); // the page scrolls, never the frame
    expect(detail).not.toContain("h-[75vh]");
    expect(detail).toContain('<script src="/static/course-viewer.js"></script>');
    expect(detail).toContain('data-anchor="step-2"');
    expect(detail).toContain("✗ powers");
    expect(detail).toContain("✓ sums");
    expect(detail).toContain("Delete course…");

    const doc = await get(`/courses/${course.id}/index.html`);
    expect(doc.status).toBe(200);
    expect(doc.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(doc.headers.get("content-security-policy")).toContain("form-action 'none'");
    expect(doc.headers.get("content-security-policy")).toContain("'unsafe-eval'");
    expect(doc.headers.get("x-content-type-options")).toBe("nosniff");
    expect(doc.headers.get("referrer-policy")).toBe("no-referrer");
    const docText = await doc.text();
    expect(docText).toContain("<section");
    expect(docText).toContain("two — ✗"); // multi-byte content survives Content-Length
    // the resize bridge is appended on the way out, never written to the file
    expect(docText).toContain('setAttribute("data-embedded", "1")');
    // …and it takes the theme from the dashboard, and the neutrals of its palette
    expect(docText).toContain('"devcoach:theme"');
    expect(docText).toContain(':root[data-embedded][data-theme="dark"]{--bg:#1e1f22');
    expect(docText).toContain(":root[data-embedded] .theme-switch{display:none}");
    const viewer = await (await get("/static/course-viewer.js")).text();
    expect(viewer).toContain('type: "devcoach:theme"');
    expect(viewer).toContain('addEventListener("dc:theme", sendTheme)');
    expect(docText.trim().endsWith("</script>")).toBe(true);
    expect(readFileSync(courses.documentPath(course.id), "utf8")).not.toContain("data-embedded");
    expect(docText).not.toContain("hljs"); // no code in this document: no highlighter served
    expect((await get("/static/course-viewer.js")).status).toBe(200);
    expect((await get("/courses/../etc/index.html")).status).toBe(404);

    // the seed lesson links to its course, and "lost me" points at it instead of a new one
    expect(await (await get("/lessons/w1")).text()).toContain("🎓 Course · 0/2");
    await post("/lessons/w1/feedback", { feedback: "dont_know", next: "/lessons/w1" });
    const lost = await (await get("/lessons/w1")).text();
    expect(lost).toContain("Lost me — recorded.");
    expect(lost).toContain("Continue the course · 0/2");
    expect(lost).not.toContain("Ask your agent");

    const bad = await post(`/courses/${course.id}/steps/1`, { status: "bogus" });
    expect(bad.status).toBe(400);
    const done = await post(`/courses/${course.id}/steps/1`, { status: "done" });
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe(`/courses/${course.id}`);
    expect((await post(`/courses/${course.id}/steps/9`, { status: "done" })).status).toBe(404);
    const after = await (await get(`/courses/${course.id}?step=2`)).text();
    expect(after).toContain("1/2 steps");
    expect(after).toContain(`#step-2"`);

    const cross = await postForm(
      "/courses/delete",
      { id: course.id },
      { "sec-fetch-site": "cross-site" },
    );
    expect(cross.status).toBe(403);
    expect(existsSync(courses.courseDir(course.id))).toBe(true);
    const del = await post("/courses/delete", { id: course.id });
    expect(del.headers.get("location")).toBe("/courses");
    expect(existsSync(courses.courseDir(course.id))).toBe(false);
    expect((await get(`/courses/${course.id}`)).status).toBe(404);
  });
});

describe("web lesson page: the answer under the tip, the reading column", () => {
  const V2_SUMMARY = "You set `busy_timeout` to 0, so the second writer failed at once.";
  const FOLDER = "/Users/someone/work/my project#1";
  const same = { "sec-fetch-site": "same-origin" };
  beforeAll(() => {
    db.withConnection((c) => {
      const mk = (o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            timestamp: "2026-10-30T10:00:00Z",
            topic_id: "sqlite",
            categories: ["database"],
            title: String(o.id),
            level: "mid",
            summary: "s",
            ...o,
          }),
        );
      mk({
        id: "rc-v2",
        summary: V2_SUMMARY,
        body: "You set **`busy_timeout`** to 0, so the second writer failed at once. SQLite has no lock queue.\n\n💡 *Senior tip:* set it where the connection opens.",
        folder: FOLDER,
        project: "dev-coach",
      });
      mk({
        id: "rc-legacy",
        summary: "Docker caches each layer by its content hash.",
        body: "## Layers\n\nEvery `RUN` creates a layer.\n\n💡 *Senior tip:* copy the manifests first.",
      });
      mk({ id: "rc-lost", topic_id: "cdn", body: "Edge caches key on the URL." });
    });
  });

  it("the control follows #body-content: the topic · level rule, the question, keys y n l, the off switch", async () => {
    const page = await (await get("/lessons/rc-v2")).text();
    const bodyAt = page.indexOf('<div id="body-content" class="markdown-body dc-prose"></div>');
    expect(bodyAt).toBeGreaterThan(0);
    const controlAt = page.indexOf('<section id="lesson-feedback"');
    expect(controlAt).toBeGreaterThan(bodyAt);
    // nothing between the body and the control: the answer sits right under the tip
    expect(
      page
        .slice(bodyAt, controlAt)
        .replace(/<div id="body-content"[^>]*><\/div>/, "")
        .trim(),
    ).toBe("");
    const control = page.slice(controlAt, page.indexOf("</section>", controlAt));
    expect(control).toContain('aria-live="polite"');
    expect(control).toContain('hx-target="#lesson-feedback-state"');
    expect(control.indexOf("<span>sqlite · mid</span>")).toBeLessThan(
      control.indexOf(">Already knew it?</p>"),
    );
    expect(control).toContain('role="group" aria-label="Already knew it?"');
    const keys = [...control.matchAll(/\saria-keyshortcuts="([^"]*)"/g)].map((m) => m[1]);
    expect(keys.join(" ")).toBe("y n l");
    for (const k of keys) {
      expect(control).toContain(`data-key="${k}"`);
      expect(control).toContain(`:aria-keyshortcuts="keys ? '${k}' : false"`); // removed when off
    }
    expect(control).not.toContain('aria-pressed="true"');
    expect(control).toContain('<button type="button" @click="toggleKeys()"');
    expect(control).toContain("<span x-text=\"keys ? 'turn off' : 'turn on'\">turn off</span>");
    expect(control).toContain(
      '<span x-show="keys" class="inline-flex items-baseline gap-1">Keys <kbd',
    );
    expect(control).toContain("hidden sm:inline-block"); // the per-button hints, from sm up
    expect(control).toMatch(/data-key="y" [^>]*x-init="if \(refocus\)/); // focus lands here after a clear
    expect(control).toContain(
      "Only “yes” moves confidence; a “yes” puts sqlite on your knowledge map.",
    );
    expect(page).toContain("localStorage.getItem(STORE) !== 'off'");
  });

  it("POST know → the sentence with *change*; clear → the three buttons again", async () => {
    const yes = await postForm(
      "/lessons/rc-v2/feedback",
      { feedback: "know", next: "/lessons/rc-v2" },
      same,
    );
    expect(yes.status).toBe(303);
    const answered = await (await get("/lessons/rc-v2")).text();
    expect(answered).toContain(
      "Already knew it — it counts toward your confidence (sqlite: 6/10).",
    );
    expect(answered).toContain(
      'aria-expanded="false" :aria-expanded="editing" aria-controls="fb-answers"',
    );
    expect(answered).toContain(`x-text="editing ? 'keep' : 'change'">change</button>`);
    // the question is still there, closed, with the current answer pressed and its own Clear
    expect(answered).toContain('id="fb-answers" x-show="editing" style="display:none"');
    expect(answered).toMatch(/data-key="y" [^>]*aria-pressed="true"/);
    expect(answered).toContain(">Clear the answer</button>");
    expect(answered).toContain("Only “yes” moves your sqlite confidence (now 6/10).");

    await postForm("/lessons/rc-v2/feedback", { feedback: "clear", next: "/lessons/rc-v2" }, same);
    const cleared = await (await get("/lessons/rc-v2")).text();
    expect(cleared).not.toContain("it counts toward your confidence");
    expect(cleared).not.toContain('id="fb-answers"');
    expect(cleared).not.toContain("Clear the answer");
    expect(cleared.match(/<button type="submit" data-key="[ynl]"/g)).toHaveLength(3);
    expect(cleared).not.toContain('aria-pressed="true"');
    expect(cleared).toContain("Only “yes” moves your sqlite confidence (now 5/10).");
  });

  it("lost me: the host-neutral course sentence, or Continue the course once one exists", async () => {
    await post("/lessons/rc-lost/feedback", { feedback: "dont_know", next: "/lessons/rc-lost" });
    const lost = await (await get("/lessons/rc-lost")).text();
    expect(lost).toContain(
      "Lost me — recorded. Ask your agent for a step-by-step course on it (Claude Code: <code",
    );
    expect(lost).not.toContain("Continue the course");
    const course = db.withConnection((c) =>
      courses.createCourse(c, {
        title: "CDN caching, step by step",
        topic_id: "cdn",
        goal: "Read a cache key",
        lesson_id: "rc-lost",
      }),
    );
    try {
      const seeded = await (await get("/lessons/rc-lost")).text();
      expect(seeded).toContain("Continue the course · 0/0</a>");
      expect(seeded).not.toContain("Ask your agent");
    } finally {
      db.withConnection((c) => courses.deleteCourse(c, course.id));
    }
  });

  it("TL;DR only for a legacy body: a v2 body that opens with its summary has none", async () => {
    const v2 = await (await get("/lessons/rc-v2")).text();
    expect(v2).not.toContain("TL;DR");
    expect(v2).not.toContain("summary-content");
    const legacy = await (await get("/lessons/rc-legacy")).text();
    expect(legacy).toContain(">TL;DR</p>");
    expect(legacy).toContain("document.getElementById('summary-content').innerHTML");
    // no summary, nothing to show
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "rc-nosum",
          timestamp: "2026-10-30T09:00:00Z",
          topic_id: "sqlite",
          categories: ["database"],
          title: "No summary",
          level: "mid",
          summary: "",
          body: "Body only.",
        }),
      ),
    );
    expect(await (await get("/lessons/rc-nosum")).text()).not.toContain("TL;DR");
  });

  it("a shared lesson without a name says “shared anonymously”; a Windows folder links with slashes", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "rc-anon",
          timestamp: "2026-10-30T08:00:00Z",
          topic_id: "sqlite",
          categories: ["database"],
          title: "Anonymous",
          level: "senior",
          summary: "s",
          imported: true,
          shared_by: null,
          folder: String.raw`C:\Users\someone\my repo`,
        }),
      ),
    );
    const page = await (await get("/lessons/rc-anon")).text();
    expect(page).toContain("🤝 shared anonymously");
    expect(page).not.toContain("shared by anonymous");
    expect(page).toContain('href="vscode://file/C:/Users/someone/my%20repo"');
    expect(page.replace(/href="vscode:\/\/file[^"]*"/g, "")).not.toContain("someone");
  });

  it("the folder is a link to VS Code; the page never prints the path", async () => {
    const page = await (await get("/lessons/rc-v2")).text();
    expect(page).toContain(
      'href="vscode://file//Users/someone/work/my%20project%231" class="inline-flex',
    );
    expect(page).toContain("Open folder in VS Code</span></a>");
    const outsideTheLink = page.replace(/href="vscode:\/\/file[^"]*"/g, "");
    for (const part of [FOLDER, "/Users/someone", "my project"]) {
      expect(outsideTheLink).not.toContain(part);
    }
  });

  it("metadata reads topic · level (the date is the rail's); the id moves to ⋯ Copy id; muted text keeps 4.5:1", async () => {
    const page = await (await get("/lessons/rc-legacy")).text();
    const meta = page.slice(page.indexOf('id="lesson-meta"'), page.indexOf(">TL;DR</p>"));
    const [topic, level] = ['">sqlite</span>', ">mid</a>"].map((s) => meta.indexOf(s));
    expect(topic).toBeGreaterThan(0);
    expect(topic).toBeLessThan(level);
    expect(meta).not.toContain("data-ts="); // printed once, in the rail above the title
    expect(page.indexOf("data-ts=")).toBeLessThan(page.indexOf("<h1"));
    expect(page).not.toMatch(/rounded-full[^"]*"[^>]*>mid</); // the level is a word, not a pill
    expect(page).toContain(
      `data-copy="rc-legacy" @click="copyText($el.dataset.copy, $el.querySelector('[data-copy-label]'))"`,
    );
    expect(page).toContain(">Copy id</span>");
    expect(page).not.toContain("ID: rc-legacy");
    // gray-300/400 on white and gray-600 on the dark panel fail 4.5:1; cyan-600 fails on white
    const card = page.slice(page.indexOf('id="lesson-meta"'), page.indexOf("Delete this lesson?"));
    expect(card).not.toMatch(/(?<![\w:-])text-gray-[34]00\b/);
    expect(card).not.toContain("dark:text-gray-600");
    expect(card).not.toContain("cyan-");
    expect(page).toContain('aria-label="Star this lesson"');
  });

  it("the tip gets its rule; the stylesheet has the reading column and honours reduced motion", async () => {
    const page = await (await get("/lessons/rc-legacy")).text();
    expect(page).toContain("startsWith('\\u{1F4A1}'); })?.classList.add('dc-tip')");
    const css = await (await get("/static/style.css")).text();
    expect(css).toContain(".dc-prose > * { max-width: 38rem; }");
    expect(css).toContain(".dc-prose > pre, .dc-prose > table { max-width: none; }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect((await get("/static/share.js")).status).toBe(200);
    expect(await (await get("/static/share.js")).text()).toContain("window.copyText = function");
  });

  it("the page keys: a visible button only — never with a modifier, in a field, under a dialog, or once off", async () => {
    const page = await (await get("/lessons/rc-legacy")).text();
    const src = page.slice(page.indexOf("function lessonAnswer()"), page.lastIndexOf("</script>"));
    const store = new Map<string, string>();
    let modalOpen = false;
    const clicked: string[] = [];
    const button = (key: string, shown = true) => ({
      dataset: { key },
      getClientRects: () => (shown ? [{}] : []),
      click: () => clicked.push(key),
    });
    const root = { querySelectorAll: () => [button("y"), button("n"), button("l", false)] };
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    const doc = {
      querySelectorAll: () => (modalOpen ? [{ getClientRects: () => [{}] }] : []),
    };
    const load = (ls: unknown) =>
      new Function("localStorage", "document", `${src}; return lessonAnswer;`)(ls, doc);
    const outside = { closest: () => null, isContentEditable: false };
    const press = (c: any, key: string, extra: Record<string, unknown> = {}, dialog = false) => {
      let prevented = false;
      c.key(
        { key, target: outside, preventDefault: () => (prevented = true), ...extra },
        root,
        dialog,
      );
      return prevented;
    };
    const c = load(storage)();
    expect(c.keys).toBe(true); // on by default
    expect(press(c, "y")).toBe(true);
    press(c, "Y"); // caps lock is still y
    for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey", "repeat", "isComposing"]) {
      expect(press(c, "n", { [mod]: true })).toBe(false);
    }
    press(c, "n", { keyCode: 229 }); // IME
    press(c, "n", { defaultPrevented: true });
    press(c, "n", { target: { closest: () => ({}), isContentEditable: false } }); // in a field
    press(c, "n", { target: { closest: () => null, isContentEditable: true } });
    press(c, "l"); // its button is hidden: the question is closed
    press(c, "x");
    modalOpen = true; // a visible modal dialog
    press(c, "n");
    modalOpen = false;
    press(c, "n", {}, true); // the delete dialog, clicked open but not painted yet
    expect(clicked).toEqual(["y", "y"]);
    c.toggleKeys(); // turn off
    expect(store.get("lesson-keys")).toBe("off");
    expect(press(c, "n")).toBe(false);
    expect(load(storage)().keys).toBe(false); // remembered in this browser
    c.toggleKeys(); // back on: the default, nothing stored
    expect(store.has("lesson-keys")).toBe(false);
    expect(press(c, "n")).toBe(true);
    expect(clicked).toEqual(["y", "y", "n"]);
    // a browser that refuses storage still gets working keys, and toggling does not throw
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const r = load(refusing)();
    expect(r.keys).toBe(true);
    expect(() => r.toggleKeys()).not.toThrow();
  });
});

describe("web lesson page: the provenance rail and the newer/older pager", () => {
  // The chain sits before every other lesson in this file's database, so its older end is ours;
  // the newest is "now" (a future timestamp is clamped to the current second) and its id wins
  // the tie with any other lesson stamped in that second.
  const NOW = "2099-01-01T00:00:00Z";
  const OLDEST = "1999-01-01T00:00:00Z";
  const FOLDER = "/Users/someone/secret dir";
  beforeAll(() => {
    db.withConnection((c) => {
      const mk = (o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            topic_id: "git",
            categories: ["git"],
            title: `Title of ${o.id}`,
            level: "mid",
            summary: "s",
            ...o,
          }),
        );
      mk({ id: "zz-newest", timestamp: NOW });
      mk({
        id: "pg-c",
        timestamp: "2001-06-02T10:00:00Z",
        project: "dev-coach",
        repository: "octo/dev-coach",
        repository_platform: "github",
        branch: "feat/rail",
        commit_hash: "0123456789abcdef",
        folder: FOLDER,
      });
      // a timestamp tie: the id decides, so the walk neither loops nor skips
      mk({ id: "pg-b", timestamp: "2001-06-01T10:00:00Z" });
      mk({ id: "pg-a", timestamp: "2001-06-01T10:00:00Z" });
      mk({
        id: "pg-shared",
        timestamp: "2001-01-01T09:30:00Z",
        imported: true,
        shared_by: "Ada",
        title: "WAL mode",
      });
      mk({ id: "pg-oldest", timestamp: OLDEST });
    });
  });

  const page = async (id: string) => (await get(`/lessons/${id}`)).text();
  const between = (s: string, from: string, to: string) => {
    const at = s.indexOf(from);
    return at < 0 ? "" : s.slice(at, s.indexOf(to, at));
  };
  const rail = (p: string) => between(p, '<aside id="lesson-rail"', "</aside>");
  const topPager = (p: string) =>
    between(p, '<nav aria-label="Newer and older lessons"', '<aside id="lesson-rail"');
  const bottomPager = (p: string) => between(p, '<nav aria-label="Keep reading"', "</nav>");
  /** Every link to a lesson page on the page (not the list's `/lessons?…` filters). */
  const lessonLinks = (p: string) =>
    [...p.matchAll(/href="\/lessons\/([^"?/]+)"/g)].map((m) => decodeURIComponent(m[1]));

  it("getAdjacentLessons: newest first like the list, the id breaking ties, null at the ends", () => {
    db.withConnection((c) => {
      const around = (id: string) => {
        const l = db.getLessonById(c, id);
        if (!l) throw new Error(id);
        const n = db.getAdjacentLessons(c, l);
        return [n.newer?.id ?? null, n.older?.id ?? null];
      };
      expect(around("pg-c")[1]).toBe("pg-b");
      expect(around("pg-b")).toEqual(["pg-c", "pg-a"]);
      expect(around("pg-a")).toEqual(["pg-b", "pg-shared"]);
      expect(around("pg-shared")).toEqual(["pg-a", "pg-oldest"]);
      expect(around("zz-newest")[0]).toBeNull();
      expect(around("pg-oldest")).toEqual(["pg-shared", null]);
      expect(db.getAdjacentLessons(c, { id: "pg-b", timestamp: "2001-06-01T10:00:00Z" })).toEqual({
        newer: { id: "pg-c", title: "Title of pg-c" },
        older: { id: "pg-a", title: "Title of pg-a" },
      });
    });
    // no lessons table: no neighbours, never an error page
    const bare = db.getConnection(":memory:");
    expect(db.getAdjacentLessons(bare, { id: "x", timestamp: OLDEST })).toEqual({
      newer: null,
      older: null,
    });
    bare.close();
  });

  it("a middle lesson links its neighbours at the top (compact) and the bottom (with titles)", async () => {
    const p = await page("pg-b");
    const top = topPager(p);
    expect(top).toContain('href="/lessons/pg-c" rel="prev" title="Title of pg-c"');
    expect(top).toContain('>Newer<span class="sr-only">: Title of pg-c</span>');
    expect(top).toContain('href="/lessons/pg-a" rel="next" title="Title of pg-a"');
    expect(top.indexOf("pg-c")).toBeLessThan(top.indexOf("pg-a")); // newer first, like the list
    const bottom = bottomPager(p);
    expect(bottom).toContain('href="/lessons/pg-c" rel="prev"');
    expect(bottom).toContain('href="/lessons/pg-a" rel="next"');
    expect(bottom).toContain(">Title of pg-c</span></a>");
    expect(bottom).toContain(">Title of pg-a</span></a>");
    expect(p.indexOf('<nav aria-label="Keep reading"')).toBeGreaterThan(
      p.indexOf('<section id="lesson-feedback"'),
    );
    for (const id of new Set(lessonLinks(p)))
      expect((await get(`/lessons/${id}`)).status).toBe(200);
  });

  it("the newest and the oldest lesson say so and link to nothing that 404s", async () => {
    const newest = await page("zz-newest");
    expect(topPager(newest)).toContain(">Newest</span>");
    expect(bottomPager(newest)).toContain("This is your newest lesson.");
    expect(newest).not.toContain('rel="prev"');
    expect(newest).toMatch(/href="\/lessons\/[^"]+" rel="next"/);

    const oldest = await page("pg-oldest");
    expect(topPager(oldest)).toContain(">Oldest</span>");
    expect(bottomPager(oldest)).toContain("This is your oldest lesson.");
    expect(oldest).not.toContain('rel="next"');
    expect(oldest).toContain('href="/lessons/pg-shared" rel="prev"');

    for (const p of [newest, oldest]) {
      const ids = new Set(lessonLinks(p));
      expect(ids.size).toBeGreaterThan(0);
      for (const id of ids) expect((await get(`/lessons/${id}`)).status).toBe(200);
    }
  });

  it("walking Older from the newest visits every lesson once and ends at the oldest", async () => {
    const total = db.withConnection((c) => db.exportLessons(c).length);
    const seen: string[] = [];
    let id: string | undefined = "zz-newest";
    while (id && seen.length <= total) {
      seen.push(id);
      const next = (await page(id)).match(/href="\/lessons\/([^"]+)" rel="next"/);
      id = next ? decodeURIComponent(next[1]) : undefined;
    }
    expect(seen.length).toBe(total);
    expect(new Set(seen).size).toBe(total);
    expect(seen.at(-1)).toBe("pg-oldest");
    expect(seen.slice(-5)).toEqual(["pg-c", "pg-b", "pg-a", "pg-shared", "pg-oldest"]);
  });

  it("with no other lesson there is no pager at all", async () => {
    const { lessonDetailPage } = await import("../src/web/views");
    const lesson = parseLesson({
      id: "alone",
      timestamp: OLDEST,
      topic_id: "git",
      categories: [],
      title: "Alone",
      level: "mid",
      summary: "s",
    });
    const alone = String(
      await lessonDetailPage({
        lesson,
        uiTheme: "system",
        share: { id: "alone", open: false, name: "", includeContext: false, text: "", link: "" },
        imported: null,
        course: null,
        confidence: null,
        topicCreated: false,
        neighbours: { newer: null, older: null },
      }),
    );
    expect(alone).toContain('<aside id="lesson-rail"');
    expect(alone).not.toContain('aria-label="Newer and older lessons"');
    expect(alone).not.toContain('aria-label="Keep reading"');
  });

  it("the rail: when, project, repo, branch, commit — above the title, never the folder path", async () => {
    const p = await page("pg-c");
    const r = rail(p);
    expect(p.indexOf('<aside id="lesson-rail"')).toBeLessThan(p.indexOf("<h1"));
    // one wrapped line of values below lg (labels for screen readers), a labelled column from lg
    expect(r).toContain('<dl class="flex flex-wrap items-baseline');
    expect(r).toContain("lg:grid lg:grid-cols-[auto_minmax(0,1fr)]");
    const labels = [...r.matchAll(/<dt class="([^"]*)">([^<]*)<\/dt>/g)];
    expect(labels.map((m) => m[2])).toEqual([
      "when",
      "project",
      "repo",
      "branch",
      "commit",
      "folder",
    ]);
    for (const [, cls, label] of labels)
      expect(cls).toBe(label === "folder" ? "sr-only" : "sr-only lg:not-sr-only");
    expect(r).toContain(
      `<time datetime="${"2001-06-02T10:00:00Z"}" data-ts="2001-06-02T10:00:00Z"`,
    );
    expect(r).toContain(">2001-06-02</time>");
    expect(r).toContain('href="https://github.com/octo/dev-coach"');
    expect(r).toContain('href="https://github.com/octo/dev-coach/commit/0123456789abcdef"');
    expect(r).toContain(">0123456</a>");
    expect(r).toContain(">feat/rail</span>");
    expect(r).toContain('href="vscode://file//Users/someone/secret%20dir" class="inline-flex');
    expect(r).toContain(">Open folder in VS Code</span></a>");
    // the folder never shows: not in the rail, not anywhere outside the VS Code link
    const outsideTheLink = p.replace(/href="vscode:\/\/file[^"]*"/g, "");
    for (const part of [FOLDER, "/Users/someone", "secret dir", "secret%20dir"]) {
      expect(outsideTheLink).not.toContain(part);
    }
    // provenance has one place: the old block at the end of the card is gone
    expect(p.match(/>project</g)?.length).toBe(1);
    expect(between(p, 'id="lesson-meta"', "<section")).not.toContain("data-ts=");
  });

  it("a shared lesson's rail opens with the sender; the meta line no longer carries it", async () => {
    const p = await page("pg-shared");
    const r = rail(p);
    expect(r).toContain('<dt class="sr-only">sender</dt>');
    expect(r).toContain("🤝 shared by <span");
    expect(r).toContain(">Ada</span>");
    expect(r.indexOf("shared by")).toBeLessThan(r.indexOf(">when<"));
    expect(between(p, 'id="lesson-meta"', "<section")).not.toContain("shared by");
    expect(p).not.toContain("shared by anonymous");
    const anonymous = await page("rc-anon");
    expect(rail(anonymous)).toContain("🤝 shared anonymously");
    expect(anonymous).not.toContain("shared by anonymous");
  });

  it("an imported lesson never links a local path, even when a crafted share carries one", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "pg-crafted",
          timestamp: "2001-01-01T09:00:00Z",
          topic_id: "git",
          categories: [],
          title: "Crafted",
          level: "mid",
          summary: "s",
          imported: true,
          shared_by: "Mallory",
          project: "innocent",
          repository: "/etc",
          repository_platform: "local",
        }),
      ),
    );
    const r = rail(await page("pg-crafted"));
    expect(r).not.toContain("vscode://");
    expect(r).toContain(">innocent</span>");
    db.withConnection((c) => db.deleteLesson(c, "pg-crafted"));
  });

  it("no ← → keys: the pager is plain links, and the page's keys stay y n l", async () => {
    const p = await page("pg-b");
    for (const binding of [
      "ArrowLeft",
      "ArrowRight",
      "keydown.left",
      "keydown.right",
      ".window.left",
      ".window.right",
    ]) {
      expect(p).not.toContain(binding);
    }
    const shortcuts = [...p.matchAll(/\saria-keyshortcuts="([^"]*)"/g)].map((m) => m[1]);
    expect(shortcuts).toEqual(["y", "n", "l"]);
    expect(topPager(p) + bottomPager(p)).not.toMatch(
      /data-key|aria-keyshortcuts|accesskey|@keydown/,
    );
    // the page script's handler ignores the arrows and every letter but y n l
    const src = p.slice(p.indexOf("function lessonAnswer()"), p.lastIndexOf("</script>"));
    const c = new Function("localStorage", "document", `${src}; return lessonAnswer;`)(
      { getItem: () => null },
      { querySelectorAll: () => [] },
    )();
    const clicked: string[] = [];
    const root = {
      querySelectorAll: () =>
        ["y", "n", "l"].map((key) => ({
          dataset: { key },
          getClientRects: () => [{}],
          click: () => clicked.push(key),
        })),
    };
    for (const key of ["ArrowLeft", "ArrowRight", "j", "k"]) {
      let prevented = false;
      c.key(
        { key, target: { closest: () => null }, preventDefault: () => (prevented = true) },
        root,
        false,
      );
      expect(prevented).toBe(false);
    }
    expect(clicked).toEqual([]);
  });

  it("the rail and the pager keep 4.5:1 text and palette tokens", async () => {
    const p = await page("pg-c");
    const chrome = rail(p) + topPager(p) + bottomPager(p);
    expect(chrome).not.toMatch(/(?<![\w:-])text-gray-[34]00\b/); // fails 4.5:1 on the light canvas
    expect(chrome).not.toContain("dark:text-gray-600");
    expect(chrome).not.toMatch(/cyan-|indigo-|#[0-9a-f]{3,6}\b/i);
  });
});
