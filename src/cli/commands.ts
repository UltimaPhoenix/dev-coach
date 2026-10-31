import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { DatabaseSync } from "node:sqlite";
import { text as readStream } from "node:stream/consumers";
import { Command, InvalidArgumentError, Option } from "commander";
import { scanClaudeHistory } from "../core/claude-history";
import * as coach from "../core/coach";
import * as courses from "../core/courses";
import * as db from "../core/db";
import { detectStack, mergeStacks } from "../core/detect";
import { detectGitContext, detectGitUserName } from "../core/git";
import {
  type CourseWithSteps,
  DEFAULT_UI_PORT,
  FEEDBACK_ANSWERS,
  type Feedback,
  feedbackAnswer,
  type Lesson,
  NO_ANSWER,
} from "../core/models";
import { formatLessonForDisplay, topicCreatedNote } from "../core/prompts";
import {
  buildSharePayload,
  encodeShareCode,
  renderShareLink,
  renderShareMarkdownFile,
  renderShareText,
  resolveSharedBy,
  ShareInputError,
  sharedLessonFilename,
} from "../core/share";
import { fetchSharedInput, isHttpUrl } from "../core/share-fetch";
import { escapeControlCharsInJson, stripControlCharsDeep } from "../core/text";
import { VERSION } from "../version";
import { cmdDoctor, cmdInstall, cmdUninstall, skillHint } from "./install";
import {
  layoutWords,
  type Piece,
  phraseWords,
  proseWordCount,
  renderMarkdown,
  wrapPieces,
} from "./markdown";
import { openInBrowser } from "./open";
import {
  type Column,
  c,
  colorize,
  confidenceBar,
  confidenceColor,
  displayWidth,
  type Format,
  paintAll,
  readingWidth,
  renderTable,
  rule,
  sanitizeForTerminal,
  sanitizeLine,
  trustedLink,
} from "./term";

const log = (s = ""): void => {
  console.log(s);
};

/** An error: one red line on stderr (stdout stays clean for a pipe), then exit. */
function fail(message: string, code = 1): never {
  console.error(c.red(message));
  process.exit(code);
}

// The answers' words, glyphs and labels come from core (FEEDBACK_ANSWERS); colour means the answer.
const ANSWER_FORMAT: Record<Feedback, Format> = {
  know: "green",
  understood: "cyan",
  dont_know: "red",
};
/** An answer as a phrase in its colour (`✅ knew it`), or the dim unanswered state. */
const answerPhrase = (fb: Feedback | null): Piece => {
  const a = feedbackAnswer(fb);
  return a
    ? { text: `${a.glyph} ${a.label}`, formats: [ANSWER_FORMAT[a.value]] }
    : { text: `${NO_ANSWER.glyph} ${NO_ANSWER.label}`, formats: ["dim"] };
};
// What each CLI word records, for the help text and the unknown-word error.
const ANSWER_MEANING: Record<string, string> = {
  know: "already knew it: confidence +1 (an untracked topic is created at 6/10)",
  understood: "new to me, now clear: recorded, confidence unchanged",
  dont_know: "lost me: recorded, confidence unchanged; ask your agent for a course on it",
};
const answerWords = (last: string): string =>
  [...FEEDBACK_ANSWERS.map((a) => a.cli), last].join(" | ");

/** The words `feedback` accepts, one per line with what it records (unknown-word error). */
function answerWordsHelp(last: [string, string]): string {
  const rows: [string, string][] = [
    ...FEEDBACK_ANSWERS.map((a): [string, string] => [
      a.cli,
      `${a.glyph} ${ANSWER_MEANING[a.value] ?? a.label}`,
    ]),
    last,
  ];
  const w = Math.max(...rows.map(([word]) => word.length));
  return rows.map(([word, meaning]) => `  ${word.padEnd(w)}  ${meaning}`).join("\n");
}

/** A CLI word → the stored value it filters on (`lessons --feedback`); undefined if unknown. */
function feedbackFilterValue(word: string): string | undefined {
  if (word === NO_ANSWER.filter) return NO_ANSWER.filter;
  return FEEDBACK_ANSWERS.find((a) => a.cli === word)?.value;
}

/**
 * A lesson (or course) with every string made inert for the terminal. A shared lesson is someone
 * else's text, and a row imported before the import-time strip may still carry escape sequences.
 */
const printable = <T extends object>(record: T): T => stripControlCharsDeep(record);
const senderLabel = (sharedBy: string | null): string => sharedBy ?? c.dim("anonymous");
const senderPhrase = (sharedBy: string | null): string =>
  sharedBy ? `shared by ${sharedBy}` : "shared anonymously";

/** Rows as JSON for a script: the stored data, with nothing in it a terminal would act on. */
const inertJson = (value: unknown): string =>
  escapeControlCharsInJson(JSON.stringify(value, null, 2));

const SHELL_SAFE_RE = /^[\w./:@%+=,-]+$/;
/**
 * `s` as one shell word, for a command the user copies. A shared lesson keeps its sender's id,
 * so an id is someone else's text: anything beyond plain characters is single-quoted.
 */
const shellWord = (s: string): string =>
  SHELL_SAFE_RE.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`;

const twoDigits = (n: number): string => String(n).padStart(2, "0");
/** `YYYY-MM-DD` in the local time zone: the day the user lived the lesson. */
function localDate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
}

const dim = (text: string): Piece => ({ text, formats: ["dim"] });
const paintPiece = (p: Piece): string => paintAll(p.formats, p.text);

/** The port the dashboard runs on: `DEVCOACH_UI_PORT`, else the default. */
export function uiPort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.DEVCOACH_UI_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_UI_PORT;
}

/** How long `lesson` waits for the dashboard: a row is not worth a noticeable pause. */
export const DASHBOARD_PING_MS = 150;

/** Does a devcoach dashboard answer `/ping` on `port` within `timeoutMs`? Never throws. */
export async function dashboardAnswers(
  port: number,
  timeoutMs = DASHBOARD_PING_MS,
): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    return ((await res.json()) as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

/**
 * The pager for a long view on a terminal: `DEVCOACH_PAGER`, then `PAGER`, then `less -FRX`
 * (Windows only pages when one is set). Empty or `cat` means no pager.
 */
export function pagerCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const chosen = (env.DEVCOACH_PAGER ?? env.PAGER)?.trim();
  if (chosen !== undefined) return chosen === "" || chosen === "cat" ? null : chosen;
  return platform === "win32" ? null : "less -FRX";
}

/** `text` on stdout, through the pager when it is taller than the terminal. */
function printPaged(text: string, usePager: boolean): void {
  const { isTTY, rows } = process.stdout;
  const pager = usePager && isTTY ? pagerCommand() : null;
  if (pager && rows && text.split("\n").length > rows - 1) {
    const run = spawnSync(pager, {
      shell: true,
      input: `${text}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    });
    // 126/127: the shell found no pager to run, so the text is printed instead. Anything else
    // (quitting `less` before the end included) means the pager showed it.
    const noShell = (run.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
    if (!noShell && run.status !== 126 && run.status !== 127) return;
  }
  log(text);
}

// ── Display commands ─────────────────────────────────────────────────────────

/** Render the knowledge map as a Topic/Group/Confidence/Bar table (shared by `profile` + `setup`). */
function renderProfileTable(profile: ReturnType<typeof coach.getProfile>, title: string): string {
  const topicGroup = new Map<string, string>();
  for (const g of profile.groups) for (const t of g.topics) topicGroup.set(t, g.name);
  const rows = [...profile.knowledge]
    .sort((a, b) => b.confidence - a.confidence)
    .map((e) => {
      const color = confidenceColor(e.confidence);
      return [
        sanitizeLine(e.topic),
        sanitizeLine(topicGroup.get(e.topic) ?? "Other"),
        colorize(color, `${e.confidence}/10`),
        colorize(color, confidenceBar(e.confidence)),
      ];
    });
  return renderTable(
    title,
    [
      { header: "Topic" },
      { header: "Group" },
      { header: "Confidence", justify: "right" },
      { header: "Bar" },
    ],
    rows,
  );
}

/**
 * Read commands still work on a database a newer devcoach upgraded (the connection is
 * read-only); they end with one line saying so, so the silence of a refused write later is no
 * surprise. `compat` is captured inside the command's own connection.
 */
function readOnlyNotice(compat: db.SchemaCompat | null): void {
  if (compat) console.error(c.yellow(`→ ${db.readOnlyMessage(compat)}`));
}

function cmdProfile(): void {
  const { profile, compat } = db.withConnection((conn) => ({
    profile: coach.getProfile(conn),
    compat: db.compatOf(conn),
  }));
  log(renderProfileTable(profile, "Knowledge Map"));
  readOnlyNotice(compat);
}

interface LessonsOpts {
  period: string;
  category: string | null;
  project: string | null;
  repository: string | null;
  branch: string | null;
  commit: string | null;
  starred: boolean;
  imported: boolean;
  sharedBy: string | null;
  feedback: string | null;
  level: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
  sort: string;
  order: string;
  limit: number | null;
  json: boolean;
}

/** How many lessons `lessons` shows on a terminal unless `-n` says otherwise. */
export const DEFAULT_LIST_LIMIT = 20;

const REGEXP_SPECIAL_RE = /[.*+?^${}()|[\]\\]/g;

/** `text` as pieces in `base`, every `--search` word in it bold magenta. */
function highlighted(text: string, words: readonly string[], base: readonly Format[]): Piece[] {
  if (!words.length) return [{ text, formats: base }];
  const re = new RegExp(words.map((w) => w.replace(REGEXP_SPECIAL_RE, "\\$&")).join("|"), "giu");
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    if (m.index > last) pieces.push({ text: text.slice(last, m.index), formats: base });
    pieces.push({ text: m[0], formats: ["bold", "magenta"] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), formats: base });
  return pieces;
}

/** `Today`, `Yesterday`, else the weekday: the day header of `lessons`. */
function dayLabel(date: string, now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date === localDate(now)) return "Today";
  if (date === localDate(yesterday)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * Two light lines per lesson: the title (★ in the gutter when starred), then a dim
 * `id · topic · level · … · answer` line whose phrases never break. Day headers when the list is
 * in date order; any other order prints the date in the second line instead.
 */
function lessonsByDay(lessons: Lesson[], words: string[], byDay: boolean, width: number): string[] {
  const out: string[] = [];
  let day = "";
  for (const l of lessons) {
    const date = localDate(l.timestamp);
    if (byDay && date !== day) {
      out.push(`${c.bold(dayLabel(date))} ${c.dim(date)}`);
      day = date;
    }
    const gutter = l.starred ? `${c.yellow("★")} ` : "  ";
    out.push(...wrapPieces(highlighted(l.title, words, []), width, gutter, "  "));
    const phrases: Piece[][] = [
      highlighted(l.id, words, ["dim"]),
      [dim(l.topic_id)],
      [dim(l.level)],
    ];
    if (!byDay) phrases.push([dim(date)]);
    if (l.imported) phrases.push([dim(senderPhrase(l.shared_by))]);
    phrases.push([answerPhrase(l.feedback)]);
    out.push(...layoutWords(phraseWords(phrases), width, "    ", "    ", false));
  }
  return out;
}

/** The dim last lines of `lessons`: how many, how to open one, how to see the rest. */
function lessonsTrailer(
  shown: number,
  total: number,
  search: string | null,
  width: number,
): string[] {
  const noun = total === 1 ? "lesson" : "lessons";
  const count = shown < total ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
  const parts = [search ? `${count} matching "${sanitizeLine(search)}"` : count];
  parts.push("devcoach lesson <id> opens one");
  if (shown < total) parts.push(`-n ${total} for all`);
  return layoutWords(phraseWords(parts.map((p) => [dim(p)])), width);
}

function cmdLessons(o: LessonsOpts): void {
  const feedback = o.feedback === null ? null : feedbackFilterValue(o.feedback);
  if (feedback === undefined) {
    console.error(
      `${c.red(`Unknown answer '${o.feedback}'.`)} Filter with one of:\n` +
        answerWordsHelp([NO_ANSWER.filter, `${NO_ANSWER.glyph} ${NO_ANSWER.label}`]),
    );
    process.exit(1);
  }
  const filters: db.LessonFilters = {
    period: o.period === "all" ? null : o.period,
    category: o.category,
    level: o.level,
    project: o.project,
    repository: o.repository,
    branch: o.branch,
    commit: o.commit,
    starred: o.starred ? true : null,
    imported: o.imported || o.sharedBy ? true : null,
    shared_by: o.sharedBy,
    feedback,
    search: o.search,
    date_from: o.dateFrom,
    date_to: o.dateTo,
  };
  // Humans get a screenful (and a trailer that says how to see the rest); scripts get every row.
  const tty = Boolean(process.stdout.isTTY);
  const limit = o.limit ?? (tty && !o.json ? DEFAULT_LIST_LIMIT : null);
  const page = limit === null ? {} : { page: 1, per_page: limit };
  const { lessons, total, compat } = db.withConnection((conn) => ({
    lessons: db.getLessons(conn, { ...filters, ...page, sort: o.sort, order: o.order }),
    total: db.countFilteredLessons(conn, filters),
    compat: db.compatOf(conn),
  }));

  if (o.json) {
    log(inertJson(lessons));
  } else if (lessons.length === 0) {
    console.error(c.dim("No lessons found."));
  } else if (!tty) {
    // The pipe form: one tab-separated row per lesson, no colour, nothing cut.
    for (const l of lessons.map(printable)) {
      const answer = feedbackAnswer(l.feedback)?.cli ?? "-";
      log([localDate(l.timestamp), l.id, answer, l.title].join("\t"));
    }
  } else {
    const words = o.search?.split(/\s+/).filter(Boolean).map(sanitizeLine) ?? [];
    const width = readingWidth();
    const rows = lessonsByDay(lessons.map(printable), words, o.sort === "timestamp", width);
    const trailer = lessonsTrailer(lessons.length, total, o.search, width);
    log([...rows, "", ...trailer].join("\n"));
  }
  readOnlyNotice(compat);
}

interface LessonOpts {
  last?: boolean;
  short?: boolean;
  md?: boolean;
  json?: boolean;
  width?: number;
  pager?: boolean;
}

type LessonLookup =
  | { kind: "found"; lesson: Lesson; course: CourseWithSteps | undefined }
  | { kind: "missing" }
  | { kind: "ambiguous"; candidates: Lesson[] };

/** The course grown from a lesson: the active one first. */
function courseFor(conn: DatabaseSync, lessonId: string): CourseWithSteps | undefined {
  const list = courses.listCourses(conn, { lesson_id: lessonId });
  return list.find((course) => course.status === "active") ?? list[0];
}

/** An exact id, else a unique prefix of one; `--last` = the newest of your own lessons. */
function findLesson(id: string | undefined, last: boolean): LessonLookup {
  return db.withConnection((conn): LessonLookup => {
    let lesson = last
      ? (db.getLessons(conn, { imported: false, page: 1, per_page: 1 })[0] ?? null)
      : db.getLessonById(conn, id as string);
    if (!lesson && !last && id) {
      const candidates = db.getLessonsByIdPrefix(conn, id, 11);
      if (candidates.length > 1) return { kind: "ambiguous", candidates };
      lesson = candidates[0] ?? null;
    }
    return lesson
      ? { kind: "found", lesson, course: courseFor(conn, lesson.id) }
      : { kind: "missing" };
  });
}

/** The pre-2.8 view, kept as `lesson --short`: the metadata block, then the summary. */
function shortLessonView(lesson: Lesson): string[] {
  const out = [rule(c.bold(lesson.title))];
  out.push(`${c.dim("ID:")}         ${lesson.id}`);
  out.push(`${c.dim("Date:")}        ${lesson.timestamp.slice(0, 19).replace("T", " ")}`);
  out.push(`${c.dim("Topic:")}       ${lesson.topic_id}`);
  out.push(`${c.dim("Categories:")}  ${lesson.categories.join(", ")}`);
  out.push(`${c.dim("Level:")}       ${lesson.level}`);
  const starLabel = lesson.starred ? c.yellow("★ starred") : c.dim("☆ not starred");
  const answer = paintPiece(answerPhrase(lesson.feedback));
  out.push(`${c.dim("Star:")}        ${starLabel}   ${c.dim("Feedback:")} ${answer}`);
  if (lesson.imported) out.push(`${c.dim("Shared by:")}   ${senderLabel(lesson.shared_by)}`);
  if (lesson.task_context) out.push(`${c.dim("Context:")}     ${lesson.task_context}`);
  if (lesson.project || lesson.repository || lesson.branch || lesson.commit_hash || lesson.folder) {
    const parts: string[] = [];
    if (lesson.project) parts.push(`project=${lesson.project}`);
    if (lesson.repository) parts.push(`repo=${lesson.repository}`);
    if (lesson.branch) parts.push(`branch=${c.magenta(lesson.branch)}`);
    if (lesson.commit_hash) parts.push(`commit=${c.cyan(lesson.commit_hash.slice(0, 7))}`);
    if (lesson.folder) parts.push(`folder=${lesson.folder}`);
    out.push(`${c.dim("Git:")}         ${parts.join(" · ")}`);
  }
  out.push(rule(), lesson.summary);
  return out;
}

const FOOTER_LABEL_WIDTH = 11;

/**
 * A footer row: a dim label in an 11-column gutter, the value wrapped under itself. Nothing in
 * a footer is ever cut: an id, a link or a command too long for the line runs past it whole.
 */
function footerRow(label: string, pieces: Piece[], width: number): string[] {
  const gutter = c.dim(label.padEnd(FOOTER_LABEL_WIDTH));
  return wrapPieces(pieces, width, gutter, " ".repeat(FOOTER_LABEL_WIDTH), false);
}

/**
 * `devcoach lesson <id>`: the lesson in a left-anchored frame. Header rule, the title, a dim
 * `topic · level · date [· shared by] [· answer] [· ★]` line, the body, then a footer: the id,
 * the dashboard (a link only when it answers), the course grown from it, and — until it is
 * answered — the command that answers "Already knew it?".
 */
function lessonView(
  lesson: Lesson,
  course: CourseWithSteps | undefined,
  dashboard: string | null,
  width: number,
): string[] {
  const brand = "🎓 devcoach";
  const lead = `── ${brand} `;
  const out = [
    `${c.dim("── ")}${paintAll(["bold", "cyan"], brand)}${c.dim(` ${"─".repeat(Math.max(2, width - displayWidth(lead)))}`)}`,
    ...wrapPieces([{ text: lesson.title, formats: ["bold"] }], width),
  ];
  const meta: Piece[][] = [
    [dim(lesson.topic_id)],
    [dim(lesson.level)],
    [dim(localDate(lesson.timestamp))],
  ];
  if (lesson.imported) meta.push([dim(senderPhrase(lesson.shared_by))]);
  if (lesson.feedback) meta.push([answerPhrase(lesson.feedback)]);
  if (lesson.starred) meta.push([{ text: "★", formats: ["yellow"] }]);
  out.push(...layoutWords(phraseWords(meta), width), "");
  out.push(...renderMarkdown(lesson.body?.trim() || lesson.summary, width));
  out.push(c.dim("─".repeat(width)));
  out.push(...footerRow("id", [{ text: lesson.id, formats: [], nowrap: true }], width));
  const where = dashboard
    ? { text: c.underline(trustedLink(dashboard)), formats: [], nowrap: true }
    : { text: "devcoach ui -o", formats: [] };
  out.push(...footerRow("dashboard", [where], width));
  if (course) {
    const p = courses.progress(course);
    out.push(
      ...footerRow(
        "course",
        [{ text: `${course.title} · ${p.done}/${p.total}`, formats: [] }],
        width,
      ),
    );
  }
  if (!lesson.feedback) {
    const words = FEEDBACK_ANSWERS.flatMap((a, k): Piece[] => [
      ...(k ? [dim("|")] : []),
      { text: a.cli, formats: [ANSWER_FORMAT[a.value]], nowrap: true },
    ]);
    out.push(
      ...footerRow(
        "knew it?",
        [
          { text: "devcoach feedback ", formats: [] },
          { text: shellWord(lesson.id), formats: [], nowrap: true },
          { text: " ", formats: [] },
          ...words.map((w) => ({ ...w, nowrap: true })),
        ],
        width,
      ),
    );
  }
  return out;
}

async function cmdLesson(id: string | undefined, o: LessonOpts): Promise<void> {
  if (id !== undefined && o.last) fail("Give a lesson id or --last, not both.", 2);
  if (!id?.trim() && !o.last) {
    fail("Give a lesson id (or the start of one), or --last for the most recent one.", 2);
  }
  const found = findLesson(id, Boolean(o.last));
  if (found.kind === "ambiguous") {
    const list = found.candidates.slice(0, 10).map((l) => {
      const shown = printable(l);
      return `  ${shown.id}  ${c.dim(shown.title)}`;
    });
    const more = found.candidates.length > 10 ? ["  …"] : [];
    fail(
      [`'${sanitizeLine(id ?? "")}' starts more than one lesson id:`, ...list, ...more].join("\n"),
    );
  }
  if (found.kind === "missing") {
    fail(o.last ? "No lessons of your own yet." : `Lesson '${sanitizeLine(id ?? "")}' not found.`);
  }
  if (o.json) {
    log(inertJson(found.lesson));
    return;
  }
  const lesson = printable(found.lesson);
  if (o.md) {
    log(sanitizeForTerminal(formatLessonForDisplay(lesson)));
    return;
  }
  if (o.short) {
    log(shortLessonView(lesson).join("\n"));
    return;
  }
  const port = uiPort();
  const url = `http://127.0.0.1:${port}/lessons/${encodeURIComponent(lesson.id)}`;
  const dashboard = (await dashboardAnswers(port)) ? url : null;
  const view = lessonView(
    lesson,
    found.course && printable(found.course),
    dashboard,
    readingWidth(o.width),
  );
  printPaged(view.join("\n"), o.pager !== false);
}

function cmdStar(id: string, starred: boolean): void {
  const found = db.withConnection((conn) => {
    if (db.getLessonById(conn, id) === null) return false;
    db.setStar(conn, id, starred);
    return true;
  });
  if (!found) {
    fail(`Lesson '${id}' not found.`);
  }
  log(
    starred
      ? `Lesson ${c.cyan(id)} → ${c.yellow("★ starred")}`
      : `Lesson ${c.cyan(id)} → ${c.dim("☆ unstarred")}`,
  );
}

function cmdDelete(id: string): void {
  const found = db.withConnection((conn) => db.deleteLesson(conn, id));
  if (!found) {
    fail(`Lesson '${id}' not found.`);
  }
  log(`Lesson ${c.cyan(id)} deleted.`);
}

const courseStatusLabel = (status: string): string =>
  status === "completed"
    ? c.green(status)
    : status === "abandoned"
      ? c.dim(status)
      : c.cyan(status);

function cmdCourses(): void {
  const list = db.withConnection((conn) => courses.listCourses(conn)).map(printable);
  if (list.length === 0) {
    log(c.dim("No courses yet. Start one in your agent: /devcoach:course, or say yes after a ❌."));
    return;
  }
  const columns: Column[] = [
    { header: "ID" },
    { header: "Title" },
    { header: "Progress", justify: "center" },
    { header: "Status" },
    { header: "Updated" },
  ];
  const rows = list.map((course) => {
    const p = courses.progress(course);
    return [
      c.cyan(course.id),
      course.title,
      `${p.done}/${p.total}`,
      courseStatusLabel(course.status),
      course.updated_at.slice(0, 10),
    ];
  });
  log(renderTable("Courses", columns, rows));
}

function cmdCourse(id: string): void {
  const stored = db.withConnection((conn) => courses.getCourse(conn, id));
  if (stored === null) {
    fail(`Course '${id}' not found.`);
  }
  const course = printable(stored);
  const p = courses.progress(course);
  log(rule(c.bold(course.title)));
  log(`${c.dim("ID:")}        ${course.id}`);
  log(
    `${c.dim("Topic:")}     ${c.cyan(course.topic_id)}   ${c.dim("Status:")} ${courseStatusLabel(course.status)}   ${c.dim("Progress:")} ${p.done}/${p.total}`,
  );
  if (course.goal) log(`${c.dim("Goal:")}      ${course.goal}`);
  if (course.lesson_id) log(`${c.dim("From:")}      lesson ${c.cyan(course.lesson_id)}`);
  const doc = courses.courseDocument(course.id);
  log(
    `${c.dim("Document:")}  ${doc ?? c.dim(`not written yet → ${courses.documentPath(course.id)}`)}`,
  );
  if (course.prerequisites.length) {
    log(
      `${c.dim("Chain:")}     ${course.prerequisites
        .map((q) => (q.known ? c.green(`✅ ${q.concept}`) : c.red(`❌ ${q.concept}`)))
        .join(c.dim(" → "))}`,
    );
  }
  log("");
  if (course.steps.length === 0) {
    log(c.dim("No steps registered yet."));
    return;
  }
  for (const step of course.steps) {
    const icon =
      step.status === "done" ? c.green("●") : step.status === "skipped" ? c.dim("◌") : c.cyan("○");
    log(
      `  ${icon} ${step.position}. ${step.title}  ${c.dim(`${step.kind} · #${step.anchor}${step.status !== "todo" ? ` · ${step.status}` : ""}`)}`,
    );
  }
}

/**
 * What an answer changed, as the dim second line of `feedback`: the confidence before the call
 * against the one the recorded result reports (a clamped +1 at 10 changes nothing, and says so).
 */
function feedbackConsequence(
  result: coach.FeedbackResult,
  before: number | null,
  value: Feedback | null,
  course: CourseWithSteps | undefined,
): Piece[][] {
  const phrases: Piece[][] = [[dim(sanitizeLine(result.topic_id))]];
  if (before !== null && result.confidence !== null && before !== result.confidence) {
    phrases.push([
      dim(`confidence ${before} → `),
      { text: String(result.confidence), formats: ["bold"] },
    ]);
  } else {
    phrases.push([dim("confidence unchanged")]);
  }
  if (value !== null && result.previous === value) phrases.push([dim("already recorded")]);
  if (value === "understood") {
    phrases.push([dim("the level was right")]);
  } else if (value === "dont_know" && course) {
    const p = courses.progress(course);
    phrases.push([
      dim(`continue the course · ${p.done}/${p.total} · devcoach course ${course.id}`),
    ]);
  } else if (value === "dont_know") {
    phrases.push([dim("ask your agent for a course on it")]);
  }
  return phrases;
}

/**
 * `devcoach feedback <id> <answer>` in two lines: what was recorded on which lesson, then what it
 * changed — the confidence move comes from the result, never a literal +1.
 */
function cmdFeedback(id: string, word: string): void {
  const answer = FEEDBACK_ANSWERS.find((a) => a.cli === word);
  if (!answer && word !== NO_ANSWER.cli) {
    console.error(
      `${c.red(`Unknown answer '${sanitizeLine(word)}'.`)} Answer "Already knew it?" with one of:\n` +
        answerWordsHelp([NO_ANSWER.cli, "remove the answer"]),
    );
    process.exit(1);
  }
  const value = answer?.value ?? null;
  const outcome = db.withConnection((conn) => {
    const lesson = db.getLessonById(conn, id);
    if (lesson === null) return null;
    const before = db.getAllKnowledge(conn)[lesson.topic_id] ?? null;
    const result = coach.recordFeedback(conn, id, value);
    if (result === null) return null;
    const course = value === "dont_know" ? courseFor(conn, id) : undefined;
    return { result, before, title: lesson.title, course: course && printable(course) };
  });
  if (outcome === null) fail(`Lesson '${sanitizeLine(id)}' not found.`);
  const { result, before, title, course } = outcome;
  const width = readingWidth();
  const recorded: Piece = answer
    ? answerPhrase(answer.value)
    : dim(`${NO_ANSWER.glyph} answer cleared`);
  const line = [recorded, dim(" · "), { text: sanitizeLine(title), formats: [] }];
  log(wrapPieces(line, width, "", "   ").join("\n"));
  const changed =
    result.topic_created && result.confidence !== null
      ? wrapPieces(
          [dim(topicCreatedNote(sanitizeLine(result.topic_id), result.confidence))],
          width,
          "   ",
        )
      : layoutWords(phraseWords(feedbackConsequence(result, before, value, course)), width, "   ");
  log(changed.join("\n"));
}

function cmdSettings(): void {
  const s = db.withConnection((conn) => db.getSettings(conn));
  const gapH = Math.floor(s.min_gap_minutes / 60);
  const gapM = s.min_gap_minutes % 60;
  const gapLabel = gapH ? `${gapH}h ${gapM}m` : `${gapM}m`;
  log(
    renderTable(
      "Settings",
      [{ header: "Key" }, { header: "Value", justify: "right" }],
      [
        ["max_per_day", String(s.max_per_day)],
        ["min_gap_minutes", `${s.min_gap_minutes} (${gapLabel})`],
        ["nudge_every", s.nudge_every === 0 ? "0 (off)" : String(s.nudge_every)],
        ["nudge_scope", s.nudge_scope],
        ["share_name", s.share_name ?? c.dim("(unset → git user.name)")],
      ],
    ),
  );
}

/**
 * How long your own lessons are and how many got an answer: `lessons: avg 142 words · feedback
 * answered 40 %` (prose words, code left out — what the 160-word rule counts). Null without one.
 */
export function lessonMeasure(own: readonly Lesson[]): string | null {
  if (!own.length) return null;
  const words = own.reduce((n, l) => n + proseWordCount(l.body?.trim() || l.summary), 0);
  const answered = own.filter((l) => l.feedback !== null).length;
  const avg = Math.round(words / own.length);
  return `lessons: avg ${avg} words · feedback answered ${Math.round((100 * answered) / own.length)} %`;
}

function cmdStats(): void {
  const { stats, rateLimit, settings, compat, own } = db.withConnection((conn) => ({
    stats: coach.getStats(conn),
    rateLimit: coach.checkRateLimit(conn),
    settings: db.getSettings(conn),
    compat: db.compatOf(conn),
    own: db.getLessons(conn, { imported: false }),
  }));
  const num = (k: string): number => Number(stats[k] ?? 0);
  const rlLabel = rateLimit.allowed ? c.green("Available now") : c.yellow(rateLimit.reason ?? "");
  log(
    renderTable(
      "Coaching Stats",
      [{ header: "Metric" }, { header: "Value", justify: "right" }],
      [
        ["Total lessons", String(num("total_lessons"))],
        ["Lessons today (24h)", `${num("lessons_today")} / ${settings.max_per_day}`],
        ["Lessons this week", String(num("lessons_this_week"))],
        ["Next lesson", rlLabel],
      ],
      false,
    ),
  );
  const measure = lessonMeasure(own);
  if (measure) log(c.dim(measure));

  const confidenceNote = (confidence: number): string => c.dim(`(${confidence})`);
  const weakest = (stats.weakest_topics ?? []) as { topic: string; confidence: number }[];
  const strongest = (stats.strongest_topics ?? []) as { topic: string; confidence: number }[];
  if (weakest.length || strongest.length) {
    const rows: string[][] = [];
    for (let i = 0; i < Math.max(weakest.length, strongest.length); i++) {
      const w = weakest[i];
      const s = strongest[i];
      rows.push([
        w ? `${c.red(sanitizeLine(w.topic))} ${confidenceNote(w.confidence)}` : "",
        s ? `${c.green(sanitizeLine(s.topic))} ${confidenceNote(s.confidence)}` : "",
      ]);
    }
    log(
      renderTable(undefined, [{ header: "Weakest topics" }, { header: "Strongest topics" }], rows),
    );
  }

  const hint = skillHint();
  if (hint) log(`\n${hint}`);
  readOnlyNotice(compat);
}

function cmdSet(key: string, value: string): void {
  const validKeys = ["max_per_day", "min_gap_minutes", "nudge_every", "nudge_scope", "share_name"];
  if (!validKeys.includes(key)) {
    fail(`Unknown key '${key}'. Valid keys: ${validKeys.join(", ")}`);
  }
  if (key === "nudge_scope" && value !== "session" && value !== "global") {
    fail(`Invalid nudge_scope '${value}'. Use: session | global`);
  }
  if (key === "share_name") {
    if (value.trim().length > db.SHARE_NAME_MAX) {
      fail(`share_name must be at most ${db.SHARE_NAME_MAX} characters.`);
    }
    const name = db.normalizeShareName(value);
    db.withConnection((conn) => db.setSetting(conn, key, name));
    log(name ? c.green(`Set share_name = ${name}`) : c.green("Cleared share_name"));
    return;
  }
  if (key === "nudge_every") {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0) {
      fail(`Invalid nudge_every '${value}'. Use a non-negative integer (0 = off).`);
    }
  }
  db.withConnection((conn) => db.setSetting(conn, key, value));
  log(c.green(`Set ${key} = ${value}`));
}

function cmdKnowledgeAdd(topic: string, confidence: number, group: string | null): void {
  const t = topic.trim();
  if (!t) {
    fail("Topic name must not be empty.");
  }
  db.withConnection((conn) => {
    db.upsertKnowledge(conn, t, confidence);
    if (group && group !== "Other") db.assignTopicToGroup(conn, t, group);
  });
  const groupLabel = group && group !== "Other" ? ` → ${c.cyan(group)}` : "";
  log(`${c.green("Added")} ${c.bold(t)} (confidence ${c.cyan(String(confidence))})${groupLabel}`);
}

function cmdKnowledgeRemove(topic: string): void {
  const removed = db.withConnection((conn) => db.deleteKnowledge(conn, topic));
  log(
    removed
      ? `${c.green("Removed")} ${c.bold(topic)} from knowledge map`
      : c.yellow(`Topic '${topic}' not found.`),
  );
}

function cmdGroupAdd(name: string): void {
  const groupName = name.trim();
  if (!groupName || groupName === "Other") {
    fail("Invalid group name.");
  }
  db.withConnection((conn) => db.addGroup(conn, groupName));
  log(
    `${c.green(`Group '${c.cyan(groupName)}' ready.`)} Assign topics with: devcoach group-assign <topic> "${groupName}"`,
  );
}

function cmdGroupRemove(name: string): void {
  const count = db.withConnection((conn) => db.deleteGroup(conn, name));
  log(
    count
      ? `${c.green(`Removed group '${c.cyan(name)}'`)}`
      : c.yellow(`Group '${name}' not found.`),
  );
}

function cmdGroupAssign(topic: string, group: string): void {
  const ok = db.withConnection((conn) => {
    const row = conn.prepare("SELECT topic FROM knowledge WHERE topic = ?").get(topic);
    if (row === undefined) return false;
    if (group === "Other") db.unassignTopicFromGroup(conn, topic);
    else db.assignTopicToGroup(conn, topic, group);
    return true;
  });
  if (!ok) {
    fail(`Topic '${topic}' not in knowledge map. Add it first.`);
  }
  log(
    group === "Other"
      ? `${c.green("Moved")} ${c.bold(topic)} → Other (ungrouped)`
      : `${c.green("Moved")} ${c.bold(topic)} → ${c.cyan(group)}`,
  );
}

function cmdBackup(output: string): void {
  const { lessonsCount, knowledgeCount, data } = db.withConnection((conn) => ({
    lessonsCount: db.exportLessons(conn).length,
    knowledgeCount: db.getKnowledgeEntries(conn).length,
    data: db.createBackupZip(conn),
  }));
  writeFileSync(output, data);
  const notebookNote = existsSync(db.LEARNING_STATE_PATH) ? " + notebook" : "";
  log(
    `${c.green("Backup saved:")} ${output}  (${c.cyan(String(lessonsCount))} lessons, ${c.cyan(String(knowledgeCount))} topics${notebookNote})`,
  );
}

function cmdRestore(input: string): void {
  if (!existsSync(input)) {
    fail(`File not found: ${input}`);
  }
  const result = db.withConnection((conn) => db.restoreBackupZip(conn, readFileSync(input)));
  if (result.settings) log(c.green("Settings restored"));
  if (result.topics) {
    log(`${c.green("Knowledge map restored")} (${c.cyan(String(result.topics))} topics)`);
  }
  const parts = [`${c.cyan(String(result.lessons))} imported`];
  if (result.skipped) parts.push(`${c.yellow(String(result.skipped))} duplicates skipped`);
  if (result.invalid) parts.push(`${c.red(String(result.invalid))} rejected (invalid)`);
  log(`${c.green("Lessons:")} ${parts.join(", ")}`);
  if (result.learning_state) log(c.green("Notebook restored"));
}

// ── Lesson sharing ───────────────────────────────────────────────────────────

const note = (s: string): void => {
  // Hints go to stderr so `devcoach share --link | devcoach import -` pipes stay clean.
  console.error(c.dim(s));
};

interface ShareOpts {
  last?: boolean;
  link?: boolean;
  file?: string | boolean;
  withContext?: boolean;
  by?: string;
  anonymous?: boolean;
}

function cmdShare(id: string | undefined, o: ShareOpts): void {
  if (o.by !== undefined && o.anonymous) {
    fail("Use either --by <name> or --anonymous, not both.");
  }
  if (!id && !o.last) {
    fail("Give a lesson id, or --last for the most recent one.", 2);
  }
  const found = db.withConnection((conn) => {
    const lesson = o.last
      ? (db.getLessons(conn, { imported: false, page: 1, per_page: 1 })[0] ?? null)
      : db.getLessonById(conn, id as string);
    if (!lesson) return null;
    const settings = db.getSettings(conn);
    const sharedBy = resolveSharedBy({
      explicit: o.by ?? null,
      anonymous: o.anonymous,
      setting: settings.share_name,
      gitUserName: detectGitUserName(),
    });
    let remembered = false;
    if (o.by?.trim() && !settings.share_name) {
      db.setSetting(conn, "share_name", db.normalizeShareName(o.by));
      remembered = true;
    }
    const payload = buildSharePayload(lesson, { includeContext: Boolean(o.withContext), sharedBy });
    return { payload, remembered };
  });
  if (!found) {
    fail(o.last ? "No lessons to share yet." : `Lesson '${id}' not found.`);
  }
  const { payload, remembered } = found;
  if (o.file !== undefined && o.file !== false) {
    const path = typeof o.file === "string" ? o.file : sharedLessonFilename(payload);
    writeFileSync(path, renderShareMarkdownFile(payload));
    log(`${c.green("Saved:")} ${path}`);
  } else if (o.link) {
    log(renderShareLink(payload));
  } else {
    log(sanitizeForTerminal(renderShareText(payload)));
    if (encodeShareCode(payload).length > 16_000) {
      note("Long lesson — prefer --file for a friendlier hand-off.");
    }
  }
  if (remembered)
    note("(remembered as share_name — change it with: devcoach set share_name <name>)");
  if (payload.shared_by === null) {
    note("Shared anonymously (set a name with: devcoach set share_name <name>)");
  }
}

function readClipboard(): string {
  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [["pbpaste", []]]
      : process.platform === "win32"
        ? [["powershell", ["-NoProfile", "-Command", "Get-Clipboard"]]]
        : [
            ["wl-paste", ["--no-newline"]],
            ["xclip", ["-selection", "clipboard", "-o"]],
            ["xsel", ["--clipboard", "--output"]],
          ];
  for (const [cmd, args] of candidates) {
    try {
      const out = execFileSync(cmd, args, {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (out.trim()) return out;
    } catch {
      // tool missing or empty clipboard — try the next one
    }
  }
  throw new ShareInputError(
    "Clipboard is empty or unavailable — pass the code, a link or a file, or pipe it: devcoach import -",
  );
}

/** Whatever the user gave us: nothing (clipboard), "-" (stdin), a file, a URL, or the text itself. */
async function readImportSource(source: string | undefined): Promise<string> {
  if (source === undefined) return readClipboard();
  if (source === "-") return readStream(process.stdin);
  if (existsSync(source)) return readFileSync(source, "utf8");
  // A share link carries the lesson in its fragment — decoded locally, never fetched.
  if (isHttpUrl(source) && !source.includes("#devcoach:lesson:")) return fetchSharedInput(source);
  return source;
}

async function cmdImport(source: string | undefined): Promise<void> {
  try {
    const raw = await readImportSource(source);
    const result = db.withConnection((conn) => coach.importSharedInput(conn, raw));
    if (result.kind === "lessons") {
      const parts = [`${c.cyan(String(result.inserted))} imported`];
      if (result.duplicated)
        parts.push(`${c.yellow(String(result.duplicated))} duplicates skipped`);
      if (result.invalid) parts.push(`${c.red(String(result.invalid))} rejected (invalid)`);
      log(`${c.green("Lessons:")} ${parts.join(", ")}`);
      return;
    }
    if (!result.lesson) {
      fail("Could not store the lesson.");
    }
    const lesson = printable(result.lesson);
    const who = senderPhrase(lesson.shared_by);
    if (result.duplicated) {
      log(`${c.yellow("Already in your log")} as ${c.cyan(lesson.id)} (${who})`);
    } else {
      log(
        `${c.green("Imported")} ${c.bold(`"${lesson.title}"`)} (${who}) as ${c.cyan(lesson.id)} — topic ${c.cyan(lesson.topic_id)}`,
      );
    }
    if (result.topic_tracked === false) {
      note(
        `Topic '${lesson.topic_id}' is not in your knowledge map — track it with: devcoach knowledge-add ${lesson.topic_id}`,
      );
    }
  } catch (err) {
    if (!(err instanceof ShareInputError)) throw err;
    fail(err.message);
  }
}

// ── Setup wizard (interactive) ───────────────────────────────────────────────

async function cmdSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (msg: string, def = ""): Promise<string> => {
    const suffix = def ? ` [${def}]` : "";
    const val = (await rl.question(`${msg}${suffix}: `)).trim();
    return val || def;
  };
  const askInt = async (msg: string, def: number, lo: number, hi: number): Promise<number> => {
    for (;;) {
      const raw = await ask(msg, String(def));
      const v = Number.parseInt(raw, 10);
      if (!Number.isNaN(v) && v >= lo && v <= hi) return v;
      log(c.red(`Must be ${lo}–${hi}.`));
    }
  };

  try {
    log(rule(c.bold("devcoach setup")));

    log(`\n${c.bold("Step 1")} — Restore from backup`);
    const backupPath = await ask("Path to existing backup zip (Enter to skip)", "");
    if (backupPath) {
      if (!existsSync(backupPath)) {
        fail(`File not found: ${backupPath}`);
      }
      const result = db.withConnection((conn) =>
        db.restoreBackupZip(conn, readFileSync(backupPath)),
      );
      log(
        `${c.green("Restored:")} ${result.topics} topics, ${result.lessons} lessons${result.learning_state ? ", notebook" : ""}`,
      );
      log(c.green("Setup complete!"));
      return;
    }

    log(`\n${c.bold("Step 2")} — Build your knowledge profile`);
    const mode = (
      await ask("Mode: [a]utomatic (detect from files) / [m]anual (type your stack)", "a")
    ).toLowerCase();
    const topics: Record<string, number> = {};

    if (mode.startsWith("a")) {
      const git = detectGitContext();
      const cwd = git.folder ?? process.cwd();
      const scan = scanClaudeHistory();
      const detected = mergeStacks(detectStack(cwd), scan.detected_stack);
      const keys = Object.keys(detected).sort((a, b) => a.localeCompare(b));
      if (scan.scanned_projects > 0) {
        log(
          `\n${c.dim(`Scanned ${scan.scanned_projects} Claude Code project(s) from your history:`)}`,
        );
        for (const p of scan.projects.slice(0, 8)) {
          log(c.dim(`  ${p.name} — ${p.topics.join(", ") || "no stack signals"}`));
        }
      }
      if (keys.length) {
        log(`\n${c.dim(`Detected (history + ${c.cyan(cwd)}):`)}`);
        for (const topic of keys) {
          const defaultConf = detected[topic] ?? 5;
          const raw = await ask(
            `  ${c.cyan(topic)} (Enter=keep, 0-10=override, s=skip)`,
            String(defaultConf),
          );
          if (raw.toLowerCase() === "s") continue;
          const v = Number.parseInt(raw, 10);
          topics[topic] = Number.isNaN(v) ? defaultConf : Math.max(0, Math.min(10, v));
        }
      } else {
        log(c.dim("No technology files detected in current directory."));
      }
      const extra = await ask("\nAdd additional topics (comma-separated, or Enter to skip)", "");
      for (const t of extra
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)) {
        topics[t] = await askInt(`  Confidence for ${c.cyan(t)}`, 5, 0, 10);
      }
    } else {
      log(c.dim("\nEnter topics: 'topic_id confidence' (e.g. python 7). Blank line when done."));
      for (;;) {
        const entry = (await ask("Topic (Enter when done)", "")).trim();
        if (!entry) break;
        const parts = entry.split(/\s+/);
        const t = parts[0] ?? "";
        const v = Number.parseInt(parts[1] ?? "", 10);
        const conf = Number.isNaN(v) ? 5 : Math.max(0, Math.min(10, v));
        topics[t] = conf;
        log(`  ${c.green("+")} ${c.cyan(t)} → ${conf}`);
      }
    }

    const groups: Record<string, string[]> = {};
    if (Object.keys(topics).length) {
      log(`\n${c.bold("Step 3")} — Organise into groups`);
      const doGroups = (await ask("Organise topics into groups? [y/N]", "n")).toLowerCase();
      if (doGroups.startsWith("y")) {
        const existingGroups: string[] = [];
        for (const t of Object.keys(topics).sort((a, b) => a.localeCompare(b))) {
          const suggestion = existingGroups.length ? existingGroups.join(", ") : "(none yet)";
          const g = await ask(
            `  Group for ${c.cyan(t)}  existing: ${c.dim(suggestion)}  (Enter=Other)`,
            "",
          );
          if (g && g !== "Other") {
            const list = groups[g] ?? [];
            list.push(t);
            groups[g] = list;
            if (!existingGroups.includes(g)) existingGroups.push(g);
          }
        }
      }
    }

    log(`\n${c.bold("Step 4")} — Rate-limit settings`);
    const maxPerDay = await askInt("Max lessons per day", 2, 1, 20);
    const minGap = await askInt("Min gap between lessons (minutes)", 240, 0, 1440);

    const profile = db.withConnection((conn) => {
      conn.exec(
        "DELETE FROM knowledge; DELETE FROM knowledge_groups; DELETE FROM knowledge_group_names;",
      );
      for (const [t, conf] of Object.entries(topics)) db.upsertKnowledge(conn, t, conf);
      for (const [g, ts] of Object.entries(groups))
        for (const t of ts) db.assignTopicToGroup(conn, t, g);
      db.setSetting(conn, "max_per_day", String(maxPerDay));
      db.setSetting(conn, "min_gap_minutes", String(minGap));
      return coach.getProfile(conn);
    });

    log(renderProfileTable(profile, "Knowledge Profile"));
    log(`\n${c.green("Setup complete!")} ${Object.keys(topics).length} topics saved.`);
  } finally {
    rl.close();
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────
// The hook implementations live in ./hooks (a lean chunk loaded by src/bin.ts without
// the full CLI bundle); imported here for Commander registration, re-exported for the
// tests and for API stability.
import { cmdLessonReady, cmdOnboardHook, cmdPromptHook, cmdStopHook } from "./hooks";

export { buildLessonCue, type HookPayload, parseHookPayload } from "./hooks";
export { cmdLessonReady, cmdOnboardHook, cmdPromptHook, cmdStopHook };

// ── Welcome ──────────────────────────────────────────────────────────────────

function printWelcome(): void {
  const commands: [string, string][] = [
    ["mcp", "Start the MCP server (stdio) for Claude Code / Claude Desktop"],
    ["ui [--port N] [--open|--stop]", `Launch the web dashboard  (default port: ${uiPort()})`],
    ["setup", "First-run wizard: import backup or build your knowledge profile"],
    ["install", "Register MCP server + hooks + skill (Claude default; --gemini/--codex beta)"],
    [
      "uninstall",
      "Remove the MCP server, hooks and skill (--all: every agent; --data: wipe ~/.devcoach)",
    ],
    ["onboard-hook", "Claude Code Stop hook: cue onboarding when no profile exists"],
    ["lesson-ready", "Claude Code Stop hook: cue a lesson when one is due"],
    ["doctor", "Diagnose the agent wiring — explains why a lesson would(n't) fire"],
    ["profile", "Show the knowledge map"],
    ["stats", "Coaching statistics and rate-limit status"],
    ["settings / set", "Show / update settings (max_per_day | min_gap_minutes)"],
    ["lessons / lesson", "Your lessons by day / read one (--short: its summary)"],
    ["courses / course", "List your courses / show one with its steps"],
    ["star / unstar / delete", "Manage a lesson"],
    ["feedback <id> <answer>", "Answer “Already knew it?”: yes / new / lost (or clear)"],
    ["share / import", "Hand a lesson to a teammate / add a shared lesson to your log"],
    ["knowledge-add / -remove", "Add / remove a topic"],
    ["group-add / -remove / -assign", "Manage knowledge groups"],
    ["backup / restore", "Export / import a full backup zip"],
  ];
  log(`\n${c.bold(`devcoach ${c.dim(`v${VERSION}`)}`)}`);
  for (const [cmd, desc] of commands)
    log(`  ${c.cyan(`devcoach ${cmd}`.padEnd(32))} ${c.dim(desc)}`);
  log(
    `\n${c.dim("Run")} ${c.bold("devcoach <command> --help")} ${c.dim("for per-command options.")}\n`,
  );
  const hint = skillHint();
  if (hint) log(`${hint}\n`);
}

// ── Dispatch (Commander) ─────────────────────────────────────────────────────

function str(v: string | undefined): string | null {
  return v ?? null;
}

/** A positive integer option (`-n`, `--width`); anything else is a usage error (exit 2). */
function positiveInt(min: number, max: number) {
  return (raw: string): number => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new InvalidArgumentError(`Expected a whole number from ${min} to ${max}.`);
    }
    return n;
  };
}

interface LessonsCliOpts {
  period?: string;
  category?: string;
  project?: string;
  repository?: string;
  branch?: string;
  commit?: string;
  starred?: boolean;
  imported?: boolean;
  from?: string;
  feedback?: string;
  level?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: string;
  search?: string;
  limit?: number;
  json?: boolean;
}

function buildProgram(): Command {
  const program = new Command();
  // exitOverride before adding subcommands so they inherit it — every parse/help/version
  // path then throws to runCli's catch instead of calling process.exit directly.
  program.exitOverride();
  program
    .name("devcoach")
    .description("devcoach — progressive technical coaching")
    .version(`devcoach ${VERSION}`, "-v, --version", "output the version number")
    .allowExcessArguments(false)
    .showHelpAfterError("(add --help for usage)")
    // Default action when no subcommand is given: branded welcome screen.
    .action(() => printWelcome());

  // The MCP server (SDK + zod schemas) and the web UI (Hono + views) are the two heavy
  // corners of the bundle — loaded on demand so plain CLI commands never parse them.
  program
    .command("mcp")
    .description("Start the MCP server (stdio transport)")
    .action(async () => {
      const { runStdio } = await import("../mcp/server");
      await runStdio();
    });

  program.command("profile").description("Show the knowledge map").action(cmdProfile);

  program
    .command("lessons")
    .description(
      "Your lessons, newest first: grouped by day on a terminal, one tab-separated row per " +
        "lesson (date, id, answer, title) on a pipe",
    )
    .option("--period <period>", "today | week | month | year | all", "all")
    .option("--category <category>", "Filter by category tag")
    .option("--project <project>", "Filter by project (fuzzy)")
    .option("--repository <repository>", "Filter by repository (fuzzy)")
    .option("--branch <branch>", "Filter by branch (fuzzy)")
    .option("--commit <commit>", "Filter by commit hash prefix (fuzzy)")
    .option("--starred", "Show only starred lessons")
    .option("--imported", "Show only lessons shared with you")
    .option("--from <name>", "Show only lessons shared by this person")
    .option("--feedback <answer>", answerWords(NO_ANSWER.filter))
    .option("--level <level>", "junior | mid | senior")
    .option("--date-from <date>", "Show lessons on or after this date (YYYY-MM-DD[THH:MM])")
    .option("--date-to <date>", "Show lessons on or before this date (YYYY-MM-DD[THH:MM])")
    .option("--search <text>", "Only lessons containing every word (title, topic, text, sender)")
    .option("--sort <column>", "timestamp | level | topic_id | title | feedback", "timestamp")
    .option("--order <order>", "asc | desc", "desc")
    .option(
      "-n, --limit <n>",
      `How many to show (default on a terminal: ${DEFAULT_LIST_LIMIT}; a pipe gets all)`,
      positiveInt(1, 1_000_000),
    )
    .option("--json", "Print the lessons as JSON")
    .action((opts: LessonsCliOpts) =>
      cmdLessons({
        period: opts.period ?? "all",
        category: str(opts.category),
        project: str(opts.project),
        repository: str(opts.repository),
        branch: str(opts.branch),
        commit: str(opts.commit),
        starred: Boolean(opts.starred),
        imported: Boolean(opts.imported),
        sharedBy: str(opts.from),
        feedback: str(opts.feedback),
        level: str(opts.level),
        dateFrom: str(opts.dateFrom),
        dateTo: str(opts.dateTo),
        search: str(opts.search),
        sort: opts.sort ?? "timestamp",
        order: opts.order ?? "desc",
        limit: opts.limit ?? null,
        json: Boolean(opts.json),
      }),
    );

  program
    .command("lesson")
    .description("Read a lesson: its text, then its id, dashboard link and the answer command")
    .argument("[id]", "Lesson ID, or the start of one (or use --last)")
    .option("--last", "The most recent of your own lessons")
    .addOption(
      new Option("--short", "The summary view: metadata and summary").conflicts(["md", "json"]),
    )
    .addOption(new Option("--md", "The chat card as markdown (to paste)").conflicts("json"))
    .option("--json", "The lesson as JSON")
    .option(
      "--width <n>",
      "Columns to lay out for (default: the terminal's, up to 100)",
      positiveInt(20, 1000),
    )
    .option("--no-pager", "Never page, even when the lesson is taller than the terminal")
    .action((id: string | undefined, opts: LessonOpts) => cmdLesson(id, opts));

  program
    .command("courses")
    .description("List your step-by-step courses")
    .action(() => cmdCourses());

  program
    .command("course")
    .description("Show a course: steps, progress, document path")
    .argument("<id>", "Course ID")
    .action((id: string) => cmdCourse(id));

  program
    .command("star")
    .description("Mark a lesson as starred")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdStar(id, true));

  program
    .command("unstar")
    .description("Remove the starred mark from a lesson")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdStar(id, false));

  program
    .command("delete")
    .description("Permanently delete a lesson")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdDelete(id));

  program
    .command("feedback")
    .description("Answer “Already knew it?” under a lesson: yes / new to me / lost me")
    .argument("<id>", "Lesson ID")
    .argument("<answer>", answerWords(NO_ANSWER.cli))
    .action((id: string, value: string) => cmdFeedback(id, value));

  program
    .command("share")
    .description("Share a lesson: copyable text (default), --link, or a .devcoach.md file")
    .argument("[id]", "Lesson ID (or use --last)")
    .option("--last", "Share the most recent lesson")
    .option("--link", "Print the share link only")
    .option("--file [path]", "Write a .devcoach.md file (default: <lesson-id>.devcoach.md)")
    .option("--with-context", "Include project/branch/commit/task context (off by default)")
    .option("--by <name>", "Sender name (remembered as share_name when unset)")
    .option("--anonymous", "Share without a sender name")
    .action((id: string | undefined, opts: ShareOpts) => cmdShare(id, opts));

  program
    .command("import")
    .description(
      "Import a shared lesson: a devcoach:lesson code, a share link, a URL, a .devcoach.md or " +
        "lessons .json file, - for stdin — or the clipboard when omitted",
    )
    .argument("[source]", "Code, link, URL, file path, or - (stdin); omit to read the clipboard")
    .action((source: string | undefined) => cmdImport(source));

  program.command("settings").description("Show current settings").action(cmdSettings);

  program
    .command("stats")
    .description("Coaching statistics and rate-limit status")
    .action(cmdStats);

  program
    .command("set")
    .description(
      "Update a setting (max_per_day | min_gap_minutes | nudge_every | nudge_scope | share_name)",
    )
    .argument("<key>", "Setting key")
    .argument("<value>", "New value")
    .action((key: string, value: string) => cmdSet(key, value));

  program
    .command("knowledge-add")
    .description("Add or update a topic in the knowledge map")
    .argument("<topic>", "Topic ID")
    .option("--confidence <n>", "Initial confidence 0-10", "5")
    .option("--group <group>", "Assign to a named group")
    .action((topic: string, opts: { confidence?: string; group?: string }) =>
      cmdKnowledgeAdd(
        topic,
        Math.max(0, Math.min(10, Number.parseInt(opts.confidence ?? "5", 10) || 5)),
        str(opts.group),
      ),
    );

  program
    .command("knowledge-remove")
    .description("Remove a topic from the knowledge map")
    .argument("<topic>", "Topic ID")
    .action((topic: string) => cmdKnowledgeRemove(topic));

  program
    .command("group-add")
    .description("Register a new knowledge group")
    .argument("<name>", "Group name")
    .action((name: string) => cmdGroupAdd(name));

  program
    .command("group-remove")
    .description("Delete a knowledge group (topics move to Other)")
    .argument("<name>", "Group name")
    .action((name: string) => cmdGroupRemove(name));

  program
    .command("group-assign")
    .description("Move a topic to a group")
    .argument("<topic>", "Topic ID")
    .argument("<group>", "Group name (use 'Other' to ungroup)")
    .action((topic: string, group: string) => cmdGroupAssign(topic, group));

  program
    .command("backup")
    .description("Export a full backup (settings + knowledge + lessons) as zip")
    .argument("[file]", "Output zip path", "devcoach-backup.zip")
    .action((file: string) => cmdBackup(file));

  program
    .command("restore")
    .description("Restore from a backup zip file")
    .argument("<file>", "Path to backup zip")
    .action((file: string) => cmdRestore(file));

  program
    .command("install")
    .description(
      "Register the MCP server + hooks + skill in Claude Code / Claude Desktop " +
        "(default), Gemini CLI (--gemini, beta), or Codex CLI (--codex, beta)",
    )
    .option("--claude-code", "Target Claude Code only")
    .option("--claude-desktop", "Target Claude Desktop only")
    .option("--gemini", "Target Google Gemini CLI (beta)")
    .option("--codex", "Target OpenAI Codex CLI (beta)")
    .option("--force", "Overwrite existing devcoach entry")
    .option("--skip-hook", "Register MCP server only — skip the hooks")
    .action(
      (opts: {
        claudeCode?: boolean;
        claudeDesktop?: boolean;
        gemini?: boolean;
        codex?: boolean;
        force?: boolean;
        skipHook?: boolean;
      }) =>
        cmdInstall({
          claudeCode: Boolean(opts.claudeCode),
          claudeDesktop: Boolean(opts.claudeDesktop),
          gemini: Boolean(opts.gemini),
          codex: Boolean(opts.codex),
          force: Boolean(opts.force),
          skipHook: Boolean(opts.skipHook),
        }),
    );

  program
    .command("uninstall")
    .description(
      "Remove devcoach's MCP server, hooks and skill from Claude Code / Claude Desktop " +
        "(default), Gemini CLI (--gemini), Codex CLI (--codex) or every agent (--all). " +
        "Coaching data is kept unless --data is given. Run it before brew/npm uninstall.",
    )
    .option("--claude-code", "Target Claude Code only")
    .option("--claude-desktop", "Target Claude Desktop only")
    .option("--gemini", "Also remove from Google Gemini CLI (beta)")
    .option("--codex", "Also remove from OpenAI Codex CLI (beta)")
    .option("--all", "Every agent: Claude Code, Claude Desktop, Gemini CLI, Codex CLI")
    .option("--data", "Also delete ~/.devcoach (lessons, profile, notebook) — asks first")
    .option("--yes", "Do not ask before deleting the data (with --data)")
    .action(
      async (opts: {
        claudeCode?: boolean;
        claudeDesktop?: boolean;
        gemini?: boolean;
        codex?: boolean;
        all?: boolean;
        data?: boolean;
        yes?: boolean;
      }) =>
        cmdUninstall({
          claudeCode: Boolean(opts.claudeCode),
          claudeDesktop: Boolean(opts.claudeDesktop),
          gemini: Boolean(opts.gemini),
          codex: Boolean(opts.codex),
          all: Boolean(opts.all),
          data: Boolean(opts.data),
          yes: Boolean(opts.yes),
        }),
    );

  program
    .command("doctor")
    .description("Diagnose the devcoach ⇄ agent wiring and the lesson pacing state")
    .action(cmdDoctor);

  program
    .command("ui")
    .description(
      "Launch the web dashboard (Ctrl+C stops it gracefully; --stop stops a running one)",
    )
    .option("--port <port>", "Port", String(uiPort()))
    .option("-o, --open", "Open the dashboard in your default browser")
    .option("--stop", "Stop the dashboard running on --port (e.g. one started by your agent)")
    .action(async (opts: { port?: string; open?: boolean; stop?: boolean }) => {
      const port = Number.parseInt(opts.port ?? "", 10) || uiPort();
      const { startUi, stopUi } = await import("../web/app");
      if (opts.stop) {
        log(
          (await stopUi(port))
            ? c.green(`devcoach UI on port ${port} stopped`)
            : c.yellow(`No devcoach UI is running on port ${port}`),
        );
        return;
      }
      startUi(port, {
        onReady: (url) => {
          if (opts.open) openInBrowser(url);
        },
        onListenError: (failure) => {
          console.error(failure.message);
          // The port belongs to a running dashboard: --open still means "show me the dashboard".
          if (opts.open && failure.existingUrl) openInBrowser(failure.existingUrl);
          process.exit(failure.exitCode);
        },
      });
    });

  program
    .command("setup")
    .description("First-run wizard: import backup or build your knowledge profile")
    .action(cmdSetup);

  // Hooks — hidden from help; exit 0 always (silent, or a JSON directive on stdout).
  // Wrapped in arrows: Commander passes (options, command) to actions, which would
  // otherwise clobber the HookPayload default parameter.
  program
    .command("stop-hook", { hidden: true })
    .description("Claude Code Stop hook: onboarding check + lesson cue in one spawn")
    .action(() => cmdStopHook());
  program
    .command("prompt-hook", { hidden: true })
    .description("Claude Code UserPromptSubmit hook: prime the model when a lesson is due")
    .action(() => cmdPromptHook());
  program
    .command("gemini-stop-hook", { hidden: true })
    .description("Gemini CLI AfterAgent hook: onboarding check + lesson cue in one spawn")
    .action(() => cmdStopHook(undefined, "gemini"));
  program
    .command("gemini-prompt-hook", { hidden: true })
    .description("Gemini CLI BeforeAgent hook: prime the model when a lesson is due")
    .action(() => cmdPromptHook(undefined, "gemini"));
  program
    .command("codex-stop-hook", { hidden: true })
    .description("Codex CLI Stop hook: onboarding check + lesson cue in one spawn")
    .action(() => cmdStopHook(undefined, "codex"));
  program
    .command("codex-prompt-hook", { hidden: true })
    .description("Codex CLI UserPromptSubmit hook: prime the model when a lesson is due")
    .action(() => cmdPromptHook(undefined, "codex"));
  program
    .command("onboard-hook", { hidden: true })
    .description("Claude Code Stop hook: cue onboarding (legacy two-entry layout)")
    .action(() => cmdOnboardHook());
  program
    .command("lesson-ready", { hidden: true })
    .description("Claude Code Stop hook: signal a lesson is due (legacy two-entry layout)")
    .action(() => cmdLessonReady());

  return program;
}

export async function runCli(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    // Only Commander's own errors are handled here. Anything else (a real handler error, or a
    // handler that already called process.exit) propagates untouched.
    if (!code.startsWith("commander.")) throw err;
    // Help/version are not errors — Commander already wrote the output; exit cleanly.
    if (
      code === "commander.helpDisplayed" ||
      code === "commander.help" ||
      code === "commander.version"
    ) {
      return;
    }
    // Parse/usage errors: Commander already printed a friendly message; exit 2.
    process.exit(2);
  }
}
