import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Lesson, parseLesson } from "../src/core/models";
import {
  buildSharePayload,
  decodeShareCode,
  encodeShareCode,
  isSameSharedLesson,
  MAX_CODE_CHARS,
  MAX_ID_CANDIDATES,
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
import {
  fetchSharedInput,
  isHttpUrl,
  isPrivateAddress,
  nodeTransport,
  type SharedResponse,
  type SharedTransport,
} from "../src/core/share-fetch";

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
    const all = sharedLessonIdCandidates(payload);
    expect(all).toHaveLength(MAX_ID_CANDIDATES);
    expect(all.slice(0, 4)).toEqual([
      "promise-allsettled-vs-all",
      "promise-allsettled-vs-all-shared",
      "promise-allsettled-vs-all-shared-2",
      "promise-allsettled-vs-all-shared-3",
    ]);
    expect(all.at(-1)).toBe(`promise-allsettled-vs-all-shared-${MAX_ID_CANDIDATES - 1}`);
    expect(sharedLessonIdCandidates(payload, 2)).toEqual([
      "promise-allsettled-vs-all",
      "promise-allsettled-vs-all-shared",
    ]);
  });

  it("a card whose body quotes a devcoach:lesson: example still imports from its real (last) code", () => {
    const p = buildSharePayload(
      lesson({
        body: "Share codes look like `devcoach:lesson:1:eJyrVkrOz1WyUkrLL8pVqgUA` — paste them.",
      }),
      { includeContext: false, sharedBy: "Ada", now },
    );
    const text = renderShareText(p);
    expect(text.indexOf("devcoach:lesson:1:")).toBeLessThan(text.lastIndexOf("devcoach:lesson:1:"));
    const parsed = parseSharedInput(text);
    expect(parsed.kind).toBe("shared");
    if (parsed.kind === "shared") expect(parsed.payload.lesson.title).toBe(p.lesson.title);
    // and a wrapped real code after a bogus example is re-joined correctly
    const code = encodeShareCode(p);
    const wrapped = `devcoach:lesson:1:bogus\n\n${code.slice(0, 60)}\n${code.slice(60)}\n`;
    expect(parseSharedInput(wrapped).kind).toBe("shared");
  });

  it("a category containing a comma survives the .devcoach.md round trip", () => {
    const p = buildSharePayload(lesson({ categories: ["hello, world", "async", 'say "hi"'] }), {
      includeContext: false,
      sharedBy: "Ada",
      now,
    });
    const back = parseShareMarkdownFile(renderShareMarkdownFile(p));
    expect(back.lesson.categories).toEqual(["hello, world", "async", 'say "hi"']);
  });

  it("recognises a re-import of the same share, not an own lesson with the same slug", () => {
    const stored = sharedLessonToLesson(payload, payload.origin.id, now);
    expect(isSameSharedLesson(stored, payload)).toBe(true);
    expect(isSameSharedLesson(lesson(), payload)).toBe(false); // own lesson, same id
    expect(isSameSharedLesson({ ...stored, shared_by: "Bob" }, payload)).toBe(false);
  });
});

describe("share code limits", () => {
  const bombCode = (inflatedBytes: number) =>
    `${SHARE_CODE_PREFIX}${Buffer.from(deflateSync(new Uint8Array(inflatedBytes), { level: 9 })).toString("base64url")}`;

  it("rejects a zip-bomb code before inflating it fully", () => {
    const code = bombCode(40 * 1024 * 1024); // ~41 KB of deflate → 40 MB
    expect(code.length).toBeLessThan(MAX_CODE_CHARS);
    const t0 = Date.now();
    expect(() => decodeShareCode(code)).toThrow(/too large/);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(() => parseSharedInput(code)).toThrow(ShareInputError);
  });

  it("rejects an over-long code without decoding it", () => {
    expect(() => decodeShareCode(`${SHARE_CODE_PREFIX}${"A".repeat(MAX_CODE_CHARS + 1)}`)).toThrow(
      /too large/,
    );
  });
});

describe("fetchSharedInput", () => {
  const publicLookup = async () => ["93.184.216.34"];
  afterEach(() => vi.restoreAllMocks());

  /** A canned transport response; `body` may be a string or any async/sync iterable of bytes. */
  const reply = (
    status: number,
    body: string | Iterable<Uint8Array> | AsyncIterable<Uint8Array> = "",
    headers: { location?: string; contentLength?: number } = {},
  ): SharedResponse => ({
    status,
    location: headers.location ?? null,
    contentLength: headers.contentLength ?? null,
    body: typeof body === "string" ? [new TextEncoder().encode(body)] : body,
    abort: vi.fn(),
  });
  /** A transport that answers the canned replies in order and records what it was asked. */
  const fakeTransport = (...replies: SharedResponse[]) => {
    const calls: { url: string; address: string }[] = [];
    const transport: SharedTransport = async (url, address) => {
      calls.push({ url: url.href, address });
      const next = replies.shift();
      if (!next) throw new Error("no more canned replies");
      return next;
    };
    return { transport, calls };
  };

  it("classifies private, loopback, link-local and unique-local addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "not-an-ip",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of [
      "93.184.216.34",
      "172.32.0.1",
      "8.8.8.8",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("refuses loopback / private / localhost hosts without any request (SSRF guard)", async () => {
    const { transport, calls } = fakeTransport();
    for (const url of [
      "http://127.0.0.1:5432/",
      "http://[::1]:7860/lessons",
      "http://localhost/x",
      "http://foo.localhost/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.7/",
    ]) {
      await expect(fetchSharedInput(url, { transport }), url).rejects.toThrow(/Only public/);
    }
    // a public-looking name that resolves to a private address is refused too
    await expect(
      fetchSharedInput("https://internal.example.test/x", {
        transport,
        lookup: async () => ["10.0.0.9"],
      }),
    ).rejects.toThrow(/Only public/);
    await expect(
      fetchSharedInput("https://mixed.example.test/x", {
        transport,
        lookup: async () => ["93.184.216.34", "192.168.0.2"],
      }),
    ).rejects.toThrow(/Only public/);
    expect(calls).toHaveLength(0);
    // the default resolver is dns.promises.lookup
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(fetchSharedInput("https://evil.example.test/x", { transport })).rejects.toThrow(
      /Only public/,
    );
    expect(calls).toHaveLength(0);
  });

  it("hands the transport the address the guard resolved, for every hop", async () => {
    const { transport, calls } = fakeTransport(
      reply(302, "", { location: "/moved" }),
      reply(200, "devcoach:lesson:1:abc"),
    );
    expect(
      await fetchSharedInput("https://example.test/raw", { transport, lookup: publicLookup }),
    ).toBe("devcoach:lesson:1:abc");
    expect(calls).toEqual([
      { url: "https://example.test/raw", address: "93.184.216.34" },
      { url: "https://example.test/moved", address: "93.184.216.34" },
    ]);
  });

  it("follows redirects by hand, re-checking every hop, up to a limit", async () => {
    const toPrivate = fakeTransport(reply(301, "", { location: "http://10.0.0.1/secret" }));
    await expect(
      fetchSharedInput("https://example.test/raw", {
        transport: toPrivate.transport,
        lookup: publicLookup,
      }),
    ).rejects.toThrow(/Only public/);
    expect(toPrivate.calls).toHaveLength(1);

    const loop = fakeTransport(
      reply(302, "", { location: "/loop" }),
      reply(302, "", { location: "/loop" }),
      reply(302, "", { location: "/loop" }),
    );
    await expect(
      fetchSharedInput("https://example.test/raw", {
        transport: loop.transport,
        lookup: publicLookup,
        maxRedirects: 2,
      }),
    ).rejects.toThrow(/too many times/);
  });

  it("the real transport pins the socket to the given address — DNS cannot rebind it", async () => {
    // A server on 127.0.0.1 answers; the URL's hostname would never resolve there. Only the pinned
    // lookup can reach it, and the Host header still names the URL's host.
    const server = http.createServer((req, res) => res.end(`host=${req.headers.host}`));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await nodeTransport(
        new URL(`http://rebind.example.test:${port}/x`),
        "127.0.0.1",
        new AbortController().signal,
      );
      expect(res.status).toBe(200);
      const chunks: Uint8Array[] = [];
      for await (const c of res.body) chunks.push(c);
      expect(Buffer.concat(chunks).toString()).toBe(`host=rebind.example.test:${port}`);
      // and the whole pipeline works end to end through it (the guard is bypassed by the lookup)
      const viaPipeline = fetchSharedInput(`http://rebind.example.test:${port}/x`, {
        lookup: async () => ["127.0.0.1"],
      });
      await expect(viaPipeline).rejects.toThrow(/Only public/); // 127.0.0.1 is never public
    } finally {
      server.close();
    }
  });

  it("caps the body while streaming, not after buffering it", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1000));
    let pulled = 0;
    async function* endless() {
      for (;;) {
        pulled++;
        yield chunk;
      }
    }
    const res = reply(200, endless());
    await expect(
      fetchSharedInput("https://example.test/big", {
        transport: async () => res,
        lookup: publicLookup,
        maxBytes: 4096,
      }),
    ).rejects.toThrow(/too large/);
    expect(pulled).toBeLessThan(20); // stopped early — an endless body never gets buffered
    expect(res.abort).toHaveBeenCalled();
    // a declared oversize Content-Length is refused before reading anything
    const declared = reply(200, "tiny", { contentLength: 10_000_000 });
    await expect(
      fetchSharedInput("https://example.test/big", {
        transport: async () => declared,
        lookup: publicLookup,
      }),
    ).rejects.toThrow(/too large/);
  });

  it("only http(s), with timeout and size caps, mapped to friendly errors", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    expect(isHttpUrl("https://x.y/z")).toBe(true);
    expect(isHttpUrl("ftp://x")).toBe(false);
    await expect(fetchSharedInput("file:///etc/passwd")).rejects.toThrow(/Only http/);
    expect(
      await fetchSharedInput("https://example.test/raw", {
        transport: async () => reply(200, "devcoach:lesson:1:abc"),
      }),
    ).toBe("devcoach:lesson:1:abc");
    await expect(
      fetchSharedInput("https://example.test/raw", { transport: async () => reply(404, "nope") }),
    ).rejects.toThrow(/answered 404/);
    await expect(
      fetchSharedInput("https://example.test/raw", {
        transport: async () => reply(200, "x".repeat(10)),
        maxBytes: 5,
      }),
    ).rejects.toThrow(/too large/);
    const slow: SharedTransport = (_u, _a, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    await expect(
      fetchSharedInput("https://example.test/slow", { transport: slow, timeoutMs: 20 }),
    ).rejects.toThrow(/timed out/);
    await expect(
      fetchSharedInput("https://example.test/down", {
        transport: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    ).rejects.toThrow(/could not be reached/);
  });
});
