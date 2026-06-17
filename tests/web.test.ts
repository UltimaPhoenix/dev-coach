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
