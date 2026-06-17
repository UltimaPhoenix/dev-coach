// Hono web dashboard — pages rendered by views.ts (faithful Tailwind/Alpine markup).
// Bound to 127.0.0.1; forms use the POST→303 redirect pattern.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import * as coach from "../core/coach";
import * as db from "../core/db";
import type { KnowledgeEntry } from "../core/models";
import {
  type LessonsSelected,
  lessonDetailPage,
  lessonsPage,
  profilePage,
  settingsPage,
} from "./views";

const PER_PAGE = 25;

function safeRedirect(url: string | undefined, fallback = "/lessons"): string {
  if (url?.startsWith("/") && !url.startsWith("//")) return url;
  return fallback;
}

/**
 * Read a parsed-form field as a string. A missing field or a File upload yields the
 * fallback rather than `String(file)` → "[object Object]".
 */
function textField(body: Record<string, unknown>, key: string, fallback = ""): string {
  const v = body[key];
  return typeof v === "string" ? v : fallback;
}

// ── Static assets ────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
// prod: dist/bin.js → ../assets/static · dev: src/web/app.ts → ../../assets/static
const STATIC_DIR =
  [join(here, "../assets/static"), join(here, "../../assets/static")].find((p) => existsSync(p)) ??
  join(here, "../assets/static");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

function uiTheme(): string {
  try {
    return db.withConnection((c) => db.getSettings(c).ui_theme);
  } catch {
    return "system";
  }
}

// ── App ──────────────────────────────────────────────────────────────────────

export function createApp(): Hono {
  const app = new Hono();

  app.get("/static/*", (c) => {
    const rel = decodeURIComponent(c.req.path.slice("/static/".length));
    const filePath = join(STATIC_DIR, rel);
    if (!filePath.startsWith(STATIC_DIR)) return c.notFound();
    try {
      const data = readFileSync(filePath);
      return new Response(new Uint8Array(data), {
        headers: { "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" },
      });
    } catch {
      return c.notFound();
    }
  });

  // ── Profile ──────────────────────────────────────────────────────────────
  app.get("/", (c) => {
    const { profile, stats, rateLimit, settings } = db.withConnection((conn) => ({
      profile: coach.getProfile(conn),
      stats: coach.getStats(conn),
      rateLimit: coach.checkRateLimit(conn),
      settings: db.getSettings(conn),
    }));
    const topicGroup = new Map<string, string>();
    for (const g of profile.groups) for (const t of g.topics) topicGroup.set(t, g.name);
    const categorised: Record<string, KnowledgeEntry[]> = {};
    for (const g of profile.groups) categorised[g.name] = [];
    for (const e of profile.knowledge) {
      const key = topicGroup.get(e.topic) ?? "Other";
      const list = categorised[key] ?? [];
      list.push(e);
      categorised[key] = list;
    }
    return c.html(
      profilePage({
        categorised,
        allGroups: profile.groups.map((g) => g.name),
        stats,
        rateLimit,
        maxPerDay: settings.max_per_day,
        uiTheme: settings.ui_theme,
      }),
    );
  });

  app.post("/knowledge", async (c) => {
    const body = await c.req.parseBody();
    const topic = textField(body, "topic").trim();
    if (topic) {
      const confidence = Number.parseInt(textField(body, "confidence", "5"), 10) || 5;
      const group = textField(body, "group").trim();
      db.withConnection((conn) => {
        db.upsertKnowledge(conn, topic, confidence);
        if (group && group !== "Other") db.assignTopicToGroup(conn, topic, group);
      });
    }
    return c.redirect("/", 303);
  });

  app.post("/knowledge/:topic/delete", (c) => {
    db.withConnection((conn) => db.deleteKnowledge(conn, c.req.param("topic")));
    return c.redirect("/", 303);
  });

  app.post("/knowledge/:topic/group", async (c) => {
    const group = textField(await c.req.parseBody(), "group").trim();
    const topic = c.req.param("topic");
    db.withConnection((conn) => {
      if (group && group !== "Other") db.assignTopicToGroup(conn, topic, group);
      else db.unassignTopicFromGroup(conn, topic);
    });
    return c.redirect("/", 303);
  });

  app.post("/knowledge/:topic", async (c) => {
    const delta = Number.parseInt(textField(await c.req.parseBody(), "delta", "0"), 10) || 0;
    db.withConnection((conn) => coach.applyKnowledgeDelta(conn, c.req.param("topic"), delta));
    return c.redirect("/", 303);
  });

  app.post("/groups", async (c) => {
    const name = textField(await c.req.parseBody(), "group_name").trim();
    if (name && name !== "Other") db.withConnection((conn) => db.addGroup(conn, name));
    return c.redirect("/", 303);
  });

  app.post("/groups/:group_name/delete", (c) => {
    db.withConnection((conn) => db.deleteGroup(conn, c.req.param("group_name")));
    return c.redirect("/", 303);
  });

  // ── Lessons (static sub-paths before :lesson_id) ───────────────────────────
  app.get("/lessons/export", () => {
    const records = db.withConnection((conn) => db.exportLessons(conn));
    return new Response(JSON.stringify(records, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": "attachment; filename=devcoach-lessons.json",
      },
    });
  });

  app.post("/lessons/import", async (c) => {
    const file = (await c.req.parseBody()).file;
    let records: unknown;
    try {
      records = JSON.parse(file instanceof File ? await file.text() : String(file));
    } catch {
      return c.redirect("/settings?imported=0&skipped=0&invalid=1", 303);
    }
    if (!Array.isArray(records)) return c.redirect("/settings?imported=0&skipped=0&invalid=1", 303);
    const r = db.withConnection((conn) => db.importLessons(conn, records as unknown[]));
    return c.redirect(
      `/settings?imported=${r.inserted}&skipped=${r.duplicated}&invalid=${r.invalid}`,
      303,
    );
  });

  app.get("/lessons", (c) => {
    const q = c.req.query();
    const validLevels = new Set(["junior", "mid", "senior"]);
    const level = q.level && validLevels.has(q.level) ? q.level : "";
    const dateFrom = q.date_from || "";
    const dateTo = q.date_to || "";
    const starred = q.starred === "1";
    const sort = q.sort || "timestamp";
    const order = q.order === "asc" ? "asc" : "desc";
    let page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
    const period = q.period || "all";

    const filters = {
      period: dateFrom || dateTo ? null : period !== "all" ? period : null,
      category: q.category || null,
      level: level || null,
      project: q.project || null,
      repository: q.repository || null,
      branch: q.branch || null,
      commit: q.commit || null,
      starred: starred ? true : null,
      search: q.search || null,
      feedback: q.feedback || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    };

    const data = db.withConnection((conn) => {
      const total = db.countFilteredLessons(conn, filters);
      const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
      page = Math.min(page, totalPages);
      return {
        total,
        totalPages,
        lessons: db.getLessons(conn, { ...filters, sort, order, page, per_page: PER_PAGE }),
        allCategories: db.getAllCategories(conn),
        allProjects: db.getDistinctColumn(conn, "project"),
        allRepositories: db.getDistinctColumn(conn, "repository"),
        allBranches: db.getDistinctColumn(conn, "branch"),
        allCommits: db.getDistinctColumn(conn, "commit_hash"),
        theme: db.getSettings(conn).ui_theme,
      };
    });

    const s: LessonsSelected = {
      period,
      category: q.category || "",
      level,
      project: q.project || "",
      repository: q.repository || "",
      branch: q.branch || "",
      commit: q.commit || "",
      starred,
      search: q.search || "",
      feedback: q.feedback || "",
      date_from: dateFrom,
      date_to: dateTo,
      sort,
      order,
    };

    return c.html(
      lessonsPage({
        lessons: data.lessons,
        allCategories: data.allCategories,
        allProjects: data.allProjects,
        allRepositories: data.allRepositories,
        allBranches: data.allBranches,
        allCommits: data.allCommits,
        s,
        page,
        perPage: PER_PAGE,
        total: data.total,
        totalPages: data.totalPages,
        uiTheme: data.theme,
      }),
    );
  });

  app.post("/lessons/:lesson_id/star", async (c) => {
    const body = await c.req.parseBody();
    db.withConnection((conn) => db.setStar(conn, c.req.param("lesson_id"), body.starred === "1"));
    return c.redirect(safeRedirect(textField(body, "next") || undefined), 303);
  });

  app.post("/lessons/:lesson_id/feedback", async (c) => {
    const body = await c.req.parseBody();
    const fb = textField(body, "feedback");
    const value = fb === "" || fb === "clear" ? null : fb;
    db.withConnection((conn) => coach.recordFeedback(conn, c.req.param("lesson_id"), value));
    return c.redirect(safeRedirect(textField(body, "next") || undefined), 303);
  });

  app.get("/lessons/:lesson_id", (c) => {
    const lesson = db.withConnection((conn) => db.getLessonById(conn, c.req.param("lesson_id")));
    if (!lesson) return c.html("<h1>Lesson not found</h1>", 404);
    return c.html(lessonDetailPage({ lesson, uiTheme: uiTheme() }));
  });

  // ── Settings ───────────────────────────────────────────────────────────────
  app.get("/settings/export", () => {
    const data = db.withConnection((conn) => db.createBackupZip(conn));
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": "attachment; filename=devcoach-backup.zip",
      },
    });
  });

  app.post("/settings/import", async (c) => {
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.redirect("/settings?imported=0&skipped=0&invalid=1", 303);
    const data = new Uint8Array(await file.arrayBuffer());
    const r = db.withConnection((conn) => db.restoreBackupZip(conn, data));
    return c.redirect(
      `/settings?imported=${r.lessons}&skipped=${r.skipped}&invalid=${r.invalid}&groups=${r.groups}&notebook=${r.learning_state}`,
      303,
    );
  });

  app.get("/settings/notebook/download", () => {
    const content = existsSync(db.LEARNING_STATE_PATH)
      ? readFileSync(db.LEARNING_STATE_PATH, "utf8")
      : "";
    return new Response(content, {
      headers: {
        "content-type": "text/markdown",
        "content-disposition": "attachment; filename=devcoach-notebook.md",
      },
    });
  });

  app.post("/settings/notebook", async (c) => {
    const body = await c.req.parseBody();
    mkdirSync(dirname(db.LEARNING_STATE_PATH), { recursive: true });
    writeFileSync(db.LEARNING_STATE_PATH, textField(body, "content"), "utf8");
    return c.redirect(
      safeRedirect(textField(body, "next") || undefined, "/settings?notebook_saved=1"),
      303,
    );
  });

  app.post("/settings", async (c) => {
    const body = await c.req.parseBody();
    const maxPerDay = Number.parseInt(textField(body, "max_per_day", "2"), 10) || 2;
    const minGap = Number.parseInt(textField(body, "min_gap_minutes", "240"), 10);
    let theme = textField(body, "ui_theme", "system");
    if (!["system", "dark", "light"].includes(theme)) theme = "system";
    db.withConnection((conn) => {
      db.setSetting(conn, "max_per_day", String(maxPerDay));
      db.setSetting(conn, "min_gap_minutes", String(Number.isNaN(minGap) ? 240 : minGap));
      db.setSetting(conn, "ui_theme", theme);
    });
    return c.redirect("/settings", 303);
  });

  app.get("/settings", (c) => {
    const settings = db.withConnection((conn) => db.getSettings(conn));
    const notebookContent = existsSync(db.LEARNING_STATE_PATH)
      ? readFileSync(db.LEARNING_STATE_PATH, "utf8")
      : "";
    const q = c.req.query();
    const flash =
      q.imported !== undefined
        ? {
            imported: Number(q.imported ?? 0),
            skipped: Number(q.skipped ?? 0),
            invalid: Number(q.invalid ?? 0),
            groups: Number(q.groups ?? 0),
            notebook: Number(q.notebook ?? 0),
          }
        : null;
    return c.html(
      settingsPage({
        settings,
        notebookContent,
        notebookPath: db.LEARNING_STATE_PATH,
        uiTheme: settings.ui_theme,
        flash,
      }),
    );
  });

  return app;
}

export function startUi(port: number): void {
  const app = createApp();
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log(`devcoach UI running at http://localhost:${info.port}`);
  });
}
