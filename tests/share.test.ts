import { describe, expect, it } from "vitest";
import { type Lesson, parseLesson } from "../src/core/models";
import {
  buildSharePayload,
  decodeShareCode,
  encodeShareCode,
  isSameSharedLesson,
  parseSharedInput,
  parseShareMarkdownFile,
  renderShareLink,
  renderShareMarkdownFile,
  renderShareText,
  resolveSharedBy,
  SHARE_CODE_PREFIX,
  SHARE_PAGE_URL,
  ShareInputError,
  sharedLessonFilename,
  sharedLessonIdCandidates,
  sharedLessonToLesson,
} from "../src/core/share";
import { fetchSharedInput, isHttpUrl } from "../src/core/share-fetch";

const lesson = (over: Partial<Lesson> = {}): Lesson =>
  parseLesson({
    id: "promise-allsettled-vs-all",
    timestamp: "2026-09-01T10:00:00Z",
    topic_id: "typescript",
    categories: ["typescript", "async"],
    title: 'Promise.allSettled vs Promise.all: "fail fast" is a choice',
    level: "mid",
    summary: 'Summary with a colon: and "quotes".',
    body: "First paragraph.\n\n```ts\nawait Promise.allSettled(tasks);\n```\n\n💡 *Senior tip:* pick on purpose.",
    task_context: "refactoring the uploader",
    project: "dev-coach",
    repository: "UltimaPhoenix/dev-coach",
    branch: "main",
    commit_hash: "abc123",
    folder: "/Users/someone/dev/dev-coach",
    repository_platform: "github",
    starred: true,
    feedback: "know",
    ...over,
  });

const now = new Date("2026-09-11T17:30:00Z");

describe("share payload", () => {
  it("strips context by default, keeps origin + sender + app version", () => {
    const p = buildSharePayload(lesson(), { includeContext: false, sharedBy: "Ada", now });
    expect(p.format).toBe("devcoach.lesson");
    expect(p.version).toBe(1);
    expect(p.lesson).toEqual({
      title: lesson().title,
      summary: lesson().summary,
      body: lesson().body,
      topic_id: "typescript",
      categories: ["typescript", "async"],
      level: "mid",
    });
    expect(p.origin).toEqual({
      id: "promise-allsettled-vs-all",
      timestamp: "2026-09-01T10:00:00Z",
    });
    expect(p.shared_by).toBe("Ada");
    expect(p.shared_at).toBe("2026-09-11T17:30:00Z");
    expect(p.app_version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("with context: project/branch/commit/task travel, the local folder never does", () => {
    const p = buildSharePayload(lesson(), { includeContext: true, sharedBy: null, now });
    expect(p.lesson).toMatchObject({
      task_context: "refactoring the uploader",
      project: "dev-coach",
      branch: "main",
      commit_hash: "abc123",
      repository: "UltimaPhoenix/dev-coach",
      repository_platform: "github",
    });
    expect(JSON.stringify(p)).not.toContain("/Users/someone");
  });

  it("a local repository is a path — it stays home even with context on", () => {
    const local = lesson({
      repository: "/Users/someone/dev/private",
      repository_platform: "local",
    });
    const p = buildSharePayload(local, { includeContext: true, sharedBy: null, now });
    expect(p.lesson.repository).toBeUndefined();
    expect(p.lesson.repository_platform).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain("/Users/someone");
  });

  it("resolveSharedBy: explicit → anonymous → setting → git → null", () => {
    const base = { setting: "Setting Name", gitUserName: "Git Name" };
    expect(resolveSharedBy({ explicit: "Ada", ...base })).toBe("Ada");
    expect(resolveSharedBy({ explicit: "  ", ...base })).toBeNull();
    expect(resolveSharedBy({ anonymous: true, explicit: "Ada", ...base })).toBeNull();
    expect(resolveSharedBy({ ...base })).toBe("Setting Name");
    expect(resolveSharedBy({ setting: "", gitUserName: "Git Name" })).toBe("Git Name");
    expect(resolveSharedBy({ setting: null, gitUserName: null })).toBeNull();
  });
});

describe("share code", () => {
  const payload = buildSharePayload(lesson(), { includeContext: false, sharedBy: "Ada", now });

  it("round-trips, is one base64url line, and stays compact", () => {
    const code = encodeShareCode(payload);
    expect(code.startsWith(SHARE_CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^devcoach:lesson:1:[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(1200);
    expect(decodeShareCode(code)).toEqual(payload);
  });

  it("decodes with the browser-native DecompressionStream(deflate-raw) — what the docs page does", async () => {
    const code = encodeShareCode(payload);
    const b64 = code.slice(SHARE_CODE_PREFIX.length);
    const bytes = new Uint8Array(Buffer.from(b64, "base64url"));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const json = await new Response(stream).text();
    expect(JSON.parse(json)).toEqual(payload);
  });

  it("rejects foreign, newer, damaged and non-lesson codes with friendly errors", () => {
    expect(() => decodeShareCode("hello")).toThrow(ShareInputError);
    expect(() => decodeShareCode("devcoach:lesson:2:AAAA")).toThrow(/newer devcoach/);
    expect(() => decodeShareCode("devcoach:lesson:1:not-really-deflate")).toThrow(/damaged/);
    const notLesson = `${SHARE_CODE_PREFIX}${Buffer.from(
      // raw deflate of '{"format":"other"}' via the same encoder path
      require("fflate").deflateSync(require("fflate").strToU8('{"format":"other"}')),
    ).toString("base64url")}`;
    expect(() => decodeShareCode(notLesson)).toThrow(/not a valid devcoach lesson/);
  });
});

describe("share renderers", () => {
  const payload = buildSharePayload(lesson(), { includeContext: true, sharedBy: "Ada", now });

  it("text = the card, a hint line, and the code as the very last line", () => {
    const text = renderShareText(payload);
    const lines = text.split("\n");
    expect(lines[0]).toContain("🎓 devcoach");
    expect(text).toContain("**Promise.allSettled vs Promise.all");
    expect(text).toContain("Shared by Ada with devcoach");
    expect(lines.at(-1)).toBe(encodeShareCode(payload));
    expect(renderShareText({ ...payload, shared_by: null })).toContain("Shared with devcoach —");
  });

  it("link = docs page + fragment; filename = slug of the origin id", () => {
    expect(renderShareLink(payload)).toBe(`${SHARE_PAGE_URL}#${encodeShareCode(payload)}`);
    expect(sharedLessonFilename(payload)).toBe("promise-allsettled-vs-all.devcoach.md");
    expect(
      sharedLessonFilename({ ...payload, origin: { ...payload.origin, id: "  Über id!! " } }),
    ).toBe("ber-id.devcoach.md");
  });

  it("markdown file round-trips, including context keys and awkward strings", () => {
    const md = renderShareMarkdownFile(payload);
    expect(md.startsWith("---\nformat: devcoach.lesson\nversion: 1\n")).toBe(true);
    expect(md).toContain('title: "Promise.allSettled vs Promise.all: \\"fail fast\\" is a choice"');
    expect(md).toContain("categories: [typescript, async]");
    expect(md).toContain('shared_by: "Ada"');
    expect(md).toContain("repository_platform:");
    expect(md.trimEnd().endsWith("💡 *Senior tip:* pick on purpose.")).toBe(true);
    expect(parseShareMarkdownFile(md)).toEqual(payload);
    // CRLF files and an anonymous sender parse the same way.
    const anon = renderShareMarkdownFile({ ...payload, shared_by: null });
    expect(anon).toContain("shared_by: null");
    expect(parseShareMarkdownFile(anon.replace(/\n/g, "\r\n"))).toEqual({
      ...payload,
      shared_by: null,
    });
  });

  it("markdown parser: unknown keys ignored, broken files rejected", () => {
    const md = renderShareMarkdownFile(payload).replace(
      "---\nformat:",
      "---\nextra: whatever\nformat:",
    );
    expect(parseShareMarkdownFile(md)).toEqual(payload);
    expect(() => parseShareMarkdownFile("no frontmatter")).toThrow(/Missing frontmatter/);
    expect(() => parseShareMarkdownFile("---\nformat: devcoach.lesson\nbody")).toThrow(
      /never closes/,
    );
    expect(() => parseShareMarkdownFile("---\nnot a pair\n---\nbody")).toThrow(/Cannot read/);
    expect(() =>
      parseShareMarkdownFile("---\nformat: devcoach.lesson\nversion: 1\nlevel: guru\n---\nbody"),
    ).toThrow(/not a valid/);
  });
});

describe("parseSharedInput", () => {
  const payload = buildSharePayload(lesson(), { includeContext: false, sharedBy: "Ada", now });
  const code = encodeShareCode(payload);

  it("accepts the bare code, the whole copied card, the link and the file", () => {
    expect(parseSharedInput(code)).toEqual({ kind: "shared", source: "code", payload });
    expect(parseSharedInput(`  ${renderShareText(payload)}\n\nthanks!`)).toEqual({
      kind: "shared",
      source: "code",
      payload,
    });
    expect(parseSharedInput(renderShareLink(payload))).toEqual({
      kind: "shared",
      source: "code",
      payload,
    });
    expect(parseSharedInput(renderShareMarkdownFile(payload))).toEqual({
      kind: "shared",
      source: "markdown",
      payload,
    });
    expect(parseSharedInput(JSON.stringify(payload))).toEqual({
      kind: "shared",
      source: "json",
      payload,
    });
  });

  it("re-joins a code that an email client wrapped onto several lines", () => {
    const wrapped = `${code.slice(0, 60)}\n${code.slice(60, 130)}\n${code.slice(130)}\n\nSee you`;
    expect(parseSharedInput(wrapped).kind).toBe("shared");
  });

  it("keeps the legacy lessons JSON export working (array or single lesson)", () => {
    expect(parseSharedInput(JSON.stringify([lesson()]))).toEqual({
      kind: "lessons",
      records: [lesson()],
    });
    expect(parseSharedInput(JSON.stringify(lesson()))).toEqual({
      kind: "lessons",
      records: [lesson()],
    });
  });

  it("explains what it could not read", () => {
    expect(() => parseSharedInput("")).toThrow(/Nothing to import/);
    expect(() => parseSharedInput("just some prose")).toThrow(/Not a devcoach lesson/);
    expect(() => parseSharedInput("[not json")).toThrow(/does not parse/);
    expect(() => parseSharedInput(code.slice(0, 40) + code.slice(60))).toThrow(ShareInputError);
  });
});

describe("import shaping", () => {
  const payload = buildSharePayload(lesson(), { includeContext: false, sharedBy: "Ada", now });

  it("becomes our own lesson: import time, flagged, named after the sender, no feedback/star", () => {
    const l = sharedLessonToLesson(payload, "promise-allsettled-vs-all", now);
    expect(l).toMatchObject({
      id: "promise-allsettled-vs-all",
      timestamp: "2026-09-11T17:30:00Z",
      imported: true,
      shared_by: "Ada",
      starred: false,
      feedback: null,
      folder: null,
      task_context: null,
      title: payload.lesson.title,
    });
  });

  it("id candidates keep the sender's id first, then collision-safe suffixes", () => {
    expect(sharedLessonIdCandidates(payload)).toEqual([
      "promise-allsettled-vs-all",
      "promise-allsettled-vs-all-shared",
      "promise-allsettled-vs-all-shared-2",
      "promise-allsettled-vs-all-shared-3",
    ]);
  });

  it("recognises a re-import of the same share, not an own lesson with the same slug", () => {
    const stored = sharedLessonToLesson(payload, payload.origin.id, now);
    expect(isSameSharedLesson(stored, payload)).toBe(true);
    expect(isSameSharedLesson(lesson(), payload)).toBe(false); // own lesson, same id
    expect(isSameSharedLesson({ ...stored, shared_by: "Bob" }, payload)).toBe(false);
  });
});

describe("fetchSharedInput", () => {
  it("only http(s), with timeout and size caps, mapped to friendly errors", async () => {
    expect(isHttpUrl("https://x.y/z")).toBe(true);
    expect(isHttpUrl("ftp://x")).toBe(false);
    await expect(fetchSharedInput("file:///etc/passwd")).rejects.toThrow(/Only http/);
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        new Response("devcoach:lesson:1:abc", { status: 200 })) as typeof fetch;
      expect(await fetchSharedInput("https://example.test/raw")).toBe("devcoach:lesson:1:abc");
      globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
      await expect(fetchSharedInput("https://example.test/raw")).rejects.toThrow(/answered 404/);
      globalThis.fetch = (async () =>
        new Response("x".repeat(10), { status: 200 })) as typeof fetch;
      await expect(fetchSharedInput("https://example.test/raw", { maxBytes: 5 })).rejects.toThrow(
        /too large/,
      );
      globalThis.fetch = (async (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        })) as typeof fetch;
      await expect(
        fetchSharedInput("https://example.test/slow", { timeoutMs: 20 }),
      ).rejects.toThrow(/timed out/);
      globalThis.fetch = (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch;
      await expect(fetchSharedInput("https://example.test/down")).rejects.toThrow(
        /could not be reached/,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
