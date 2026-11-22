// The ANSI side of <Terminal>: real CLI output (as captured with FORCE_COLOR=1) turned into lines
// of styled runs, with no dependency. SGR colours and attributes are kept (the 8 standard and 8
// bright foregrounds, bold, dim, underline, their resets); every other escape sequence is removed
// whole (cursor moves, 256-colour and true-colour codes, backgrounds, window titles, OSC 8
// hyperlinks, whose text stays), and so is every control character but the line break and tab.
// Pure, so `npm test` covers it.

export const COLORS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;
export type AnsiColor = (typeof COLORS)[number];

export interface AnsiStyle {
  fg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

/** Text that shares one style. Never contains a line break. */
export interface Run {
  text: string;
  style: AnsiStyle;
}

/** One output line: its runs, in order (an empty line has none). */
export type Line = Run[];

const ESC = "\u001b";
const BEL = "\u0007";

/** Apply one SGR parameter list (`1;32`, `38;5;208`, ``) to a style; unknown codes change nothing. */
function applySgr(style: AnsiStyle, params: string): AnsiStyle {
  // `38:5:208` (colon sub-parameters) is one parameter: it is not one we keep.
  const codes = params === "" ? [0] : params.split(";").map((p) => (p.includes(":") ? -1 : Number(p || 0)));
  let next = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 4) next.underline = true;
    else if (code === 24) delete next.underline;
    else if (code >= 30 && code <= 37) next.fg = COLORS[code - 30];
    else if (code >= 90 && code <= 97) next.fg = COLORS[code - 90 + 8];
    else if (code === 39) delete next.fg;
    else if (code === 38 || code === 48 || code === 58) {
      // Extended colour (foreground, background, underline): skip its arguments so that a `2`
      // or a `5` in them is not read as dim or blink.
      const mode = codes[i + 1];
      i += mode === 5 ? 2 : mode === 2 ? 4 : 1;
    }
  }
  return next;
}

/** Where the escape sequence that starts at `at` (an ESC) ends, and what it was. */
function readEscape(text: string, at: number): { end: number; sgr?: string } {
  const kind = text[at + 1];
  if (kind === "[") {
    // CSI: parameters and intermediates, then one final byte in @ … ~.
    let i = at + 2;
    while (i < text.length && !/[@-~]/.test(text[i])) i++;
    const body = text.slice(at + 2, i);
    return { end: i + 1, sgr: text[i] === "m" && /^[\d;:]*$/.test(body) ? body : undefined };
  }
  if (kind === "]" || kind === "P" || kind === "_" || kind === "^" || kind === "X") {
    // OSC, DCS, APC, PM, SOS: a string up to BEL (OSC only) or ST (ESC \). Unterminated: to the end.
    for (let i = at + 2; i < text.length; i++) {
      if (text[i] === BEL && kind === "]") return { end: i + 1 };
      if (text[i] === ESC && text[i + 1] === "\\") return { end: i + 2 };
    }
    return { end: text.length };
  }
  // Character-set designations take one more byte (`ESC ( B`); the rest are two bytes (`ESC 7`).
  if (kind !== undefined && "()*+-./#%".includes(kind)) return { end: at + 3 };
  return { end: at + 2 };
}

const sameStyle = (a: AnsiStyle, b: AnsiStyle) =>
  a.fg === b.fg && !a.bold === !b.bold && !a.dim === !b.dim && !a.underline === !b.underline;

// Control characters other than tab and line feed: C0 (a lone CR included), DEL and C1.
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Parse captured terminal output into lines of styled runs. */
export function parseAnsi(input: string): Line[] {
  const text = input.replace(/\r\n/g, "\n");
  const lines: Line[] = [[]];
  let style: AnsiStyle = {};
  const push = (chunk: string) => {
    const clean = chunk.replace(CONTROL_RE, "");
    clean.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (!part) return;
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && sameStyle(last.style, style)) last.text += part;
      else line.push({ text: part, style: { ...style } });
    });
  };
  let at = 0;
  while (at < text.length) {
    const next = text.indexOf(ESC, at);
    if (next === -1) {
      push(text.slice(at));
      break;
    }
    push(text.slice(at, next));
    const escape = readEscape(text, next);
    if (escape.sgr !== undefined) style = applySgr(style, escape.sgr);
    at = escape.end;
  }
  return lines;
}

/** The text of parsed lines, without any style: what a reader copies. */
export const plainText = (lines: Line[]): string =>
  lines.map((line) => line.map((run) => run.text).join("")).join("\n");

// ── Cells ─────────────────────────────────────────────────────────────────────────────────────
// A terminal gives every character one or two columns; a browser draws a ✓ or a 💡 from a
// fallback font at its own width, and a table's right border no longer lines up. So every
// character outside what monospace fonts carry (ASCII, Latin-1, box drawing, block elements) is
// drawn in a box of exactly its terminal width, counted the way the CLI counts it
// (`displayWidth` in src/cli/term.ts): wide CJK and emoji 2, combining marks 0, the rest 1.

/** A run of text drawn as is, or one character drawn `width` columns wide. */
export type Piece = string | { text: string; width: 0 | 1 | 2 };

const SAFE_RE = /^[\u0009 -~ -ÿ─-▟]$/;
const ZERO_WIDTH_RE = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]/u;
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\u{fe0f}/u;
const WIDE_RE =
  /^[\u{1100}-\u{115f}\u{2329}\u{232a}\u{2e80}-\u{303e}\u{3041}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{a000}-\u{a4cf}\u{a960}-\u{a97f}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe10}-\u{fe19}\u{fe30}-\u{fe6f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{16fe0}-\u{16fe4}\u{17000}-\u{18aff}\u{1b000}-\u{1b2ff}\u{1f200}-\u{1f2ff}\u{20000}-\u{2fffd}\u{30000}-\u{3fffd}]/u;

let segmenter: Intl.Segmenter | null | undefined;
function graphemes(text: string): string[] {
  if (segmenter === undefined)
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

/** Split a run's text into plain stretches and fixed-width characters. */
export function cells(text: string): Piece[] {
  if (/^[\u0009 -~]*$/.test(text)) return text ? [text] : [];
  const out: Piece[] = [];
  let plain = "";
  for (const cluster of graphemes(text)) {
    if (SAFE_RE.test(cluster)) {
      plain += cluster;
      continue;
    }
    if (plain) out.push(plain);
    plain = "";
    const width = ZERO_WIDTH_RE.test(cluster) ? 0 : EMOJI_RE.test(cluster) || WIDE_RE.test(cluster) ? 2 : 1;
    out.push({ text: cluster, width });
  }
  if (plain) out.push(plain);
  return out;
}
