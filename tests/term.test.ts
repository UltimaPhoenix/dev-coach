import { afterEach, describe, expect, it, vi } from "vitest";
import {
  colorEnabled,
  displayWidth,
  MAX_LINK_URL_LENGTH,
  MAX_READING_WIDTH,
  pad,
  readingWidth,
  renderTable,
  rule,
  sanitizeForTerminal,
  sanitizeLine,
  stripAnsi,
  supportsHyperlinks,
  termWidth,
  trustedLink,
} from "../src/cli/term";

const ESC = "\x1b";
const BEL = "\x07";
const ST = `${ESC}\\`;
/** Anything a terminal could act on: C0 except tab/newline, DEL, C1, and the bidi controls. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the test looks for control characters
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u{202a}-\u{202e}\u{2066}-\u{2069}]/u;
const FAMILY = "\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}\u{200d}\u{1f466}";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sanitizeForTerminal: someone else's text never drives the terminal", () => {
  const cases: [string, string, string][] = [
    ["CSI clear screen + scrollback + home", `a${ESC}[2J${ESC}[3J${ESC}[Hb`, "ab"],
    ["CSI colour", `${ESC}[1;31mred${ESC}[0m`, "red"],
    ["CSI with private parameters", `a${ESC}[?1049hb`, "ab"],
    [
      "OSC 8 javascript: link, BEL",
      `${ESC}]8;;javascript:alert(1)${BEL}Ada${ESC}]8;;${BEL}`,
      "Ada",
    ],
    ["OSC 8 file: link, ST", `${ESC}]8;;file:///etc/passwd${ST}guide${ESC}]8;;${ST}`, "guide"],
    ["OSC 52 clipboard write, BEL", `x${ESC}]52;c;ZWNobyBwd25lZA+/=${BEL}y`, "xy"],
    ["OSC 52 clipboard write, ST", `x${ESC}]52;c;ZWNobyBwd25lZA==${ST}y`, "xy"],
    ["OSC 0 window title", `${ESC}]0;owned${BEL}text`, "text"],
    ["DCS string", `a${ESC}P1$qm${ST}b`, "ab"],
    ["APC / PM / SOS strings", `a${ESC}_x${ST}b${ESC}^y${ST}c${ESC}Xz${ST}d`, "abcd"],
    ["8-bit CSI (C1)", "a\x9b2Jb", "ab"],
    ["8-bit OSC 8 with an 8-bit ST", "a\x9d8;;javascript:x\x9cb\x9d8;;\x9c", "ab"],
    ["8-bit DCS", "a\x90q\x9cb", "ab"],
    ["full reset (RIS) and charset switch", `a${ESC}cb${ESC}(0c`, "abc"],
    ["save / restore cursor", `a${ESC}7b${ESC}8c`, "abc"],
    ["a lone ESC at the end", `abc${ESC}`, "abc"],
    ["bare BEL, BS, CR, VT, FF, DEL, NUL", "a\x07b\x08c\rd\x0be\x0cf\x7fg\x00h", "abcdefgh"],
    ["C1 controls outside a sequence (NEL, RI, a stray ST)", "a\x85b\x8dc\x9cd", "abcd"],
    ["an 8-bit APC opener swallows its string", "a\x9fstring\x9cb", "ab"],
    ["right-to-left override", "invoice\u{202e}fdp.exe", "invoicefdp.exe"],
    [
      "bidi isolates and marks",
      "\u{2066}a\u{2069}\u{2067}b\u{2069}\u{200e}\u{200f}\u{61c}c",
      "abc",
    ],
    ["zero-width space, BOM, line separators", "a\u{200b}b\u{feff}c\u{2028}d\u{2029}e", "abcde"],
  ];
  it.each(cases)("%s", (_name, input, expected) => {
    const out = sanitizeForTerminal(input);
    expect(out).toBe(expected);
    expect(out).not.toMatch(CONTROL);
  });

  it("an unterminated control string stops at the end of its line, so the lesson survives", () => {
    expect(sanitizeForTerminal(`a${ESC}]8;;javascript:x\nthe rest`)).toBe("a\nthe rest");
    expect(sanitizeForTerminal(`a\x9d52;c;eA==\nthe rest`)).toBe("a\nthe rest");
  });

  it("no control character survives, alone or next to text (exhaustive over C0, DEL and C1)", () => {
    for (let cp = 0; cp <= 0x9f; cp++) {
      if (cp >= 0x20 && cp < 0x7f) continue;
      const ch = String.fromCodePoint(cp);
      for (const input of [ch, `a${ch}b`, `${ch}[2J`, `${ch}]8;;javascript:x${BEL}y`]) {
        expect(sanitizeForTerminal(input), `U+${cp.toString(16)}`).not.toMatch(CONTROL);
      }
    }
  });

  it("keeps everything that is text: newlines, tabs, emoji sequences, CJK, accents, markdown", () => {
    const text = `Line one\n\tindented ${FAMILY} 漢字 café\n\`2 * 3\` [x](https://example.com) ★ ✅`;
    expect(sanitizeForTerminal(text)).toBe(text);
    expect(sanitizeForTerminal("e\u{301}")).toBe("e\u{301}"); // a combining mark is text
    expect(sanitizeForTerminal("a\u{200c}b")).toBe("a\u{200c}b"); // ZWNJ stays (Persian, Indic scripts)
  });

  it("is linear on a large hostile input (a share code inflates to at most 256 KiB)", () => {
    const chunk = `${ESC}[2J${ESC}]8;;javascript:x${BEL}text${ESC}]52;c;eA==${ST}\x9b1m${ESC}`;
    const input = chunk.repeat(Math.ceil((256 * 1024) / chunk.length));
    const started = performance.now();
    const out = sanitizeForTerminal(input);
    expect(performance.now() - started).toBeLessThan(250);
    expect(out).toBe("text".repeat(Math.ceil((256 * 1024) / chunk.length)));
  });

  it("sanitizeLine also folds line breaks and tabs into one space", () => {
    expect(sanitizeLine("a\n\tb\r\nc")).toBe("a b c");
    expect(sanitizeLine(`Title${ESC}[2J\nsecond line`)).toBe("Title second line");
  });
});

describe("trustedLink: only a plain http(s) URL the CLI built becomes OSC 8", () => {
  it("wraps http and https URLs when the terminal supports links; stripAnsi removes the wrapper", () => {
    vi.stubEnv("FORCE_HYPERLINK", "1");
    const url = "http://127.0.0.1:7860/lessons/busy-timeout";
    const wrapped = trustedLink(url);
    expect(wrapped).toBe(`${ESC}]8;;${url}${BEL}${url}${ESC}]8;;${BEL}`);
    expect(stripAnsi(wrapped)).toBe(url);
    expect(stripAnsi(trustedLink(url, "dashboard"))).toBe("dashboard");
    expect(trustedLink("https://example.com/a?b=c#d")).toContain(`${ESC}]8;;https://example.com`);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["file:", "file:///etc/passwd"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["another scheme", "ftp://example.com"],
    ["BEL inside the URL", `http://x${BEL}${ESC}]8;;javascript:alert(1)`],
    ["ESC inside the URL", `http://x${ESC}]52;c;eA==`],
    ["an 8-bit ST inside the URL", "http://x\x9cy"],
    ["a space inside the URL", "http://x y"],
    ["a right-to-left override inside the URL", "http://x\u{202e}y"],
    ["too long", `http://x/${"a".repeat(MAX_LINK_URL_LENGTH)}`],
  ])("%s prints as plain, inert text", (_name, url) => {
    vi.stubEnv("FORCE_HYPERLINK", "1");
    const out = trustedLink(url);
    expect(out).not.toContain(`${ESC}]8`);
    expect(out).not.toMatch(CONTROL);
    expect(out).toBe(sanitizeLine(url));
  });

  it("the label is sanitised too, and without link support the URL is plain text", () => {
    vi.stubEnv("FORCE_HYPERLINK", "1");
    expect(stripAnsi(trustedLink("http://ok.test", `a${ESC}[2Jb`))).toBe("ab");
    vi.stubEnv("FORCE_HYPERLINK", "0");
    vi.stubEnv("NO_COLOR", "1");
    expect(trustedLink("http://localhost:7860")).toBe("http://localhost:7860");
  });

  it("detects terminals that render OSC 8, and nothing else", () => {
    const tty = (env: NodeJS.ProcessEnv) => supportsHyperlinks(env, true);
    expect(supportsHyperlinks({ TERM_PROGRAM: "iTerm.app" }, false)).toBe(false); // piped
    expect(tty({ TERM_PROGRAM: "iTerm.app" })).toBe(true);
    expect(tty({ TERM_PROGRAM: "vscode" })).toBe(true);
    expect(tty({ TERM_PROGRAM: "ghostty" })).toBe(true);
    expect(tty({ TERM_PROGRAM: "Apple_Terminal" })).toBe(false);
    expect(tty({ TERM: "xterm-kitty" })).toBe(true);
    expect(tty({ WT_SESSION: "x" })).toBe(true);
    expect(tty({ VTE_VERSION: "5000" })).toBe(true);
    expect(tty({ VTE_VERSION: "4999" })).toBe(false);
    expect(tty({ TERM_PROGRAM: "iTerm.app", NO_COLOR: "1" })).toBe(false);
    expect(tty({ TERM: "dumb" })).toBe(false);
    expect(tty({})).toBe(false);
    expect(supportsHyperlinks({ FORCE_HYPERLINK: "1" }, false)).toBe(true);
    expect(supportsHyperlinks({ FORCE_HYPERLINK: "0", TERM_PROGRAM: "iTerm.app" }, false)).toBe(
      false,
    );
  });
});

describe("colour: NO_COLOR wins, FORCE_COLOR forces unless 0/false, TERM=dumb disables", () => {
  it.each([
    ["a TTY", {}, true, true],
    ["a pipe", {}, false, false],
    ["TERM=dumb", { TERM: "dumb" }, true, false],
    ["TERM=dumb, forced", { TERM: "dumb", FORCE_COLOR: "1" }, true, true],
    ["FORCE_COLOR=0 on a TTY", { FORCE_COLOR: "0" }, true, false],
    ["FORCE_COLOR=false on a TTY", { FORCE_COLOR: "false" }, true, false],
    ["FORCE_COLOR=1 on a pipe", { FORCE_COLOR: "1" }, false, true],
    ["FORCE_COLOR=3 on a pipe", { FORCE_COLOR: "3" }, false, true],
    ["FORCE_COLOR empty on a pipe", { FORCE_COLOR: "" }, false, true],
    ["NO_COLOR on a TTY", { NO_COLOR: "1" }, true, false],
    ["NO_COLOR beats FORCE_COLOR", { NO_COLOR: "1", FORCE_COLOR: "1" }, false, false],
    ["an empty NO_COLOR is unset", { NO_COLOR: "" }, true, true],
  ])("%s", (_name, env, isTTY, expected) => {
    expect(colorEnabled(env as NodeJS.ProcessEnv, isTTY)).toBe(expected);
  });

  it("the decision reaches the styles (made once, at load)", async () => {
    const bold = async (env: Record<string, string | undefined>): Promise<string> => {
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const term = await import("../src/cli/term");
      return term.c.bold("x");
    };
    expect(await bold({ NO_COLOR: undefined, FORCE_COLOR: "0" })).toBe("x");
    expect(await bold({ NO_COLOR: undefined, FORCE_COLOR: "1" })).toBe(`${ESC}[1mx${ESC}[22m`);
    expect(await bold({ NO_COLOR: "1", FORCE_COLOR: "1" })).toBe("x");
  });
});

describe("displayWidth: columns per grapheme", () => {
  it.each([
    ["", 0],
    ["plain ascii", 11],
    ["💡", 2],
    ["✅ ✨ ❌", 8],
    ["🎓", 2],
    ["★", 1],
    ["✓✦✗☆─│█░○●", 10],
    [FAMILY, 2],
    ["\u{1f1ee}\u{1f1f9}", 2], // a flag
    ["\u{1f44d}\u{1f3fd}", 2], // skin tone
    ["1\u{fe0f}\u{20e3}", 2], // keycap
    ["⚠\u{fe0f}", 2], // emoji presentation selector
    ["⚠", 1],
    ["⚠\u{fe0e}", 1], // text presentation selector
    ["e\u{301}", 1], // combining acute
    ["漢字", 4],
    ["日本語のテキスト", 16],
    ["한국어", 6],
    ["ＡＢ", 4], // fullwidth forms
    ["\u{3000}", 2], // ideographic space
    ["\u{200b}\u{200d}", 0],
    ["Cache 💡", 8],
  ])("%j is %i columns", (s, w) => {
    expect(displayWidth(s)).toBe(w);
  });

  it("our own colour and link escapes count nothing", () => {
    expect(displayWidth(`${ESC}[1m💡${ESC}[22m`)).toBe(2);
    expect(displayWidth(`${ESC}]8;;http://x${BEL}dashboard${ESC}]8;;${BEL}`)).toBe(9);
    expect(displayWidth(`${ESC}]8;;http://x${ST}漢${ESC}]8;;${ST}`)).toBe(2);
  });

  it("pad() pads to display columns", () => {
    expect(pad("💡", 4)).toBe("💡  ");
    expect(pad("漢", 3, "right")).toBe(" 漢");
    expect(pad("✅", 6, "center")).toBe("  ✅  ");
    expect(pad("too wide", 3)).toBe("too wide");
  });
});

/** Display columns of every box-drawing border in a rendered line. */
function borderColumns(line: string): number[] {
  const cols: number[] = [];
  let col = 0;
  for (const { segment } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(line)) {
    if ("│┬┼┴╭╮├┤╰╯".includes(segment)) cols.push(col);
    col += displayWidth(segment);
  }
  return cols;
}

describe("renderTable with wide glyphs", () => {
  it("every row has the same width and its borders in the same columns", () => {
    const table = renderTable(
      "Lessons",
      [{ header: "" }, { header: "Title" }, { header: "Level", justify: "center" }],
      [
        ["★", "WAL mode: readers never block writers 💡", "mid"],
        ["·", "Cache stampede ✗", "senior"],
        ["·", "Answered ✅ ✨ ❌", "junior"],
        ["·", "漢字のレッスン", "mid"],
        ["·", `Family ${FAMILY} \u{1f1ee}\u{1f1f9}`, "mid"],
      ],
    );
    const [title, ...lines] = table.split("\n");
    const width = displayWidth(lines[0] ?? "");
    for (const line of lines) {
      expect(displayWidth(line), line).toBe(width);
      expect(borderColumns(line), line).toEqual(borderColumns(lines[0] ?? ""));
    }
    expect(displayWidth(title ?? "")).toBe(width);
  });
});

describe("termWidth, readingWidth and the left-anchored rule", () => {
  it("termWidth: explicit > the terminal's columns > COLUMNS > 80, skipping nonsense", () => {
    expect(termWidth(120, { columns: 80 }, { COLUMNS: "90" })).toBe(120);
    expect(termWidth(undefined, { columns: 80 }, { COLUMNS: "90" })).toBe(80);
    expect(termWidth(undefined, {}, { COLUMNS: "90" })).toBe(90);
    expect(termWidth(undefined, {}, {})).toBe(80);
    expect(termWidth(0, { columns: 0 }, { COLUMNS: "wide" })).toBe(80);
    expect(termWidth(-5, {}, { COLUMNS: "-1" })).toBe(80);
  });

  it("readingWidth caps the detected width at 100, never an explicit one", () => {
    expect(readingWidth(150)).toBe(150);
    vi.stubEnv("COLUMNS", "300");
    expect(readingWidth()).toBe(Math.min(termWidth(), MAX_READING_WIDTH));
    expect(readingWidth()).toBeLessThanOrEqual(MAX_READING_WIDTH);
  });

  it("rule() is left-anchored and exactly as wide as asked, wide glyphs included", () => {
    expect(rule("", 10)).toBe("─".repeat(10));
    expect(rule("Title", 30).startsWith("── Title ─")).toBe(true);
    for (const text of [
      "Title",
      "💡 Senior tip",
      "漢字",
      "🎓 devcoach",
      `${ESC}[1mBold${ESC}[22m`,
    ]) {
      expect(displayWidth(rule(text, 30)), text).toBe(30);
    }
    // a title wider than the rule keeps it whole and still closes with two dashes
    expect(rule("a title much wider than the rule", 10)).toBe(
      "── a title much wider than the rule ──",
    );
    expect(displayWidth(rule())).toBe(readingWidth());
  });
});
