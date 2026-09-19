// Lesson sharing: one portable payload, three encodings.
//   • code  — `devcoach:lesson:1:<base64url(raw deflate(JSON))>`: one line that pastes anywhere
//   • file  — `<slug>.devcoach.md`: YAML-ish frontmatter + the lesson body (renders on GitHub)
//   • link  — `<docs site>/lesson#<code>`: the static docs page decodes the fragment in the browser
// The receiving side (`parseSharedInput`) accepts any of them — a bare code, the whole copied card,
// the link, the file text, or a legacy lessons JSON array — so the user never has to know which
// one they were handed. Pure module: no I/O, no DB.
import { deflateSync, Inflate, strFromU8, strToU8 } from "fflate";
import { z } from "zod";
import { VERSION } from "../version";
import {
  formatIsoZ,
  type Lesson,
  LevelSchema,
  parseLesson,
  RepositoryPlatformSchema,
} from "./models";
import { formatLessonForDisplay } from "./prompts";

export const SHARE_FORMAT = "devcoach.lesson";
export const SHARE_VERSION = 1;
export const SHARE_CODE_PREFIX = `devcoach:lesson:${SHARE_VERSION}:`;
/** The docs-site page that renders a shared lesson from the URL fragment (`url + baseUrl + "lesson"`). */
export const SHARE_PAGE_URL = "https://ultimaphoenix.github.io/dev-coach/lesson";
export const SHARE_FILE_SUFFIX = ".devcoach.md";
/** Upper bound for a decoded payload — a lesson is a few KB; anything bigger is not one. */
const MAX_DECODED_BYTES = 256 * 1024;

/** A friendly, user-facing reason why some text is not an importable lesson. */
export class ShareInputError extends Error {}

const nullishStr = z.string().nullish();

/** Context keys that may travel with a lesson when the sender opts in. `folder` never does. */
const CONTEXT_KEYS = ["task_context", "project", "branch", "commit_hash"] as const;
const REMOTE_PLATFORMS = new Set(["github", "gitlab", "bitbucket"]);

export const SharedLessonSchema = z.object({
  format: z.literal(SHARE_FORMAT),
  version: z.literal(SHARE_VERSION),
  lesson: z.object({
    title: z.string().min(1),
    summary: z.string(),
    body: z.string().nullable(),
    topic_id: z.string().min(1),
    categories: z.array(z.string()),
    level: LevelSchema,
    task_context: nullishStr,
    project: nullishStr,
    repository: nullishStr,
    branch: nullishStr,
    commit_hash: nullishStr,
    repository_platform: RepositoryPlatformSchema.nullish(),
  }),
  origin: z.object({ id: z.string().min(1), timestamp: z.string() }),
  shared_by: z.string().nullable(),
  shared_at: z.string(),
  app_version: z.string(),
});
export type SharedLesson = z.infer<typeof SharedLessonSchema>;

// ── Building ────────────────────────────────────────────────────────────────

export interface BuildShareOptions {
  /** Include project/branch/commit/task context (and the repository when it is a remote). */
  includeContext: boolean;
  sharedBy: string | null;
  now?: Date;
}

/** Turn a stored lesson into the portable payload. Local paths never leave the machine. */
export function buildSharePayload(lesson: Lesson, opts: BuildShareOptions): SharedLesson {
  const lessonPart: SharedLesson["lesson"] = {
    title: lesson.title,
    summary: lesson.summary,
    body: lesson.body,
    topic_id: lesson.topic_id,
    categories: lesson.categories,
    level: lesson.level,
  };
  if (opts.includeContext) {
    for (const key of CONTEXT_KEYS) {
      if (lesson[key] != null) lessonPart[key] = lesson[key];
    }
    // A repository is shared only when it names a remote host — a `local` platform means the
    // "repository" is a path on the sender's disk.
    if (lesson.repository_platform && REMOTE_PLATFORMS.has(lesson.repository_platform)) {
      if (lesson.repository != null) lessonPart.repository = lesson.repository;
      lessonPart.repository_platform = lesson.repository_platform;
    }
  }
  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    lesson: lessonPart,
    origin: { id: lesson.id, timestamp: lesson.timestamp },
    shared_by: opts.sharedBy,
    shared_at: formatIsoZ(opts.now ?? new Date()),
    app_version: VERSION,
  };
}

export interface ResolveSharedByInput {
  /** An explicit name from the caller (`--by`, tool argument). */
  explicit?: string | null;
  anonymous?: boolean;
  /** The `share_name` setting. */
  setting: string | null;
  /** `git config user.name`. */
  gitUserName: string | null;
}

/** Precedence: explicit → anonymous (or an explicit empty name) → setting → git → anonymous. */
export function resolveSharedBy(i: ResolveSharedByInput): string | null {
  if (i.anonymous) return null;
  if (i.explicit != null) return i.explicit.trim() || null;
  return i.setting?.trim() || i.gitUserName?.trim() || null;
}

// ── Code (compact, single line) ──────────────────────────────────────────────

export function encodeShareCode(payload: SharedLesson): string {
  const bytes = deflateSync(strToU8(JSON.stringify(payload)), { level: 9 });
  return SHARE_CODE_PREFIX + Buffer.from(bytes).toString("base64url");
}

const CODE_RE = /devcoach:lesson:(\d+):([A-Za-z0-9_-]+)/;

/** A real lesson code is ~1–3 K chars; this bounds the compressed input before anything is inflated. */
export const MAX_CODE_CHARS = 64_000;
const INFLATE_SLICE = 512;

class TooLargeError extends Error {}

/**
 * Inflate with a byte budget: the input is fed in small slices to fflate's streaming Inflate and
 * the running output is checked after each one, so a "zip bomb" code is rejected after at most
 * ~0.5 MB of output (a slice inflates to ≤ ~1032× its size) instead of being fully expanded first.
 */
function inflateBounded(data: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate((chunk) => {
    total += chunk.length;
    if (total > limit) throw new TooLargeError("too large");
    chunks.push(chunk);
  });
  for (let i = 0; i < data.length; i += INFLATE_SLICE) {
    inflater.push(data.subarray(i, i + INFLATE_SLICE), i + INFLATE_SLICE >= data.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function decodeShareCode(code: string): SharedLesson {
  const m = new RegExp(`^${CODE_RE.source}$`).exec(code.trim());
  if (!m) throw new ShareInputError("That is not a devcoach lesson code.");
  if (Number(m[1]) !== SHARE_VERSION) {
    throw new ShareInputError(
      `This lesson was shared by a newer devcoach (format ${m[1]}) — upgrade to import it.`,
    );
  }
  const encoded = m[2] ?? "";
  if (encoded.length > MAX_CODE_CHARS) {
    throw new ShareInputError("This lesson code is too large to be a lesson.");
  }
  let json: string;
  try {
    const bytes = inflateBounded(
      new Uint8Array(Buffer.from(encoded, "base64url")),
      MAX_DECODED_BYTES,
    );
    json = strFromU8(bytes);
  } catch (err) {
    if (err instanceof TooLargeError) {
      throw new ShareInputError("This lesson code is too large to be a lesson.");
    }
    throw new ShareInputError("This lesson code is damaged or incomplete — copy it again.");
  }
  return parsePayloadJson(json);
}

function parsePayloadJson(json: string): SharedLesson {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ShareInputError("This lesson code is damaged or incomplete — copy it again.");
  }
  const parsed = SharedLessonSchema.safeParse(raw);
  if (!parsed.success) throw new ShareInputError("This is not a valid devcoach lesson.");
  return parsed.data;
}

// ── Renderers ────────────────────────────────────────────────────────────────

/** The card as the user knows it, a one-line hint, and the code as the very last line. */
export function renderShareText(payload: SharedLesson, code = encodeShareCode(payload)): string {
  const who = payload.shared_by
    ? `Shared by ${payload.shared_by} with devcoach`
    : "Shared with devcoach";
  return [
    formatLessonForDisplay(payload.lesson),
    "",
    `${who} — paste it to your agent or run: devcoach import`,
    code,
  ].join("\n");
}

export function renderShareLink(payload: SharedLesson, code = encodeShareCode(payload)): string {
  return `${SHARE_PAGE_URL}#${code}`;
}

export function slugify(s: string, fallback = "lesson"): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

export function sharedLessonFilename(payload: SharedLesson): string {
  return `${slugify(payload.origin.id)}${SHARE_FILE_SUFFIX}`;
}

const PLAIN_SCALAR = /^[A-Za-z0-9_.+:@/-]+$/;
const yamlScalar = (v: string): string => (PLAIN_SCALAR.test(v) ? v : JSON.stringify(v));
const yamlList = (items: string[]): string => `[${items.map(yamlScalar).join(", ")}]`;

/** `.devcoach.md`: a strict frontmatter subset any YAML parser reads, then the lesson body. */
export function renderShareMarkdownFile(payload: SharedLesson): string {
  const l = payload.lesson;
  const lines = [
    "---",
    `format: ${SHARE_FORMAT}`,
    `version: ${SHARE_VERSION}`,
    `title: ${JSON.stringify(l.title)}`,
    `topic_id: ${yamlScalar(l.topic_id)}`,
    `level: ${l.level}`,
    `categories: ${yamlList(l.categories)}`,
    `summary: ${JSON.stringify(l.summary)}`,
    `origin_id: ${yamlScalar(payload.origin.id)}`,
    `origin_timestamp: ${payload.origin.timestamp}`,
    `shared_by: ${payload.shared_by == null ? "null" : JSON.stringify(payload.shared_by)}`,
    `shared_at: ${payload.shared_at}`,
    `app_version: ${yamlScalar(payload.app_version)}`,
  ];
  for (const key of [
    "task_context",
    "project",
    "repository",
    "branch",
    "commit_hash",
    "repository_platform",
  ] as const) {
    const v = l[key];
    if (v != null) lines.push(`${key}: ${JSON.stringify(v)}`);
  }
  lines.push("---", "", l.body ?? l.summary, "");
  return lines.join("\n");
}

/** Split a YAML flow list body on the commas that are outside JSON-quoted strings. */
function splitFlowList(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] ?? "";
    if (quoted) {
      current += ch;
      if (ch === "\\") current += inner[++i] ?? "";
      else if (ch === '"') quoted = false;
    } else if (ch === '"') {
      quoted = true;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items;
}

function parseYamlValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "null" || v === "") return null;
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitFlowList(inner).map((item) => parseYamlValue(item));
  }
  return v;
}

export function parseShareMarkdownFile(text: string): SharedLesson {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") throw new ShareInputError("Missing frontmatter (--- … ---).");
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) throw new ShareInputError("Frontmatter never closes (missing ---).");
  const meta: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) throw new ShareInputError(`Cannot read frontmatter line: ${line.trim()}`);
    try {
      meta[line.slice(0, sep).trim()] = parseYamlValue(line.slice(sep + 1));
    } catch {
      throw new ShareInputError(`Cannot read frontmatter line: ${line.trim()}`);
    }
  }
  const body = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  const raw = {
    format: meta.format,
    version: typeof meta.version === "string" ? Number(meta.version) : meta.version,
    lesson: {
      title: meta.title,
      summary: meta.summary,
      body: body || null,
      topic_id: meta.topic_id,
      categories: meta.categories,
      level: meta.level,
      task_context: meta.task_context ?? undefined,
      project: meta.project ?? undefined,
      repository: meta.repository ?? undefined,
      branch: meta.branch ?? undefined,
      commit_hash: meta.commit_hash ?? undefined,
      repository_platform: meta.repository_platform ?? undefined,
    },
    origin: { id: meta.origin_id, timestamp: meta.origin_timestamp },
    shared_by: meta.shared_by ?? null,
    shared_at: meta.shared_at,
    app_version: meta.app_version,
  };
  const parsed = SharedLessonSchema.safeParse(raw);
  if (!parsed.success) throw new ShareInputError("This file is not a valid devcoach lesson.");
  return parsed.data;
}

// ── Universal input parser ───────────────────────────────────────────────────

export type SharedInput =
  | { kind: "shared"; source: "code" | "markdown" | "json"; payload: SharedLesson }
  | { kind: "lessons"; records: unknown[] };

/**
 * Recognise whatever the user handed over: a JSON lessons array (legacy export), a payload JSON
 * object, a single lesson object, a `.devcoach.md` file, or a code — bare, inside the whole copied
 * card, or in a share link's fragment. Line-wrapped codes (email clients) are re-joined.
 */
export function parseSharedInput(text: string): SharedInput {
  const t = text.trim();
  if (!t) throw new ShareInputError("Nothing to import — paste a lesson code, link or file.");
  if (t.startsWith("[")) {
    const records = tryJson(t);
    if (Array.isArray(records)) return { kind: "lessons", records };
  } else if (t.startsWith("{")) {
    const obj = tryJson(t);
    if (obj && typeof obj === "object") {
      if ((obj as { format?: unknown }).format === SHARE_FORMAT) {
        return { kind: "shared", source: "json", payload: parsePayloadJson(t) };
      }
      return { kind: "lessons", records: [obj] };
    }
  } else if (t.startsWith("---")) {
    return { kind: "shared", source: "markdown", payload: parseShareMarkdownFile(t) };
  }
  const matches = [...t.matchAll(new RegExp(CODE_RE.source, "g"))];
  if (matches.length === 0) {
    throw new ShareInputError(
      "Not a devcoach lesson: expected a devcoach:lesson code, a share link, a .devcoach.md file or a lessons JSON export.",
    );
  }
  // The real code is the LAST line of a card, and a lesson body may quote a devcoach:lesson:…
  // example of its own — so try every match, last first, each also re-joined with the base64
  // continuation lines email clients wrap it into.
  let lastError: unknown;
  for (const m of matches.reverse()) {
    const candidates = [m[0]];
    const rejoined = rejoinWrappedCode(t.slice(m.index ?? 0));
    if (rejoined !== m[0]) candidates.push(rejoined);
    for (const candidate of candidates) {
      try {
        return { kind: "shared", source: "code", payload: decodeShareCode(candidate) };
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}

function rejoinWrappedCode(fromCode: string): string {
  const lines = fromCode.split("\n").map((l) => l.trim());
  let code = lines[0] ?? "";
  for (const line of lines.slice(1)) {
    if (!/^[A-Za-z0-9_-]+$/.test(line)) break;
    code += line;
  }
  return code;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ShareInputError("This looks like JSON but does not parse — copy it again.");
  }
}

// ── Import shaping ───────────────────────────────────────────────────────────

/** The stored form of a shared lesson: ours from now on, flagged `imported`, named after the sender. */
export function sharedLessonToLesson(payload: SharedLesson, id: string, now = new Date()): Lesson {
  const l = payload.lesson;
  return parseLesson({
    id,
    timestamp: now,
    topic_id: l.topic_id,
    categories: l.categories,
    title: l.title,
    level: l.level,
    summary: l.summary,
    body: l.body,
    task_context: l.task_context ?? null,
    project: l.project ?? null,
    repository: l.repository ?? null,
    branch: l.branch ?? null,
    commit_hash: l.commit_hash ?? null,
    folder: null,
    repository_platform: l.repository_platform ?? null,
    starred: false,
    feedback: null,
    imported: true,
    shared_by: payload.shared_by,
  });
}

/** How many different lessons may share one origin id before an import is refused. */
export const MAX_ID_CANDIDATES = 50;

/** Candidate local ids for an import: the sender's id first, then collision-safe suffixes. */
export function sharedLessonIdCandidates(payload: SharedLesson, max = MAX_ID_CANDIDATES): string[] {
  const base = payload.origin.id;
  const candidates = [base];
  for (let n = 1; candidates.length < max; n++) {
    candidates.push(n === 1 ? `${base}-shared` : `${base}-shared-${n}`);
  }
  return candidates;
}

/** True when an existing row is this very shared lesson (a re-import), not a different lesson. */
export function isSameSharedLesson(existing: Lesson, payload: SharedLesson): boolean {
  return (
    existing.imported &&
    existing.title === payload.lesson.title &&
    existing.topic_id === payload.lesson.topic_id &&
    (existing.shared_by ?? null) === (payload.shared_by ?? null)
  );
}
