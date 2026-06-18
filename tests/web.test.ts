import { beforeAll, describe, expect, it } from "vitest";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";
import { createApp } from "../src/web/app";

const app = createApp();
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const post = (path: string, fields: Record<string, string>) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: new URLSearchParams(fields),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
  );

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
  it("GET / renders profile and reflects added topic", async () => {
    expect(
      (await post("/knowledge", { topic: "rust", confidence: "7", group: "Languages" })).status,
    ).toBe(303);
    const r = await get("/");
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
    expect((await get("/settings")).status).toBe(200);
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
    const html = await (await get("/")).text();
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
    const html = await (await get("/")).text();
    // rateLimit.allowed === false → yellow reason branch instead of "Available now"
    expect(html).not.toContain("Available now");
  });
});
