// Hono web dashboard — pages rendered by views.ts (faithful Tailwind/Alpine markup).
// Bound to 127.0.0.1; forms use the POST→303 redirect pattern.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { detectGitUserName } from "../core/git";
import type { KnowledgeEntry, Lesson } from "../core/models";
import {
  buildSharePayload,
  decodeShareCode,
  renderShareLink,
  renderShareMarkdownFile,
  renderShareText,
  resolveSharedBy,
  type SharedLesson,
  ShareInputError,
  sharedLessonFilename,
} from "../core/share";
import { fetchSharedInput, isHttpUrl } from "../core/share-fetch";
import { VERSION } from "../version";
import {
  importPage,
  type LessonsSelected,
  lessonDetailPage,
  lessonsPage,
  profilePage,
  type ShareState,
  settingsPage,
  shareFragment,
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

// The docs site's share page may only talk to the dashboard through this one endpoint: it probes
// GET /ping to say "your dashboard is running". The headers are the whole CORS surface of the app.
const SHARE_SITE_ORIGIN = "https://ultimaphoenix.github.io";
const PING_HEADERS = {
  "access-control-allow-origin": SHARE_SITE_ORIGIN,
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-private-network": "true",
  "cache-control": "no-store",
  vary: "Origin",
};

/**
 * Same-origin guard for the import POST: the share page and any other site can only *link* to
 * the read-only preview, never submit the form. A missing header (curl, older browsers, tests)
 * is allowed — the dashboard is bound to 127.0.0.1.
 */
function isCrossSite(c: { req: { header(name: string): string | undefined } }): boolean {
  const site = c.req.header("sec-fetch-site");
  return site !== undefined && site !== "same-origin" && site !== "none";
}

function shareState(
  lesson: Lesson,
  o: { name?: string | null; includeContext?: boolean; open?: boolean },
): ShareState {
  const setting = db.withConnection((c) => db.getSettings(c).share_name);
  const sharedBy = resolveSharedBy({
    explicit: o.name ?? null,
    setting,
    gitUserName: detectGitUserName(),
  });
  const includeContext = o.includeContext ?? false;
  const payload = buildSharePayload(lesson, { includeContext, sharedBy });
  return {
    id: lesson.id,
    open: o.open ?? false,
    name: sharedBy ?? "",
    includeContext,
    text: renderShareText(payload),
    link: renderShareLink(payload),
    filename: sharedLessonFilename(payload),
    markdown: renderShareMarkdownFile(payload),
  };
}

function rememberShareName(name: string | undefined): void {
  if (name === undefined) return;
  const trimmed = name.trim().slice(0, 80);
  db.withConnection((c) => db.setSetting(c, "share_name", trimmed));
}

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

  // ── Ping (the docs site's share page asks "is a dashboard running?") ─────
  app.get("/ping", (c) => c.json({ ok: true, version: VERSION }, 200, PING_HEADERS));
  app.options("/ping", (c) => c.body(null, 204, PING_HEADERS));

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

  // One import endpoint for everything: the settings page's lessons.json upload (legacy, answered
  // with the settings flash), the lessons page's paste box / file picker / drop, and the
  // "Add to my lessons" button of the preview page. A URL in `text` is fetched server-side.
  app.post("/lessons/import", async (c) => {
    const body = await c.req.parseBody();
    const fromLessons = textField(body, "from") === "lessons";
    const invalid = (reason: "invalid" | "cross") =>
      c.redirect(
        fromLessons
          ? `/lessons?import=1&error=${reason}`
          : "/settings?imported=0&skipped=0&invalid=1",
        303,
      );
    if (isCrossSite(c)) return invalid("cross");
    // A browser posts an untouched <input type=file> as a zero-byte File — that is "no file".
    const file = body.file;
    const upload = file instanceof File && file.size > 0 ? await file.text() : null;
    let text = upload ?? textField(body, "text").trim();
    try {
      if (isHttpUrl(text) && !text.includes("#devcoach:lesson:"))
        text = await fetchSharedInput(text);
      const r = db.withConnection((conn) => coach.importSharedInput(conn, text));
      if (r.kind === "lessons" || !r.lesson) {
        return c.redirect(
          `/settings?imported=${r.inserted}&skipped=${r.duplicated}&invalid=${r.invalid}`,
          303,
        );
      }
      return c.redirect(
        `/lessons/${encodeURIComponent(r.lesson.id)}?imported=${r.inserted ? "1" : "dup"}`,
        303,
      );
    } catch (err) {
      if (err instanceof ShareInputError) return invalid("invalid");
      throw err;
    }
  });

  // Deep link from the docs site's share page (and a plain paste form): renders a preview and
  // NEVER writes — the lesson is stored only by the same-origin POST above.
  app.get("/lessons/import", (c) => {
    const code = (c.req.query("code") ?? "").trim();
    let preview: SharedLesson | null = null;
    let error: string | null = null;
    if (code) {
      try {
        preview = decodeShareCode(code);
      } catch (err) {
        error = err instanceof ShareInputError ? err.message : "That code could not be read.";
      }
    }
    return c.html(importPage({ code, preview, error, uiTheme: uiTheme() }));
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

    const importError = q.error === "invalid" || q.error === "cross" ? q.error : null;
    return c.html(
      lessonsPage({
        importOpen: q.import === "1",
        importError,
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

  // Share payloads: `?format=text|link` → text/plain, `md` → the .devcoach.md attachment,
  // no format → the #share-payloads fragment (HTMX re-render when name/context change).
  // POST carries name + include_context from the popover form and remembers the name.
  app.on(["GET", "POST"], "/lessons/:lesson_id/share", async (c: Context) => {
    const lesson = db.withConnection((conn) =>
      db.getLessonById(conn, c.req.param("lesson_id") ?? ""),
    );
    if (!lesson) return c.text("Lesson not found", 404);
    let name: string | undefined;
    let includeContext: boolean;
    if (c.req.method === "POST") {
      const body = await c.req.parseBody();
      name = textField(body, "name");
      includeContext = textField(body, "include_context") === "1";
    } else {
      name = c.req.query("name");
      includeContext = c.req.query("include_context") === "1";
    }
    rememberShareName(name);
    const state = shareState(lesson, { name, includeContext });
    const format = c.req.query("format");
    if (format === "text") return c.text(state.text);
    if (format === "link") return c.text(state.link);
    if (format === "md") {
      return new Response(state.markdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${state.filename}"`,
        },
      });
    }
    return c.html(shareFragment(state));
  });

  app.get("/lessons/:lesson_id", (c) => {
    const lesson = db.withConnection((conn) => db.getLessonById(conn, c.req.param("lesson_id")));
    if (!lesson) return c.html("<h1>Lesson not found</h1>", 404);
    const q = c.req.query();
    const imported = q.imported === "1" ? "new" : q.imported === "dup" ? "dup" : null;
    return c.html(
      lessonDetailPage({
        lesson,
        uiTheme: uiTheme(),
        share: shareState(lesson, { open: q.share === "1" }),
        imported,
      }),
    );
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
    const nudgeEvery = Math.max(0, Number.parseInt(textField(body, "nudge_every", "10"), 10) || 0);
    let nudgeScope = textField(body, "nudge_scope", "session");
    if (nudgeScope !== "session" && nudgeScope !== "global") nudgeScope = "session";
    db.withConnection((conn) => {
      db.setSetting(conn, "max_per_day", String(maxPerDay));
      db.setSetting(conn, "min_gap_minutes", String(Number.isNaN(minGap) ? 240 : minGap));
      db.setSetting(conn, "ui_theme", theme);
      db.setSetting(conn, "nudge_every", String(nudgeEvery));
      db.setSetting(conn, "nudge_scope", nudgeScope);
      db.setSetting(conn, "share_name", textField(body, "share_name").trim().slice(0, 80));
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
