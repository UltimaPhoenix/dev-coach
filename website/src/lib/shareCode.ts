// Browser-side decoder for `devcoach:lesson:1:<base64url(raw deflate JSON)>` share codes.
// Mirrors src/core/share.ts in the main package (encodeShareCode / decodeShareCode) — the docs
// site must stay dependency-free here, so it uses the native DecompressionStream instead of fflate.
// Nothing leaves the browser: the code lives in the URL fragment, which is never sent to a server.

export const SHARE_CODE_PREFIX = "devcoach:lesson:1:";
const CODE_RE = /devcoach:lesson:(\d+):([A-Za-z0-9_-]+)/;
const MAX_DECODED_BYTES = 256 * 1024;

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
  let text: string;
  try {
    const bytes = base64urlToBytes(m[2]);
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    text = await new Response(stream).text();
  } catch {
    throw new ShareCodeError("The code is damaged or incomplete — ask for it again.");
  }
  if (text.length > MAX_DECODED_BYTES) throw new ShareCodeError("The code is too large to be a lesson.");
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
