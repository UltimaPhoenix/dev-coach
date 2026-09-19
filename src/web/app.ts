// Hono web dashboard — pages rendered by views.ts (faithful Tailwind/Alpine markup).
// Bound to 127.0.0.1; forms use the POST→303 redirect pattern.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ServerType, serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { c, link } from "../cli/term";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { detectGitUserName } from "../core/git";
import type { KnowledgeEntry, Lesson } from "../core/models";
import {
  buildSharePayload,
  decodeShareCode,
  encodeShareCode,
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

// `git config user.name` is a subprocess; it does not change while the dashboard runs, so it is
// read once per process instead of on every lesson page view.
let gitUserNameCache: string | null | undefined;
function gitUserName(): string | null {
  if (gitUserNameCache === undefined) gitUserNameCache = detectGitUserName();
  return gitUserNameCache;
}

/**
 * The share popover's state for a lesson: the payload is built and encoded once; the text and
 * link renderings (what the fragment needs) are derived from that single code, and the
 * `.devcoach.md` file is rendered only by the download route.
 */
function shareState(
  lesson: Lesson,
  settingName: string | null,
  o: { name?: string | null; includeContext?: boolean; open?: boolean },
): { state: ShareState; payload: SharedLesson } {
  const sharedBy = resolveSharedBy({
    explicit: o.name ?? null,
    setting: settingName,
    gitUserName: gitUserName(),
  });
  const includeContext = o.includeContext ?? false;
  const payload = buildSharePayload(lesson, { includeContext, sharedBy });
  const code = encodeShareCode(payload);
  return {
    payload,
    state: {
      id: lesson.id,
      open: o.open ?? false,
      name: sharedBy ?? "",
      includeContext,
      text: renderShareText(payload, code),
      link: renderShareLink(payload, code),
    },
  };
}

function uiTheme(): string {
  try {
    return db.withConnection((c) => db.getSettings(c).ui_theme);
  } catch {
    return "system";
  }
}

// ── App ──────────────────────────────────────────────────────────────────────

export interface AppOptions {
  /** Invoked by POST /shutdown after the response is sent (startUi wires the graceful stop). */
  onShutdown?: () => void;
}

export function createApp(opts: AppOptions = {}): Hono {
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

  // ── Shutdown (`devcoach ui --stop`, the stop_ui tool) ─────────────────────
  // The dashboard started by the MCP open_ui tool is detached from any terminal, so Ctrl-C cannot
  // reach it; this is its off switch. Same-origin only: a web page elsewhere must not stop it.
  app.post("/shutdown", (c) => {
    if (isCrossSite(c)) return c.text("Forbidden", 403);
    setTimeout(() => opts.onShutdown?.(), 50); // answer first, then close
    return c.json({ ok: true });
  });
  app.get("/shutdown", (c) => c.text("Method Not Allowed", 405));

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

  // Same-origin only: a page elsewhere must never be able to delete a lesson. Imported lessons go
  // the same way; the same share can be imported again afterwards (duplicate detection only looks
  // at rows that still exist).
  app.post("/lessons/:lesson_id/delete", async (c) => {
    if (isCrossSite(c)) return c.text("Forbidden", 403);
    const body = await c.req.parseBody();
    const deleted = db.withConnection((conn) => db.deleteLesson(conn, c.req.param("lesson_id")));
    if (!deleted) return c.text("Lesson not found", 404);
    return c.redirect(safeRedirect(textField(body, "next") || undefined), 303);
  });

  // Share payloads: `?format=text|link` → text/plain, `md` → the .devcoach.md attachment,
  // no format → the #share-payloads fragment (HTMX re-render when name/context change).
  // POST carries name + include_context from the popover form; it remembers the name only when
  // the form says so (`persist=1`, sent on the input's change event — not on every keystroke).
  // The GET variants (fragment, formats, the download link) render with the name they carry but
  // never persist it. Same-origin only: a page elsewhere must not read a share or rename the sender.
  app.on(["GET", "POST"], "/lessons/:lesson_id/share", async (c: Context) => {
    if (isCrossSite(c)) return c.text("Forbidden", 403);
    let name: string | undefined;
    let includeContext: boolean;
    let persist = false;
    if (c.req.method === "POST") {
      const body = await c.req.parseBody();
      name = textField(body, "name");
      includeContext = textField(body, "include_context") === "1";
      persist = textField(body, "persist") === "1";
    } else {
      name = c.req.query("name");
      includeContext = c.req.query("include_context") === "1";
    }
    const found = db.withConnection((conn) => {
      const lesson = db.getLessonById(conn, c.req.param("lesson_id") ?? "");
      if (!lesson) return null;
      if (persist && name !== undefined) {
        db.setSetting(conn, "share_name", db.normalizeShareName(name));
      }
      return { lesson, settingName: db.getSettings(conn).share_name };
    });
    if (!found) return c.text("Lesson not found", 404);
    const { state, payload } = shareState(found.lesson, found.settingName, {
      name,
      includeContext,
    });
    const format = c.req.query("format");
    if (format === "text") return c.text(state.text);
    if (format === "link") return c.text(state.link);
    if (format === "md") {
      return new Response(renderShareMarkdownFile(payload), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${sharedLessonFilename(payload)}"`,
        },
      });
    }
    return c.html(shareFragment(state));
  });

  app.get("/lessons/:lesson_id", (c) => {
    const found = db.withConnection((conn) => {
      const lesson = db.getLessonById(conn, c.req.param("lesson_id"));
      if (!lesson) return null;
      const settings = db.getSettings(conn);
      return { lesson, settingName: settings.share_name, uiTheme: settings.ui_theme };
    });
    if (!found) return c.html("<h1>Lesson not found</h1>", 404);
    const q = c.req.query();
    const imported = q.imported === "1" ? "new" : q.imported === "dup" ? "dup" : null;
    return c.html(
      lessonDetailPage({
        lesson: found.lesson,
        uiTheme: found.uiTheme,
        share: shareState(found.lesson, found.settingName, { open: q.share === "1" }).state,
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
      db.setSetting(conn, "share_name", db.normalizeShareName(textField(body, "share_name")));
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

/**
 * Stop accepting, let in-flight responses finish for `graceMs`, then cut what is left.
 * Resolves once the server is closed; never rejects.
 */
export function gracefulShutdown(server: ServerType, graceMs = 2000): Promise<void> {
  // serve() returns an http.Server here; the union type also admits http2 servers, which lack
  // the connection helpers — hence the optional calls.
  const http = server as Partial<import("node:http").Server> & ServerType;
  return new Promise((resolve) => {
    const deadline = setTimeout(() => {
      http.closeAllConnections?.();
    }, graceMs);
    // A keep-alive socket turns idle the moment its response ends; sweep those every 100 ms so
    // close() completes as soon as the last in-flight response is out, not at the deadline.
    const sweep = setInterval(() => http.closeIdleConnections?.(), 100);
    server.close(() => {
      clearTimeout(deadline);
      clearInterval(sweep);
      resolve();
    });
    http.closeIdleConnections?.();
  });
}

export interface StartUiOptions {
  /** Called with the dashboard URL once it listens (used by `--open`). */
  onReady?: (url: string) => void;
  /** Install SIGINT/SIGTERM/SIGHUP handlers that shut down gracefully (default: true). */
  handleSignals?: boolean;
  /** Called when the port cannot be bound (default: print the message and exit with `exitCode`). */
  onListenError?: (failure: ListenFailure) => void;
}

/** Why `startUi` could not listen, already worded for the terminal. */
export interface ListenFailure {
  message: string;
  exitCode: number;
  /** Set when a devcoach dashboard already answers on that port. */
  existingUrl?: string;
}

/** Is a devcoach dashboard answering on `port`? Its version when yes, null otherwise. */
export async function pingUi(
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ version: string } | null> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/ping`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: unknown; version?: unknown };
    return body.ok === true ? { version: String(body.version ?? "") } : null;
  } catch {
    return null;
  }
}

/**
 * Turn a `listen` error into one clear line plus a hint: a dashboard already running on the port
 * (exit 0 — the user can open it, or stop it), another process on the port, a privileged port, or
 * anything else.
 */
export async function explainListenError(
  port: number,
  err: NodeJS.ErrnoException,
  ping: typeof pingUi = pingUi,
): Promise<ListenFailure> {
  if (err.code === "EADDRINUSE") {
    const running = await ping(port);
    if (running) {
      const url = `http://localhost:${port}`;
      const version = running.version ? ` (v${running.version})` : "";
      return {
        existingUrl: url,
        exitCode: 0,
        message: `${c.yellow("devcoach UI is already running at")} ${c.cyan(link(url))}${version}\n${c.dim(
          "Open it there, start another with --port <n>, or stop it with: devcoach ui --stop",
        )}`,
      };
    }
    return {
      exitCode: 1,
      message: `${c.red(`✗ Port ${port} is already in use by another process`)}\n${c.dim(
        "Pick another port: devcoach ui --port <n>",
      )}`,
    };
  }
  if (err.code === "EACCES") {
    return {
      exitCode: 1,
      message: c.red(`✗ Port ${port} is not allowed (permission denied) — use a port ≥ 1024`),
    };
  }
  return {
    exitCode: 1,
    message: c.red(`✗ Could not start the devcoach UI on port ${port}: ${err.message}`),
  };
}

export function startUi(port: number, opts: StartUiOptions = {}): ServerType {
  let stopping = false;
  // Stop accepting, drain, and let the process end on its own once the server is closed (nothing
  // else keeps the event loop alive: DB connections are per request). Signals add a hard exit so
  // a second Ctrl-C always wins.
  const stop = (why: string, exitAfter: boolean): void => {
    if (stopping) {
      if (exitAfter) process.exit(130);
      return;
    }
    stopping = true;
    if (process.stdout.isTTY) console.log(c.dim(`devcoach UI stopping (${why})…`));
    void gracefulShutdown(server).then(() => {
      if (exitAfter) process.exit(0);
    });
  };
  const app = createApp({ onShutdown: () => stop("stop requested", false) });
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    const url = `http://localhost:${info.port}`;
    console.log(`devcoach UI running at ${c.cyan(link(url))}`);
    if (process.stdout.isTTY) console.log(c.dim("Press Ctrl+C to stop"));
    opts.onReady?.(url);
  });
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const onSignal: Record<(typeof signals)[number], () => void> = {
    SIGINT: () => stop("SIGINT", true),
    SIGTERM: () => stop("SIGTERM", true),
    SIGHUP: () => stop("SIGHUP", true),
  };
  if (opts.handleSignals !== false) {
    for (const sig of signals) process.on(sig, onSignal[sig]);
  }
  // serve() calls listen() at once and reports failures (EADDRINUSE, EACCES, …) as an 'error'
  // event on the next tick; without a listener Node prints a stack trace and dies.
  server.once("error", (err: NodeJS.ErrnoException) => {
    for (const sig of signals) process.off(sig, onSignal[sig]);
    void explainListenError(port, err).then((failure) => {
      if (opts.onListenError) {
        opts.onListenError(failure);
        return;
      }
      console.error(failure.message);
      process.exit(failure.exitCode);
    });
  });
  return server;
}

/** Ask the dashboard on `port` to shut down; false when nothing answers there. */
export async function stopUi(port: number, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
