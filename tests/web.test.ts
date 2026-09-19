import { beforeAll, describe, expect, it, vi } from "vitest";
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

  it("star + feedback redirect 303", async () => {
    expect((await post("/lessons/w1/star", { starred: "1", next: "/lessons" })).status).toBe(303);
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
    expect(html).toContain("I know this");
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
    expect(html).toContain("Known");
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
    expect(gl).toContain("I don't know this"); // dont_know branch
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
    expect(list).toContain('<col data-col="date" data-min="72"');
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
