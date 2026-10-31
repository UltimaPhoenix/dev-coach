import { describe, expect, it, vi } from "vitest";
import {
  codeLines,
  inlinePieces,
  layoutWords,
  phraseWords,
  proseWordCount,
  renderMarkdown,
  toWords,
  wrapPieces,
} from "../src/cli/markdown";
import { displayWidth, stripAnsi } from "../src/cli/term";

const ESC = "\x1b";
const BEL = "\x07";
// biome-ignore lint/suspicious/noControlCharactersInRegex: the test looks for control characters
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u{202a}-\u{202e}\u{2066}-\u{2069}]/u;
const render = (md: string, width = 80): string => renderMarkdown(md, width).join("\n");
const widest = (lines: string[]): number => Math.max(...lines.map(displayWidth));

describe("renderMarkdown — someone else's text stays inert", () => {
  it("escapes, C1 controls, BEL and bidi overrides never reach the terminal", () => {
    const body = [
      `Clear ${ESC}[2J the screen, \x9b31m red, a bell${BEL}, and \u{202e}reversed\u{202c} text.`,
      "",
      "```sh",
      `echo ${ESC}]52;c;ZWNobyBwd25lZA==${BEL}done`,
      "```",
      "",
      `- item ${ESC}[1mbold${ESC}[22m`,
      `| cell ${ESC}c |`,
    ].join("\n");
    const out = render(body);
    expect(out).not.toMatch(CONTROL);
    expect(out).toContain("Clear the screen, red, a bell, and");
    expect(out).toContain("reversed text.");
    expect(out).toContain("│ echo done");
  });

  it("a link prints as `text (url)` and never becomes an OSC 8 hyperlink", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", `https://x.test/${BEL}a`]) {
      const out = render(`See [x](${url}) now.`);
      expect(out).toMatch(/^See x \(.+\) now\.$/);
      expect(out).not.toContain(`${ESC}]8`);
      expect(out).not.toMatch(CONTROL);
    }
    expect(render("[x](javascript:alert(1))")).toBe("x (javascript:alert(1))");
  });

  it("links: a title is dropped, <…> unwrapped, a bare or empty label shows the URL once", () => {
    expect(render('[guide](https://a.test/g "The guide")')).toBe("guide (https://a.test/g)");
    expect(render("[guide](<https://a.test/g>)")).toBe("guide (https://a.test/g)");
    expect(render("[https://a.test](https://a.test)")).toBe("https://a.test");
    expect(render("[](https://a.test)")).toBe("https://a.test");
    expect(render("![diagram](https://a.test/d.png)")).toBe("diagram (https://a.test/d.png)");
    expect(render("<https://a.test/auto>")).toBe("https://a.test/auto");
    expect(render("[label]() and [no url] and [open")).toBe("label and [no url] and [open");
    expect(render("<b>not a link</b>")).toBe("<b>not a link</b>");
  });
});

describe("renderMarkdown — widths", () => {
  it("CJK wraps inside the width: every line fits 20 columns", () => {
    const lines = renderMarkdown("漢字のレッスンは幅が二倍です。".repeat(4), 20);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(20);
  });

  it("a ZWJ family counts two columns, so the line around it still fits", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(displayWidth(family)).toBe(2);
    const lines = renderMarkdown(`${family} ${"word ".repeat(30)}`, 24);
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(24);
  });

  it("prose wraps at the width and never splits a word", () => {
    const text = "The quick brown fox jumps over the lazy dog again and again ".repeat(4);
    const lines = renderMarkdown(text, 30);
    expect(widest(lines)).toBeLessThanOrEqual(30);
    expect(lines.join(" ").split(/\s+/).filter(Boolean)).toEqual(text.split(/\s+/).filter(Boolean));
  });

  it("a word longer than a whole line is the only thing cut", () => {
    const url = `https://example.test/${"a".repeat(60)}`;
    const lines = renderMarkdown(`see ${url}`, 30);
    expect(lines[0]).toBe("see");
    expect(lines.slice(1).join("")).toBe(url);
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(30);
  });
});

describe("renderMarkdown — code", () => {
  it('```ts title="x" opens a fence: a `── ts ──` caption and a │ gutter, nothing re-flowed', () => {
    const out = renderMarkdown('```ts title="x" {1}\nconst a = 1;\n\n  const b = 2;\n```', 40);
    expect(out[0]).toBe(`── ts ${"─".repeat(34)}`);
    expect(out.slice(1)).toEqual(["│ const a = 1;", "│", "│   const b = 2;"]);
  });

  it("no info string → `code`; ~~~ fences; a closer must be at least as long as the opener", () => {
    expect(render("```\nx\n```", 20).split("\n")[0]).toBe(`── code ${"─".repeat(12)}`);
    const tilde = render("~~~~python\nprint(1)\n~~~\nstill code\n~~~~\nafter", 30).split("\n");
    expect(tilde).toEqual([
      `── python ${"─".repeat(20)}`,
      "│ print(1)",
      "│ ~~~",
      "│ still code",
      "",
      "after",
    ]);
    expect(render("```js\nunclosed();", 20).split("\n").at(-1)).toBe("│ unclosed();");
    expect(render("``` `bad` info\ntext", 30)).toBe("``` bad info text"); // not a fence
  });

  it("a fence inside a list item loses only the item's indentation", () => {
    const out = render("1. Run:\n   ```bash\n   npm test\n     --watch\n   ```", 40).split("\n");
    expect(out).toContain("│ npm test");
    expect(out).toContain("│   --watch");
  });

  it("↳ continues a long code line at a space and never splits a word", () => {
    const line = "return time.time() - delta * beta * math.log(random.random()) >= expiry_time";
    const out = codeLines(line, 30);
    expect(out.length).toBeGreaterThan(2);
    expect(out[0]?.startsWith("│ ")).toBe(true);
    for (const l of out.slice(1)) expect(l.startsWith("↳ ")).toBe(true);
    for (const l of out) expect(displayWidth(l)).toBeLessThanOrEqual(30);
    const chunks = out.map((l) => l.slice(2));
    expect(chunks.join(" ")).toBe(line);
    const words = new Set(line.split(" "));
    for (const chunk of chunks) for (const w of chunk.split(" ")) expect(words.has(w)).toBe(true);
  });

  it("↳ cuts a single token longer than the line, tabs expand, a wide glyph is never halved", () => {
    expect(codeLines("x".repeat(25), 12).map((l) => l.slice(2))).toEqual([
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
    expect(codeLines("\tindented", 20)).toEqual(["│     indented"]);
    const wide = codeLines("漢字漢字漢字", 7);
    for (const l of wide) expect(displayWidth(l)).toBeLessThanOrEqual(7);
    expect(wide.map((l) => l.slice(2)).join("")).toBe("漢字漢字漢字");
  });
});

describe("renderMarkdown — inline", () => {
  const plain = (md: string): string =>
    inlinePieces(md)
      .map((p) => p.text)
      .join("");
  const styles = (md: string): string[] =>
    inlinePieces(md)
      .filter((p) => p.formats.length)
      .map((p) => `${p.formats.join("+")}:${p.text}`);

  it("2 * 3 * 4 keeps its stars, and snake_case keeps its underscores", () => {
    expect(render("2 * 3 * 4 = 24")).toBe("2 * 3 * 4 = 24");
    expect(render("set max_per_day and busy_timeout")).toBe("set max_per_day and busy_timeout");
    expect(styles("2 * 3 * 4")).toEqual([]);
  });

  it("bold, italic, strike, code and escapes", () => {
    expect(styles("**bold** *it* _it2_ ***both*** ~~gone~~ `x * y`")).toEqual([
      "bold:bold",
      "italic:it",
      "italic:it2",
      "bold+italic:both",
      "strikethrough:gone",
      "cyan:x * y",
    ]);
    expect(plain("\\*not italic\\* and a\\b")).toBe("*not italic* and a\\b");
    expect(styles("**bold `code` inside**")).toEqual([
      "bold:bold ",
      "bold+cyan:code",
      "bold: inside",
    ]);
  });

  it("code spans: matching backtick runs, one padding space trimmed, unmatched runs literal", () => {
    expect(styles("`` a ` b ``")).toEqual(["cyan:a ` b"]);
    expect(plain("a ``` b")).toBe("a ``` b");
    expect(plain("`open only")).toBe("`open only");
  });

  it("an unmatched opener or closer prints as written", () => {
    expect(plain("**never closed and *half")).toBe("**never closed and *half");
    expect(plain("a~b ~~~c")).toBe("a~b ~~~c");
    expect(plain("****")).toBe("****");
  });

  it("the 5 000-star stress input renders in under 50 ms", () => {
    const inputs = ["*".repeat(5000), "*a ".repeat(5000), "**a ".repeat(2500), "[".repeat(5000)];
    renderMarkdown(inputs[1] as string, 80); // warm the JIT
    for (const input of inputs) {
      const start = performance.now();
      renderMarkdown(input, 80);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});

describe("renderMarkdown — blocks", () => {
  it("paragraphs keep one blank line between them; a list after a paragraph stays attached", () => {
    const out = render("First line\ncontinues.\n\n\nSecond.\n- one\n- two\n\nAfter.");
    expect(out).toBe("First line continues.\n\nSecond.\n• one\n• two\n\nAfter.");
  });

  it("lists: bullets become •, numbers stay, nesting hangs under the parent's text", () => {
    const md =
      "- top item that is long enough to wrap\n  - nested\n    - deeper\n- back\n10. ten\n11. eleven\n    lazy line";
    expect(render(md, 24).split("\n")).toEqual([
      "• top item that is long",
      "  enough to wrap",
      "  • nested",
      "    • deeper",
      "• back",
      "10. ten",
      "11. eleven lazy line",
    ]);
  });

  it("headings lose their # and turn bold; tables, quotes, HTML and rules print as written", () => {
    expect(render("## Heading ##\ntext")).toBe("Heading\n\ntext");
    expect(render("#hashtag is a paragraph")).toBe("#hashtag is a paragraph");
    const raw = "| a | b |\n|---|---|\n| 1 | 2 |\n> quoted *as is*\n<div>html</div>\n---\n* * *";
    expect(render(raw)).toBe(raw);
    expect(render("- a\n* * *")).toBe("• a\n* * *");
  });

  it("the 💡 tip hangs under its glyph, its label in the tip style", () => {
    const tip =
      "💡 *Senior tip:* keep writes short so the wait happens where you chose it, rarely.";
    const out = renderMarkdown(`Body.\n\n${tip}`, 40);
    expect(out[2]?.startsWith("💡 Senior tip: keep")).toBe(true);
    for (const l of out.slice(3)) expect(l.startsWith("   ")).toBe(true);
    expect(widest(out)).toBeLessThanOrEqual(40);
    expect(render("💡 no label here")).toBe("💡 no label here");
  });

  it("an empty body renders nothing; CRs and tabs are tidied", () => {
    expect(renderMarkdown("", 80)).toEqual([]);
    expect(renderMarkdown("\n\n", 80)).toEqual([]);
    expect(render("a\r\nb\tc")).toBe("a b c");
    expect(render("text\n\n\t- tabbed item\n\t\t- nested")).toBe(
      "text\n\n• tabbed item\n  • nested",
    );
  });
});

describe("colour", () => {
  const load = async (env: Record<string, string | undefined>) => {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    return import("../src/cli/markdown");
  };
  const sample = "**bold** and `code`\n\n```ts\nx\n```";

  it("FORCE_COLOR=0 → no escapes; FORCE_COLOR=1 on a pipe → escapes; NO_COLOR wins", async () => {
    try {
      let m = await load({ NO_COLOR: undefined, FORCE_COLOR: "0" });
      expect(m.renderMarkdown(sample, 40).join("\n")).not.toContain(ESC);
      m = await load({ NO_COLOR: undefined, FORCE_COLOR: "1" });
      const coloured = m.renderMarkdown(sample, 40).join("\n");
      expect(coloured).toContain(`${ESC}[1mbold${ESC}[22m`);
      expect(coloured).toContain(`${ESC}[36mcode${ESC}[39m`);
      expect(stripAnsi(coloured)).toBe(render(sample, 40));
      m = await load({ NO_COLOR: "1", FORCE_COLOR: "1" });
      expect(m.renderMarkdown(sample, 40).join("\n")).not.toContain(ESC);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("one escape pair per styled phrase: a space between two runs of one style joins them", async () => {
    try {
      const m = await load({ NO_COLOR: undefined, FORCE_COLOR: "1" });
      const [line] = m.renderMarkdown("**two words** `a` `b` plain", 80);
      expect(line).toBe(`${ESC}[1mtwo words${ESC}[22m ${ESC}[36ma b${ESC}[39m plain`);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("wrapping helpers", () => {
  it("phrases never break; one that starts a line drops its ` · `", () => {
    const words = phraseWords([
      [{ text: "a-very-long-lesson-id-of-forty-two-chars", formats: [] }],
      [],
      [{ text: "sqlite", formats: [] }],
      [{ text: "✅ knew it", formats: [] }],
    ]);
    expect(layoutWords(words, 60, "    ")).toEqual([
      "    a-very-long-lesson-id-of-forty-two-chars · sqlite",
      "    ✅ knew it",
    ]);
  });

  it("cut = false: a word too long for any line runs past the width whole, on its own line", () => {
    const id = "an-id-far-longer-than-the-line-is-wide";
    const words = toWords([{ text: `see ${id} then`, formats: [] }]);
    expect(layoutWords(words, 20, "", "", false)).toEqual(["see", id, "then"]);
    expect(layoutWords(words, 20)).toEqual(["see", id.slice(0, 20), id.slice(20), "then"]);
  });

  it("nowrap pieces glue to their neighbours; spaces between them stay break points", () => {
    const words = toWords([
      { text: "run ", formats: [] },
      { text: "npm test", formats: ["cyan"], nowrap: true },
      { text: ", then ", formats: [] },
    ]);
    expect(words.map((w) => w.pieces.map((p) => p.text).join(""))).toEqual([
      "run",
      "npm test,",
      "then",
    ]);
    expect(wrapPieces([], 10)).toEqual([""]);
    expect(wrapPieces([{ text: "x", formats: [] }], 10, "→ ", "  ")).toEqual(["→ x"]);
  });
});

describe("proseWordCount", () => {
  it("counts prose words and leaves fenced code out", () => {
    expect(proseWordCount("one two\n\n```js\nnot counted at all\n```\nthree")).toBe(3);
    expect(proseWordCount("")).toBe(0);
  });
});
