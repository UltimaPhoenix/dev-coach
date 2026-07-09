// SQLite schema, migrations, and pure query helpers (node:sqlite).
// Uses Node's embedded node:sqlite (DatabaseSync, synchronous) so the port maps 1:1 onto the
// Python sqlite3 code. The schema MUST stay byte-identical with db.py — both runtimes share
// ~/.devcoach/coaching.db (idempotent CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Load node:sqlite via createRequire so the bundler can't rewrite the "node:" specifier
// (esbuild's builtin list predates node:sqlite and emits a bare, unresolvable "sqlite" import).
const { DatabaseSync: DatabaseSyncImpl } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

import {
  type KnowledgeEntry,
  type KnowledgeGroup,
  type Lesson,
  type NudgeScope,
  parseLesson,
  type Settings,
  type UiTheme,
} from "./models";

// ── Constants ────────────────────────────────────────────────────────────────

// DEVCOACH_DIR env override: test/e2e sandboxing only — the documented exception to
// the "paths always derive from os.homedir()" rule.
export const DEVCOACH_DIR = process.env.DEVCOACH_DIR ?? join(homedir(), ".devcoach");
export const DB_PATH = join(DEVCOACH_DIR, "coaching.db");
export const LEARNING_STATE_PATH = join(DEVCOACH_DIR, "learning-state.md");

const ZIP_SETTINGS = "settings.json";
const ZIP_LESSONS = "lessons.json";
const ZIP_KNOWLEDGE = "knowledge.json";
const ZIP_NOTEBOOK = "learning-state.md";

export const DEFAULT_PROFILE: Record<string, number> = {
  engineering: 8,
  architecture: 8,
  patterns: 7,
  debugging: 8,
  node: 7,
  javascript: 7,
  typescript: 6,
  python: 4,
  django: 3,
  fastapi: 4,
  docker: 8,
  traefik: 7,
  coolify: 7,
  postgresql: 6,
  redis: 6,
  git: 7,
  ci_cd: 6,
  security: 5,
  performance: 6,
  testing: 5,
  linux: 7,
  networking: 6,
  react: 5,
  frontend: 5,
};

export const DEFAULT_SETTINGS: Record<string, string> = {
  max_per_day: "2",
  min_gap_minutes: "240",
  ui_theme: "system",
  nudge_every: "10",
  nudge_scope: "session",
};

/** Cap on how many session rows nudge_state keeps (pruned hard on every bump). */
export const MAX_NUDGE_SESSIONS = 50;

// ── Low-level helpers ────────────────────────────────────────────────────────

type SqlParam = string | number | bigint | Uint8Array | null;
type Row = Record<string, string | number | bigint | Uint8Array | null>;

function allRows(db: DatabaseSync, sql: string, ...params: SqlParam[]): Row[] {
  return db.prepare(sql).all(...params);
}
function getRow(db: DatabaseSync, sql: string, ...params: SqlParam[]): Row | undefined {
  return db.prepare(sql).get(...params);
}
function runSql(db: DatabaseSync, sql: string, ...params: SqlParam[]): number {
  return Number(db.prepare(sql).run(...params).changes);
}

// ── Connection ───────────────────────────────────────────────────────────────

export function getConnection(dbPath: string = DB_PATH): DatabaseSync {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSyncImpl(dbPath);
  // Two writers can collide (the MCP server plus a Stop hook from a concurrent
  // session); wait briefly instead of failing SQLITE_BUSY and dropping a cue.
  db.exec("PRAGMA busy_timeout = 3000");
  return db;
}

/**
 * Schema stamp for the fast path: when `PRAGMA user_version` already matches, the whole
 * DDL/seed batch is skipped (hooks run on every agent stop — one pragma read beats ~14
 * idempotent statements). Bump it whenever initSchema/migrate changes. The legacy Python
 * runtime ignores user_version, so stamping is safe on the shared DB.
 */
export const SCHEMA_VERSION = 1;

export function getInitializedConnection(dbPath: string = DB_PATH): DatabaseSync {
  const db = getConnection(dbPath);
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  if (Number(row?.user_version ?? 0) !== SCHEMA_VERSION) {
    initSchema(db);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

/** Run `fn` atomically: one IMMEDIATE transaction — a single lock/journal cycle. */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // connection unusable — the original error matters more
    }
    throw err;
  }
}

/** Open an initialized connection, run `fn`, and guarantee close (mirrors db.connection()). */
export function withConnection<T>(fn: (db: DatabaseSync) => T, dbPath: string = DB_PATH): T {
  const db = getInitializedConnection(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

// ── Schema init ──────────────────────────────────────────────────────────────

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
        id                  TEXT PRIMARY KEY,
        timestamp           TEXT NOT NULL,
        topic_id            TEXT NOT NULL,
        categories          TEXT NOT NULL,
        title               TEXT NOT NULL,
        level               TEXT NOT NULL,
        summary             TEXT NOT NULL,
        body                TEXT,
        task_context        TEXT,
        project             TEXT,
        repository          TEXT,
        branch              TEXT,
        commit_hash         TEXT,
        folder              TEXT,
        feedback            TEXT,
        repository_platform TEXT,
        starred             INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS knowledge (
        topic       TEXT PRIMARY KEY,
        confidence  INTEGER NOT NULL DEFAULT 5,
        updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_group_names (
        group_name TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS knowledge_groups (
        group_name TEXT NOT NULL,
        topic      TEXT NOT NULL,
        PRIMARY KEY (group_name, topic)
    );

    -- Runtime-only: per-session interaction counter for lesson-cue pacing.
    -- Never exported/imported (backup carries config, not this state).
    CREATE TABLE IF NOT EXISTS nudge_state (
        session_id    TEXT PRIMARY KEY,
        interactions  INTEGER NOT NULL DEFAULT 0,
        updated_at    TEXT NOT NULL
    );

    -- Runtime-only, single row: cue lifecycle. pending=1 between an emitted cue and
    -- its resolution (log_lesson or skip_lesson), arming a shorter retry threshold.
    -- display_pending=1 between log_lesson and the next stop, where the hook verifies
    -- the lesson card is actually visible (last_assistant_message) and recovers it.
    CREATE TABLE IF NOT EXISTS cue_state (
        id               INTEGER PRIMARY KEY CHECK (id = 1),
        pending          INTEGER NOT NULL DEFAULT 0,
        last_cue_at      TEXT,
        last_skip_reason TEXT,
        display_pending  INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_timestamp ON lessons (timestamp);
    CREATE INDEX IF NOT EXISTS idx_lessons_starred_ts ON lessons (starred, timestamp);
    CREATE INDEX IF NOT EXISTS idx_lessons_feedback ON lessons (feedback);
    CREATE INDEX IF NOT EXISTS idx_lessons_topic_id ON lessons (topic_id);
  `);
  migrate(db);
  seedDefaults(db);
}

function migrate(db: DatabaseSync): void {
  try {
    db.exec("ALTER TABLE lessons ADD COLUMN body TEXT");
  } catch {
    // column already exists
  }
  try {
    db.exec("ALTER TABLE cue_state ADD COLUMN display_pending INTEGER NOT NULL DEFAULT 0");
  } catch {
    // column already exists
  }
}

function seedDefaults(db: DatabaseSync): void {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    runSql(db, "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", key, value);
  }
}

// ── Lessons ──────────────────────────────────────────────────────────────────

const INSERT_COLUMNS =
  "(id, timestamp, topic_id, categories, title, level, summary, body, " +
  "task_context, project, repository, branch, commit_hash, folder, " +
  "repository_platform, starred, feedback)";
const INSERT_PLACEHOLDERS = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

function lessonInsertParams(lesson: Lesson): SqlParam[] {
  return [
    lesson.id,
    lesson.timestamp,
    lesson.topic_id,
    JSON.stringify(lesson.categories),
    lesson.title,
    lesson.level,
    lesson.summary,
    lesson.body,
    lesson.task_context,
    lesson.project,
    lesson.repository,
    lesson.branch,
    lesson.commit_hash,
    lesson.folder,
    lesson.repository_platform,
    lesson.starred ? 1 : 0,
    lesson.feedback,
  ];
}

export function insertLesson(db: DatabaseSync, lesson: Lesson): void {
  runSql(
    db,
    `INSERT OR REPLACE INTO lessons ${INSERT_COLUMNS} VALUES ${INSERT_PLACEHOLDERS}`,
    ...lessonInsertParams(lesson),
  );
}

export interface LessonFilters {
  period?: string | null;
  category?: string | null;
  level?: string | null;
  project?: string | null;
  repository?: string | null;
  branch?: string | null;
  commit?: string | null;
  starred?: boolean | null;
  search?: string | null;
  feedback?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

type AddClause = (clause: string, ...vals: SqlParam[]) => void;

// Substring (LIKE '%…%') filters that share the same shape: [filter key, column].
const LIKE_COLUMNS: [keyof LessonFilters, string][] = [
  ["project", "project"],
  ["repository", "repository"],
  ["branch", "branch"],
  ["commit", "commit_hash"],
];

function addDateRange(f: LessonFilters, add: AddClause): void {
  if (f.date_from == null && f.date_to == null) {
    const cutoff = periodToCutoff(f.period ?? null);
    if (cutoff != null) add("timestamp >= ?", cutoff);
    return;
  }
  if (f.date_from != null) add("timestamp >= ?", f.date_from);
  if (f.date_to != null) {
    const hasTime = f.date_to.includes("T") || f.date_to.includes(" ");
    add("timestamp <= ?", hasTime ? f.date_to : `${f.date_to}T23:59:59`);
  }
}

function lessonWhere(f: LessonFilters): { where: string; params: SqlParam[] } {
  const conditions: string[] = [];
  const params: SqlParam[] = [];
  const add: AddClause = (clause, ...vals) => {
    conditions.push(clause);
    params.push(...vals);
  };

  addDateRange(f, add);

  if (f.category != null) add(`categories LIKE ?`, `%"${f.category}"%`);
  if (f.level != null) add("level = ?", f.level);
  for (const [key, col] of LIKE_COLUMNS) {
    const v = f[key];
    if (v != null) add(`${col} LIKE ?`, `%${v}%`);
  }
  if (f.starred != null) add("starred = ?", f.starred ? 1 : 0);
  if (f.search != null) {
    const like = `%${f.search}%`;
    add(
      "(title LIKE ? OR topic_id LIKE ? OR summary LIKE ? OR body LIKE ?)",
      like,
      like,
      like,
      like,
    );
  }
  if (f.feedback === "none") add("feedback IS NULL");
  else if (f.feedback != null) add("feedback = ?", f.feedback);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export function countFilteredLessons(db: DatabaseSync, f: LessonFilters = {}): number {
  const { where, params } = lessonWhere(f);
  const r = getRow(db, `SELECT COUNT(*) AS n FROM lessons ${where}`, ...params);
  return Number(r?.n ?? 0);
}

const SORT_COLUMNS = new Set(["timestamp", "level", "topic_id", "title", "feedback"]);
const METADATA_COLUMNS = new Set([
  "project",
  "repository",
  "branch",
  "commit_hash",
  "repository_platform",
]);

export interface GetLessonsOptions extends LessonFilters {
  sort?: string;
  order?: string;
  page?: number | null;
  per_page?: number;
}

export function getLessons(db: DatabaseSync, opts: GetLessonsOptions = {}): Lesson[] {
  const { where, params } = lessonWhere(opts);
  const col = opts.sort && SORT_COLUMNS.has(opts.sort) ? opts.sort : "timestamp";
  const direction = (opts.order ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  let query = `SELECT * FROM lessons ${where} ORDER BY ${col} ${direction}`;
  const queryParams = [...params];
  if (opts.page != null) {
    const perPage = opts.per_page ?? 25;
    query += " LIMIT ? OFFSET ?";
    queryParams.push(perPage, (opts.page - 1) * perPage);
  }
  return allRows(db, query, ...queryParams).map(rowToLesson);
}

export function deleteLesson(db: DatabaseSync, lessonId: string): boolean {
  return runSql(db, "DELETE FROM lessons WHERE id = ?", lessonId) > 0;
}

export function setStar(db: DatabaseSync, lessonId: string, starred: boolean): boolean {
  return runSql(db, "UPDATE lessons SET starred = ? WHERE id = ?", starred ? 1 : 0, lessonId) > 0;
}

export function setFeedback(
  db: DatabaseSync,
  lessonId: string,
  feedback: string | null,
): string | null {
  runSql(db, "UPDATE lessons SET feedback = ? WHERE id = ?", feedback || null, lessonId);
  const r = getRow(db, "SELECT topic_id FROM lessons WHERE id = ?", lessonId);
  return r ? (r.topic_id as string) : null;
}

export function exportLessons(db: DatabaseSync): Lesson[] {
  return allRows(db, "SELECT * FROM lessons ORDER BY timestamp DESC").map(rowToLesson);
}

export function importLessons(
  db: DatabaseSync,
  records: unknown[],
): { inserted: number; duplicated: number; invalid: number } {
  let inserted = 0;
  let duplicated = 0;
  let invalid = 0;
  for (const r of records) {
    let lesson: Lesson;
    try {
      lesson = parseLesson(r);
    } catch {
      invalid += 1;
      continue;
    }
    const changes = runSql(
      db,
      `INSERT OR IGNORE INTO lessons ${INSERT_COLUMNS} VALUES ${INSERT_PLACEHOLDERS}`,
      ...lessonInsertParams(lesson),
    );
    if (changes > 0) inserted += 1;
    else duplicated += 1;
  }
  return { inserted, duplicated, invalid };
}

export function getDistinctColumn(db: DatabaseSync, column: string): string[] {
  if (!METADATA_COLUMNS.has(column))
    throw new Error(`Column not allowed: ${JSON.stringify(column)}`);
  const rows = allRows(
    db,
    `SELECT DISTINCT ${column} FROM lessons WHERE ${column} IS NOT NULL ORDER BY ${column}`,
  );
  return rows.map((r) => r[column] as string);
}

export function getLessonById(db: DatabaseSync, lessonId: string): Lesson | null {
  const r = getRow(db, "SELECT * FROM lessons WHERE id = ?", lessonId);
  return r ? rowToLesson(r) : null;
}

export function getAllCategories(db: DatabaseSync): string[] {
  const rows = allRows(
    db,
    "SELECT DISTINCT value FROM lessons, json_each(lessons.categories) ORDER BY value",
  );
  return rows.map((r) => r.value as string);
}

export function getTaughtTopicIds(db: DatabaseSync): string[] {
  return allRows(db, "SELECT DISTINCT topic_id FROM lessons").map((r) => r.topic_id as string);
}

export function countLessonsSince(db: DatabaseSync, since: string): number {
  const r = getRow(db, "SELECT COUNT(*) AS n FROM lessons WHERE timestamp >= ?", since);
  return Number(r?.n ?? 0);
}

export function getLastLessonTimestamp(db: DatabaseSync): string | null {
  const r = getRow(db, "SELECT timestamp FROM lessons ORDER BY timestamp DESC LIMIT 1");
  return r ? (r.timestamp as string) : null;
}

// ── Knowledge ────────────────────────────────────────────────────────────────

export function getAllKnowledge(db: DatabaseSync): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of allRows(db, "SELECT topic, confidence FROM knowledge")) {
    out[r.topic as string] = Number(r.confidence);
  }
  return out;
}

export function getKnowledgeEntries(db: DatabaseSync): KnowledgeEntry[] {
  return allRows(db, "SELECT topic, confidence FROM knowledge ORDER BY topic").map((r) => ({
    topic: r.topic as string,
    confidence: Number(r.confidence),
  }));
}

export function getKnowledgeGroupList(db: DatabaseSync): KnowledgeGroup[] {
  const names = allRows(db, "SELECT group_name FROM knowledge_group_names ORDER BY group_name").map(
    (r) => r.group_name as string,
  );
  const assignments = new Map<string, string[]>();
  for (const r of allRows(
    db,
    "SELECT group_name, topic FROM knowledge_groups ORDER BY group_name, topic",
  )) {
    const g = r.group_name as string;
    const list = assignments.get(g) ?? [];
    list.push(r.topic as string);
    assignments.set(g, list);
  }
  return names.map((n) => ({ name: n, topics: assignments.get(n) ?? [] }));
}

export function upsertKnowledge(db: DatabaseSync, topic: string, confidence: number): void {
  const clamped = Math.max(0, Math.min(10, confidence));
  const now = new Date().toISOString();
  runSql(
    db,
    `INSERT INTO knowledge (topic, confidence, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(topic) DO UPDATE SET confidence = excluded.confidence, updated_at = excluded.updated_at`,
    topic,
    clamped,
    now,
  );
}

export function deleteKnowledge(db: DatabaseSync, topic: string): boolean {
  const changes = runSql(db, "DELETE FROM knowledge WHERE topic = ?", topic);
  runSql(db, "DELETE FROM knowledge_groups WHERE topic = ?", topic);
  return changes > 0;
}

// ── Knowledge groups ─────────────────────────────────────────────────────────

export function getKnowledgeGroups(db: DatabaseSync): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of getKnowledgeGroupList(db)) out[g.name] = g.topics;
  return out;
}

export function addGroup(db: DatabaseSync, groupName: string): boolean {
  const name = groupName.trim();
  if (!name) throw new Error("Group name must not be empty");
  return (
    runSql(db, "INSERT OR IGNORE INTO knowledge_group_names (group_name) VALUES (?)", name) > 0
  );
}

export function deleteGroup(db: DatabaseSync, groupName: string): boolean {
  runSql(db, "DELETE FROM knowledge_groups WHERE group_name = ?", groupName);
  return runSql(db, "DELETE FROM knowledge_group_names WHERE group_name = ?", groupName) > 0;
}

export function assignTopicToGroup(db: DatabaseSync, topic: string, groupName: string): void {
  runSql(db, "INSERT OR IGNORE INTO knowledge_group_names (group_name) VALUES (?)", groupName);
  runSql(db, "DELETE FROM knowledge_groups WHERE topic = ?", topic);
  runSql(
    db,
    "INSERT OR IGNORE INTO knowledge_groups (group_name, topic) VALUES (?, ?)",
    groupName,
    topic,
  );
}

export function unassignTopicFromGroup(db: DatabaseSync, topic: string): void {
  runSql(db, "DELETE FROM knowledge_groups WHERE topic = ?", topic);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function getSettings(db: DatabaseSync): Settings {
  const data: Record<string, string> = {};
  for (const r of allRows(db, "SELECT key, value FROM settings")) {
    data[r.key as string] = r.value as string;
  }
  const mgm = data.min_gap_minutes;
  const mhb = data.min_hours_between;
  let gap: number;
  if (mgm !== undefined) gap = Number.parseInt(mgm, 10);
  else if (mhb !== undefined)
    gap = Number.parseInt(mhb, 10) * 60; // migrate hours → minutes
  else gap = 240;
  const maxRaw = data.max_per_day;
  const rawTheme = data.ui_theme ?? "system";
  const theme: UiTheme =
    rawTheme === "dark" || rawTheme === "light" || rawTheme === "system" ? rawTheme : "system";
  const nudgeEveryRaw = data.nudge_every;
  const nudgeEvery = nudgeEveryRaw !== undefined ? Number.parseInt(nudgeEveryRaw, 10) : 10;
  const nudgeScope: NudgeScope = data.nudge_scope === "global" ? "global" : "session";
  return {
    max_per_day: maxRaw !== undefined ? Number.parseInt(maxRaw, 10) : 2,
    min_gap_minutes: gap,
    ui_theme: theme,
    nudge_every: Number.isFinite(nudgeEvery) && nudgeEvery >= 0 ? nudgeEvery : 10,
    nudge_scope: nudgeScope,
  };
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  runSql(
    db,
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

// ── Nudge state (runtime lesson-cue pacing; not exported) ──────────────────────

/**
 * Increment the current session's interaction counter, prune to the most-recent
 * MAX_NUDGE_SESSIONS rows, and return the count for the gate: the session's own count
 * (`scope === "session"`) or the SUM across all sessions (`scope === "global"`).
 */
export function bumpNudge(db: DatabaseSync, sessionId: string, scope: string): number {
  const row = getRow(
    db,
    "INSERT INTO nudge_state (session_id, interactions, updated_at) VALUES (?, 1, ?) " +
      "ON CONFLICT(session_id) DO UPDATE SET interactions = interactions + 1, " +
      "updated_at = excluded.updated_at RETURNING interactions",
    sessionId,
    new Date().toISOString(),
  );
  const own = Number(row?.interactions ?? 0);
  // Only a brand-new session row (interactions = 1) can grow the table past the cap —
  // prune just then, keeping the most-recently-updated rows.
  if (own === 1) {
    runSql(
      db,
      "DELETE FROM nudge_state WHERE session_id NOT IN " +
        "(SELECT session_id FROM nudge_state ORDER BY updated_at DESC LIMIT ?)",
      MAX_NUDGE_SESSIONS,
    );
  }
  return scope === "global" ? peekNudge(db, sessionId, scope) : own;
}

export interface NudgeSessionRow {
  session_id: string;
  interactions: number;
  updated_at: string;
}

/** All session counters, most recently active first (doctor). */
export function listNudgeSessions(db: DatabaseSync): NudgeSessionRow[] {
  return allRows(
    db,
    "SELECT session_id, interactions, updated_at FROM nudge_state ORDER BY updated_at DESC",
  ).map((r) => ({
    session_id: String(r.session_id),
    interactions: Number(r.interactions),
    updated_at: String(r.updated_at),
  }));
}

/** Read the current counter without bumping (doctor / prompt-hook dry runs). */
export function peekNudge(db: DatabaseSync, sessionId: string, scope: string): number {
  const row =
    scope === "global"
      ? getRow(db, "SELECT COALESCE(SUM(interactions), 0) AS n FROM nudge_state")
      : getRow(db, "SELECT interactions AS n FROM nudge_state WHERE session_id = ?", sessionId);
  return Number(row?.n ?? 0);
}

/** Clear all interaction counters and disarm the retry window — a lesson was recorded. */
export function resetNudge(db: DatabaseSync): void {
  runSql(db, "DELETE FROM nudge_state");
  runSql(db, "UPDATE cue_state SET pending = 0 WHERE id = 1");
}

// ── Cue state (runtime lesson-cue lifecycle) ────────────────────────────────────

/** After an unresolved cue, retry at min(NUDGE_RETRY_AFTER, nudge_every) further stops. */
export const NUDGE_RETRY_AFTER = 3;

export interface CueState {
  pending: boolean;
  last_cue_at: string | null;
  last_skip_reason: string | null;
  display_pending: boolean;
}

export function getCueState(db: DatabaseSync): CueState {
  const row = getRow(
    db,
    "SELECT pending, last_cue_at, last_skip_reason, display_pending FROM cue_state WHERE id = 1",
  );
  return {
    pending: Number(row?.pending ?? 0) === 1,
    last_cue_at: (row?.last_cue_at as string | null) ?? null,
    last_skip_reason: (row?.last_skip_reason as string | null) ?? null,
    display_pending: Number(row?.display_pending ?? 0) === 1,
  };
}

/** A cue was emitted: re-start pacing from zero and arm the shorter retry threshold. */
export function markCuePending(db: DatabaseSync): void {
  runSql(
    db,
    "INSERT INTO cue_state (id, pending, last_cue_at) VALUES (1, 1, ?) " +
      "ON CONFLICT(id) DO UPDATE SET pending = 1, last_cue_at = excluded.last_cue_at",
    new Date().toISOString(),
  );
  runSql(db, "DELETE FROM nudge_state");
}

/**
 * The model declined explicitly (skip_lesson): the pacing window is resolved just like
 * a delivered lesson — counters restart, the retry window disarms, the why is kept.
 * This also lets a primed turn resolve BEFORE the Stop hook, so no block is needed.
 */
export function clearCuePending(db: DatabaseSync, reason?: string): void {
  runSql(
    db,
    "INSERT INTO cue_state (id, pending, last_skip_reason) VALUES (1, 0, ?) " +
      "ON CONFLICT(id) DO UPDATE SET pending = 0, last_skip_reason = excluded.last_skip_reason",
    reason ?? null,
  );
  runSql(db, "DELETE FROM nudge_state");
}

/** log_lesson saved a lesson: the next stop must verify the card is actually visible. */
export function markDisplayPending(db: DatabaseSync): void {
  runSql(
    db,
    "INSERT INTO cue_state (id, pending, display_pending) VALUES (1, 0, 1) " +
      "ON CONFLICT(id) DO UPDATE SET display_pending = 1",
  );
}

/** Read-and-clear the display flag — true when the last turn logged a lesson. */
export function takeDisplayPending(db: DatabaseSync): boolean {
  const row = getRow(db, "SELECT display_pending FROM cue_state WHERE id = 1");
  const pending = Number(row?.display_pending ?? 0) === 1;
  if (pending) runSql(db, "UPDATE cue_state SET display_pending = 0 WHERE id = 1");
  return pending;
}

export function isOnboardingComplete(db: DatabaseSync): { knowledge_ready: boolean } {
  const r = getRow(db, "SELECT COUNT(*) AS n FROM knowledge");
  return { knowledge_ready: Number(r?.n ?? 0) > 0 };
}

export function getUsageDefaults(db: DatabaseSync): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const col of ["project", "repository", "branch", "repository_platform"]) {
    const r = getRow(
      db,
      `SELECT ${col} AS v, COUNT(*) AS c FROM lessons WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY c DESC LIMIT 1`,
    );
    result[col] = r ? (r.v as string) : null;
  }
  return result;
}

// ── Backup / restore (ZIP, byte-compatible with the Python .zip) ─────────────

export function createBackupZip(db: DatabaseSync): Uint8Array {
  const settings = getSettings(db);
  const lessons = exportLessons(db);

  const entries = getKnowledgeEntries(db);
  const groups = getKnowledgeGroupList(db);
  const topicGroup = new Map<string, string>();
  for (const g of groups) for (const t of g.topics) topicGroup.set(t, g.name);
  const knowledgeData = {
    groups: groups.map((g) => g.name),
    topics: entries.map((e) => ({
      topic: e.topic,
      confidence: e.confidence,
      group: topicGroup.get(e.topic) ?? null,
    })),
  };

  const files: Record<string, Uint8Array> = {
    [ZIP_SETTINGS]: strToU8(JSON.stringify(settings, null, 2)),
    [ZIP_LESSONS]: strToU8(JSON.stringify(lessons, null, 2)),
    [ZIP_KNOWLEDGE]: strToU8(JSON.stringify(knowledgeData, null, 2)),
  };
  if (existsSync(LEARNING_STATE_PATH)) {
    files[ZIP_NOTEBOOK] = strToU8(readFileSync(LEARNING_STATE_PATH, "utf8"));
  }
  return zipSync(files);
}

export interface RestoreResult {
  settings: number;
  topics: number;
  groups: number;
  lessons: number;
  skipped: number;
  invalid: number;
  learning_state: number;
}

type Unzipped = Record<string, Uint8Array>;

function restoreSettingsSection(db: DatabaseSync, unzipped: Unzipped, result: RestoreResult): void {
  if (!(ZIP_SETTINGS in unzipped)) return;
  const s = JSON.parse(strFromU8(unzipped[ZIP_SETTINGS]));
  if ("max_per_day" in s) setSetting(db, "max_per_day", String(s.max_per_day));
  if ("min_gap_minutes" in s) setSetting(db, "min_gap_minutes", String(s.min_gap_minutes));
  if (s.ui_theme === "system" || s.ui_theme === "dark" || s.ui_theme === "light") {
    setSetting(db, "ui_theme", s.ui_theme);
  }
  if ("nudge_every" in s) setSetting(db, "nudge_every", String(s.nudge_every));
  if (s.nudge_scope === "session" || s.nudge_scope === "global") {
    setSetting(db, "nudge_scope", s.nudge_scope);
  }
  result.settings = 1;
}

function restoreKnowledgeSection(
  db: DatabaseSync,
  unzipped: Unzipped,
  result: RestoreResult,
): void {
  if (!(ZIP_KNOWLEDGE in unzipped)) return;
  const knowledge = JSON.parse(strFromU8(unzipped[ZIP_KNOWLEDGE]));
  if (!(knowledge && typeof knowledge === "object" && Array.isArray(knowledge.topics))) {
    // Legacy format: {topic: confidence, ...}
    for (const [topic, confidence] of Object.entries(knowledge)) {
      upsertKnowledge(db, topic, confidence as number);
    }
    result.topics = Object.keys(knowledge).length;
    return;
  }
  let groupsAdded = 0;
  for (const g of knowledge.groups ?? []) {
    if (addGroup(db, g)) groupsAdded += 1;
  }
  for (const item of knowledge.topics) {
    upsertKnowledge(db, item.topic, item.confidence);
    const group = item.group;
    if (group && group !== "Other") {
      if (addGroup(db, group)) groupsAdded += 1;
      assignTopicToGroup(db, item.topic, group);
    }
  }
  result.topics = knowledge.topics.length;
  result.groups = groupsAdded;
}

function restoreLessonsSection(db: DatabaseSync, unzipped: Unzipped, result: RestoreResult): void {
  if (!(ZIP_LESSONS in unzipped)) return;
  const lessonsData = JSON.parse(strFromU8(unzipped[ZIP_LESSONS]));
  const { inserted, duplicated, invalid } = importLessons(db, lessonsData);
  result.lessons = inserted;
  result.skipped = duplicated;
  result.invalid = invalid;
}

function restoreNotebookSection(unzipped: Unzipped, result: RestoreResult): void {
  if (!(ZIP_NOTEBOOK in unzipped)) return;
  mkdirSync(dirname(LEARNING_STATE_PATH), { recursive: true });
  writeFileSync(LEARNING_STATE_PATH, strFromU8(unzipped[ZIP_NOTEBOOK]), "utf8");
  result.learning_state = 1;
}

export function restoreBackupZip(db: DatabaseSync, data: Uint8Array): RestoreResult {
  const result: RestoreResult = {
    settings: 0,
    topics: 0,
    groups: 0,
    lessons: 0,
    skipped: 0,
    invalid: 0,
    learning_state: 0,
  };
  const unzipped = unzipSync(data);
  restoreSettingsSection(db, unzipped, result);
  restoreKnowledgeSection(db, unzipped, result);
  restoreLessonsSection(db, unzipped, result);
  restoreNotebookSection(unzipped, result);
  return result;
}

// ── Private helpers ──────────────────────────────────────────────────────────

export function periodToCutoff(period: string | null | undefined): string | null {
  const now = new Date();
  let cutoff: Date;
  if (period === "today") {
    cutoff = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
  } else if (period === "week") {
    cutoff = new Date(now.getTime() - 7 * 86_400_000);
  } else if (period === "month") {
    cutoff = new Date(now.getTime() - 30 * 86_400_000);
  } else if (period === "year") {
    cutoff = new Date(now.getTime() - 365 * 86_400_000);
  } else {
    return null;
  }
  return cutoff.toISOString();
}

function rowToLesson(row: Row): Lesson {
  let categories: string[] = [];
  try {
    const parsed = JSON.parse(row.categories as string);
    if (Array.isArray(parsed)) categories = parsed;
  } catch {
    categories = [];
  }
  return parseLesson({ ...row, categories, starred: Boolean(row.starred) });
}
