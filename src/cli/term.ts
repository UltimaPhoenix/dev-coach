// Zero-dependency terminal styling + table rendering (replaces Rich) using node:util styleText.
import { styleText } from "node:util";
import { stripControlChars, stripControlCharsInline } from "../core/text";

/**
 * Whether stdout gets colour. `NO_COLOR` wins; then `FORCE_COLOR` forces it on (even on a pipe)
 * unless it is `0` or `false`; otherwise a TTY that is not `TERM=dumb`.
 */
export function colorEnabled(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = Boolean(process.stdout.isTTY),
): boolean {
  if (env.NO_COLOR) return false;
  const forced = env.FORCE_COLOR;
  if (forced !== undefined) return !["0", "false"].includes(forced);
  return isTTY && env.TERM !== "dumb";
}

const useColor = colorEnabled();
type Fmt = Parameters<typeof styleText>[0];
// validateStream off: the decision above is final (Node's own check lets FORCE_COLOR beat NO_COLOR).
const paint = (fmt: Fmt, s: string): string =>
  useColor ? styleText(fmt, s, { validateStream: false }) : s;

export const c = {
  green: (s: string) => paint("green", s),
  red: (s: string) => paint("red", s),
  yellow: (s: string) => paint("yellow", s),
  cyan: (s: string) => paint("cyan", s),
  magenta: (s: string) => paint("magenta", s),
  dim: (s: string) => paint("dim", s),
  bold: (s: string) => paint("bold", s),
  underline: (s: string) => paint("underline", s),
};

/** A style a run of text can carry; several combine into one escape pair (`paintAll`). */
export type Format =
  | "bold"
  | "dim"
  | "italic"
  | "strikethrough"
  | "underline"
  | "cyan"
  | "green"
  | "magenta"
  | "red"
  | "yellow";

/**
 * `s` with every format in one `styleText` call. Styles never nest: wrapping an already styled
 * string would let the inner reset (bold and dim share one) end the outer style early.
 */
export const paintAll = (formats: readonly Format[], s: string): string =>
  formats.length && s ? paint([...formats], s) : s;

export function colorize(name: "green" | "yellow" | "red", s: string): string {
  return name === "green" ? c.green(s) : name === "yellow" ? c.yellow(s) : c.red(s);
}

/**
 * Text from the database made inert before it is printed: no escape sequence, no control
 * character (see `core/text.ts`). Newlines and tabs stay. Every string a lesson, a course or a
 * sender name carries goes through this or `sanitizeLine` on its way to the terminal.
 */
export const sanitizeForTerminal = (text: string): string => stripControlChars(text);

/** `sanitizeForTerminal` for a one-line slot (a table cell, a title): breaks become one space. */
export const sanitizeLine = (text: string): string => stripControlCharsInline(text);

/**
 * OSC 8 terminal hyperlinks — the "clickable URL" escape (`ESC ] 8 ; ; url BEL text ESC ] 8 ; ; BEL`).
 * Emitted only for terminals known to render it: unknown ones may print the raw bytes, and every
 * terminal already makes a plain http:// URL cmd/ctrl-clickable on its own. Mirrors the checks of
 * the `supports-hyperlinks` package without the dependency; Apple's Terminal.app is left out on
 * purpose (it shows OSC 8 as text). FORCE_HYPERLINK=1 overrides, NO_COLOR / a pipe disable.
 */
export function supportsHyperlinks(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = Boolean(process.stdout.isTTY),
): boolean {
  if (env.FORCE_HYPERLINK && env.FORCE_HYPERLINK !== "0") return true;
  if (!isTTY || env.NO_COLOR || env.TERM === "dumb") return false;
  const program = env.TERM_PROGRAM ?? "";
  if (["iTerm.app", "WezTerm", "vscode", "Hyper", "ghostty", "Tabby", "rio"].includes(program)) {
    return true;
  }
  if (["xterm-kitty", "alacritty", "xterm-ghostty", "wezterm"].includes(env.TERM ?? ""))
    return true;
  if (env.KITTY_WINDOW_ID || env.WT_SESSION) return true;
  if (Number(env.VTE_VERSION ?? 0) >= 5000) return true;
  if (Number(env.KONSOLE_VERSION ?? 0) >= 220000) return true;
  return false;
}

/** The longest URL `trustedLink` wraps; a longer one prints as text. */
export const MAX_LINK_URL_LENGTH = 2048;
const HTTP_URL_RE = /^https?:\/\/\S+$/;

/** A plain http(s) URL: no whitespace, no control or invisible format character, at most 2 KiB. */
const isTrustedUrl = (url: string): boolean =>
  url.length <= MAX_LINK_URL_LENGTH && HTTP_URL_RE.test(url) && stripControlChars(url) === url;

/**
 * `url` as a clickable terminal link (OSC 8) where supported, otherwise the plain text. Only for
 * a URL the CLI built itself (`http://127.0.0.1:<port>/…`): anything that is not a plain http(s)
 * URL, or is longer than `MAX_LINK_URL_LENGTH`, prints as text and never becomes a link. Text
 * from a lesson never reaches this function.
 */
export function trustedLink(url: string, text = url): string {
  const label = sanitizeLine(text);
  return isTrustedUrl(url) && supportsHyperlinks()
    ? `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`
    : label;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI/OSC escapes is intentional
const ANSI_RE = /\u001b\[[0-9;]*m|\u001b\]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const PRINTABLE_ASCII_RE = /^[\x20-\x7e]*$/;
// Zero columns: a cluster that starts with a combining mark, a format character (ZWJ, ZWSP, a
// variation selector on its own) or a control.
const ZERO_WIDTH_RE = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]/u;
// Two columns: an emoji shown as emoji (default emoji presentation, or any emoji + VS16).
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\u{fe0f}/u;
// Two columns: East Asian Wide and Fullwidth (Unicode UAX #11), by block: Hangul Jamo, CJK
// radicals to CJK compatibility, Yi, Hangul syllables, CJK compatibility ideographs, vertical and
// small forms, fullwidth forms, Tangut, Kana supplements, enclosed ideographs, CJK planes 2 and 3.
const WIDE_RE =
  /^[\u{1100}-\u{115f}\u{2329}\u{232a}\u{2e80}-\u{303e}\u{3041}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{a000}-\u{a4cf}\u{a960}-\u{a97f}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe10}-\u{fe19}\u{fe30}-\u{fe6f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{16fe0}-\u{16fe4}\u{17000}-\u{18aff}\u{1b000}-\u{1b2ff}\u{1f200}-\u{1f2ff}\u{20000}-\u{2fffd}\u{30000}-\u{3fffd}]/u;

function graphemeWidth(cluster: string): number {
  if (ZERO_WIDTH_RE.test(cluster)) return 0;
  return EMOJI_RE.test(cluster) || WIDE_RE.test(cluster) ? 2 : 1;
}

/**
 * Columns `s` takes in a terminal, per grapheme: wide CJK and emoji count 2 (✅ ✨ ❌ 💡, a ZWJ
 * family, a flag), combining marks and zero-width characters 0, everything else 1 (★ ✓ ─ █).
 * Our own colour and link escapes count nothing.
 */
export function displayWidth(s: string): number {
  const plain = stripAnsi(s);
  if (PRINTABLE_ASCII_RE.test(plain)) return plain.length;
  let width = 0;
  for (const { segment } of graphemes.segment(plain)) width += graphemeWidth(segment);
  return width;
}

/** `s` padded with spaces to `w` display columns. */
export function pad(s: string, w: number, justify: "left" | "right" | "center" = "left"): string {
  const gap = Math.max(0, w - displayWidth(s));
  if (justify === "right") return " ".repeat(gap) + s;
  if (justify === "center") {
    const l = Math.floor(gap / 2);
    return " ".repeat(l) + s + " ".repeat(gap - l);
  }
  return s + " ".repeat(gap);
}

export interface Column {
  header: string;
  justify?: "left" | "right" | "center";
}

/** Render a rounded-box table (approximates rich box.ROUNDED). */
export function renderTable(
  title: string | undefined,
  columns: Column[],
  rows: string[][],
  showHeader = true,
): string {
  const widths = columns.map((col, i) =>
    Math.max(
      showHeader ? displayWidth(col.header) : 0,
      ...rows.map((r) => displayWidth(r[i] ?? "")),
    ),
  );
  const sep = (l: string, m: string, r: string) =>
    l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const rowLine = (cells: string[]) =>
    `│${cells
      .map((cell, i) => ` ${pad(cell ?? "", widths[i] ?? 0, columns[i]?.justify ?? "left")} `)
      .join("│")}│`;

  const total = widths.reduce((a, w) => a + w + 3, 1);
  const out: string[] = [];
  if (title) out.push(pad(c.bold(title), total, "center"));
  out.push(sep("╭", "┬", "╮"));
  if (showHeader) {
    out.push(rowLine(columns.map((col) => c.bold(col.header))), sep("├", "┼", "┤"));
  }
  for (const r of rows) out.push(rowLine(r));
  out.push(sep("╰", "┴", "╯"));
  return out.join("\n");
}

/** The widest a reading layout grows on a wide terminal, unless a width is given explicitly. */
export const MAX_READING_WIDTH = 100;

/** Columns to lay out for: an explicit width, else the terminal's, else `COLUMNS`, else 80. */
export function termWidth(
  explicit?: number,
  stdout: { columns?: number } = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const candidates = [explicit, stdout.columns, Number.parseInt(env.COLUMNS ?? "", 10)];
  return candidates.find((n) => n !== undefined && Number.isInteger(n) && n > 0) ?? 80;
}

/** `termWidth`, capped at `MAX_READING_WIDTH` unless the width was given explicitly. */
export const readingWidth = (explicit?: number): number =>
  explicit === undefined ? Math.min(termWidth(), MAX_READING_WIDTH) : termWidth(explicit);

/** A left-anchored rule `── text ───…` (a plain line without text), `total` columns wide. */
export function rule(text = "", total = readingWidth()): string {
  if (!text) return "─".repeat(total);
  const lead = `── ${text} `;
  return lead + "─".repeat(Math.max(2, total - displayWidth(lead)));
}

export const confidenceBar = (confidence: number): string => {
  const filled = Math.max(0, Math.min(10, Math.round(confidence)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
};

export const confidenceColor = (confidence: number): "green" | "yellow" | "red" =>
  confidence >= 7 ? "green" : confidence >= 4 ? "yellow" : "red";
