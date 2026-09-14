// Browser-side decoder for `devcoach:lesson:1:<base64url(raw deflate JSON)>` share codes.
// Mirrors src/core/share.ts in the main package (encodeShareCode / decodeShareCode) — the docs
// site must stay dependency-free here, so it uses the native DecompressionStream instead of fflate.
// Nothing leaves the browser: the code lives in the URL fragment, which is never sent to a server.

export const SHARE_CODE_PREFIX = "devcoach:lesson:1:";
const CODE_RE = /devcoach:lesson:(\d+):([A-Za-z0-9_-]+)/;
const MAX_DECODED_BYTES = 256 * 1024;
// A real code is ~1–3 K chars; this bounds the compressed input before anything is inflated.
const MAX_CODE_CHARS = 64_000;
const TOO_LARGE = "The code is too large to be a lesson.";

export interface SharedLesson {
  format: "devcoach.lesson";
  version: number;
  lesson: {
    title: string;
    summary: string;
    body: string | null;
    topic_id: string;
    categories: string[];
    level: "junior" | "mid" | "senior";
    task_context?: string | null;
    project?: string | null;
    repository?: string | null;
    branch?: string | null;
    commit_hash?: string | null;
    repository_platform?: string | null;
  };
  origin: { id: string; timestamp: string };
  shared_by: string | null;
  shared_at: string;
  app_version: string;
}

export class ShareCodeError extends Error {}

/**
 * Share codes found inside anything the user pasted (a bare code, a link, the whole card), in
 * the order worth trying: the literal match first, then — for codes an email client wrapped —
 * the match re-joined with the base64url-only lines that follow it (same rule as the CLI).
 */
export function extractShareCodeCandidates(text: string): string[] {
  const m = CODE_RE.exec(text);
  if (!m) return [];
  const lines = text
    .slice(m.index)
    .split("\n")
    .map((l) => l.trim());
  let rejoined = m[0];
  for (const line of lines.slice(1)) {
    if (!/^[A-Za-z0-9_-]+$/.test(line)) break;
    rejoined += line;
  }
  return rejoined === m[0] ? [m[0]] : [m[0], rejoined];
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function decodeShareCode(code: string): Promise<SharedLesson> {
  const m = /^devcoach:lesson:(\d+):([A-Za-z0-9_-]+)$/.exec(code.trim());
  if (!m) throw new ShareCodeError("This is not a devcoach lesson code.");
  if (Number(m[1]) > 1) {
    throw new ShareCodeError("This lesson was shared by a newer devcoach — update yours to read it.");
  }
  if (m[2].length > MAX_CODE_CHARS) throw new ShareCodeError(TOO_LARGE);
  let text: string;
  try {
    const bytes = base64urlToBytes(m[2]);
    const reader = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"))
      .getReader();
    // Inflate with a byte budget: stop as soon as the output passes the cap instead of
    // materialising a "zip bomb" in the visitor's tab (same rule as the CLI's inflateBounded).
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DECODED_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ShareCodeError(TOO_LARGE);
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(joined);
  } catch (err) {
    if (err instanceof ShareCodeError) throw err;
    throw new ShareCodeError("The code is damaged or incomplete — ask for it again.");
  }
  let payload: SharedLesson;
  try {
    payload = JSON.parse(text) as SharedLesson;
  } catch {
    throw new ShareCodeError("The code is damaged or incomplete — ask for it again.");
  }
  const l = payload?.lesson;
  if (
    payload?.format !== "devcoach.lesson" ||
    typeof l?.title !== "string" ||
    typeof l?.summary !== "string" ||
    typeof l?.topic_id !== "string" ||
    !Array.isArray(l?.categories)
  ) {
    throw new ShareCodeError("This is not a devcoach lesson.");
  }
  return payload;
}

// ── .devcoach.md (mirror of renderShareMarkdownFile / sharedLessonFilename in src/core/share.ts) ──
// Keep byte-compatible with the CLI/dashboard parser: a strict YAML subset (JSON-quoted strings,
// flow lists, `null`), then the lesson body.

export const SHARE_FILE_SUFFIX = ".devcoach.md";

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lesson"
  );
}

export function sharedLessonFilename(payload: SharedLesson): string {
  return `${slugify(payload.origin.id)}${SHARE_FILE_SUFFIX}`;
}

const PLAIN_SCALAR = /^[A-Za-z0-9_.+:@/-]+$/;
const yamlScalar = (v: string): string => (PLAIN_SCALAR.test(v) ? v : JSON.stringify(v));
const yamlList = (items: string[]): string => `[${items.map(yamlScalar).join(", ")}]`;

export function renderShareMarkdownFile(payload: SharedLesson): string {
  const l = payload.lesson;
  const lines = [
    "---",
    `format: ${payload.format}`,
    `version: ${payload.version}`,
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
