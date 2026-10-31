// Lesson markdown → terminal lines, for `devcoach lesson`. Every byte of the lesson goes through
// sanitizeForTerminal first. A link written in a lesson prints as `text (url)` and never becomes a
// terminal hyperlink: only the URLs the CLI builds itself do, through trustedLink.
import { c, displayWidth, type Format, paintAll, rule, sanitizeForTerminal } from "./term";

/** A run of text and its styles. A `nowrap` run (inline code, a URL) never breaks across lines. */
export interface Piece {
  text: string;
  formats: readonly Format[];
  nowrap?: boolean;
}

/** What the wrapper never breaks: pieces glued together, after a space or not. */
export interface Word {
  pieces: Piece[];
  spaceBefore: boolean;
  /** Printed before the word unless it starts a line: a phrase's `· ` separator. */
  lead?: Piece[];
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const FORMAT_ORDER: readonly Format[] = [
  "bold",
  "dim",
  "italic",
  "strikethrough",
  "underline",
  "cyan",
  "green",
  "magenta",
  "red",
  "yellow",
];
const formatKey = (formats: readonly Format[]): string => formats.join("+");
const ordered = (formats: Iterable<Format>): Format[] => {
  const set = new Set(formats);
  return FORMAT_ORDER.filter((f) => set.has(f));
};

// ── Inline: `code`, **bold**, *italic* / _italic_, ~~strike~~, [text](url), <url>, \escapes ──

const SPECIAL_RE = /[\\`*_~[!<]/g;
const ASCII_PUNCT_RE = /[!-/:-@[-`{-~]/;
const SPACE_RE = /\s/;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const AUTOLINK_RE = /<([a-z][a-z0-9+.-]{1,31}:[^\s<>]+)>/iy;
const LINK_TITLE_RE = /\s+"[^"]*"$/;
const MAX_URL_LENGTH = 2048;
const EMPHASIS: Record<string, Format[]> = {
  "*1": ["italic"],
  _1: ["italic"],
  "*2": ["bold"],
  _2: ["bold"],
  "*3": ["bold", "italic"],
  _3: ["bold", "italic"],
  "~2": ["strikethrough"],
};

interface Delimiter {
  key: string;
  canOpen: boolean;
  canClose: boolean;
  /** Index of the matching delimiter token, once paired. */
  match?: number;
}
interface Token extends Piece {
  delimiter?: Delimiter;
}

const runEnd = (s: string, i: number): number => {
  let j = i;
  while (s[j] === s[i]) j++;
  return j;
};

/** Where the closing run of exactly `n` backticks starts, or -1. */
function closingBackticks(s: string, from: number, n: number): number {
  for (let k = s.indexOf("`", from); k !== -1; k = s.indexOf("`", runEnd(s, k))) {
    if (runEnd(s, k) - k === n) return k;
  }
  return -1;
}

/** The `)` that closes the `(` at `open`, counting nested parentheses; -1 past the URL cap. */
function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let k = open; k < s.length && k - open <= MAX_URL_LENGTH; k++) {
    if (s[k] === "(") depth++;
    else if (s[k] === ")" && --depth === 0) return k;
  }
  return -1;
}

/** A link's visible part: its own words, then the URL in parentheses (never a hyperlink). */
function linkTokens(label: string, url: string): Token[] {
  const shown = label.trim();
  if (!shown || shown === url) return url ? [{ text: url, formats: [], nowrap: true }] : [];
  const text = tokenize(shown);
  return url
    ? [...text, { text: " ", formats: [] }, { text: `(${url})`, formats: ["dim"], nowrap: true }]
    : text;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let text = "";
  const flush = (): void => {
    if (text) tokens.push({ text, formats: [] });
    text = "";
  };
  const push = (...t: Token[]): void => {
    flush();
    tokens.push(...t);
  };
  let nextBracket = -1; // cached: the first "]" at or after the current position (-2: none left)
  let i = 0;
  while (i < src.length) {
    SPECIAL_RE.lastIndex = i;
    const found = SPECIAL_RE.exec(src);
    if (!found) break;
    text += src.slice(i, found.index);
    i = found.index;
    const ch = src[i] as string;
    if (ch === "\\") {
      const next = src[i + 1];
      const escaped = next !== undefined && ASCII_PUNCT_RE.test(next);
      text += escaped ? next : ch;
      i += escaped ? 2 : 1;
      continue;
    }
    if (ch === "`") {
      const open = runEnd(src, i);
      const close = closingBackticks(src, open, open - i);
      if (close === -1) {
        text += src.slice(i, open);
        i = open;
        continue;
      }
      let code = src.slice(open, close);
      if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ")) code = code.slice(1, -1);
      push({ text: code, formats: ["cyan"], nowrap: true });
      i = close + (open - i);
      continue;
    }
    if (ch === "*" || ch === "_" || ch === "~") {
      const end = runEnd(src, i);
      const key = `${ch}${end - i}`;
      const prev = src[i - 1];
      const next = src[end];
      // An opener needs a non-space after it (so `2 * 3` keeps its stars), a closer one before
      // it; `_` never opens or closes inside a word (snake_case stays as written).
      let canOpen = next !== undefined && !SPACE_RE.test(next);
      let canClose = prev !== undefined && !SPACE_RE.test(prev);
      if (ch === "_") {
        canOpen &&= prev === undefined || !WORD_CHAR_RE.test(prev);
        canClose &&= next === undefined || !WORD_CHAR_RE.test(next);
      }
      if (EMPHASIS[key] && (canOpen || canClose)) {
        push({ text: src.slice(i, end), formats: [], delimiter: { key, canOpen, canClose } });
      } else {
        text += src.slice(i, end);
      }
      i = end;
      continue;
    }
    if (ch === "[" || (ch === "!" && src[i + 1] === "[")) {
      const open = ch === "[" ? i : i + 1;
      if (nextBracket !== -2 && nextBracket <= open) {
        nextBracket = src.indexOf("]", open + 1);
        if (nextBracket === -1) nextBracket = -2;
      }
      const end =
        nextBracket >= 0 && src[nextBracket + 1] === "(" ? closingParen(src, nextBracket + 1) : -1;
      if (end !== -1) {
        const raw = src
          .slice(nextBracket + 2, end)
          .trim()
          .replace(LINK_TITLE_RE, "");
        const url = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
        push(...linkTokens(src.slice(open + 1, nextBracket), url));
        i = end + 1;
        continue;
      }
    }
    if (ch === "<") {
      AUTOLINK_RE.lastIndex = i;
      const auto = AUTOLINK_RE.exec(src);
      if (auto) {
        push({ text: auto[1] as string, formats: [], nowrap: true });
        i += auto[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  text += src.slice(i);
  flush();
  return tokens;
}

/**
 * Pair emphasis delimiters, one stack per kind: each opener and closer is visited once, so even
 * thousands of stars stay linear. Styles are sets rather than nested tags, so pairs may overlap.
 */
function pairDelimiters(tokens: Token[]): void {
  const stacks = new Map<string, number[]>();
  tokens.forEach((token, k) => {
    const d = token.delimiter;
    if (!d) return;
    const stack = stacks.get(d.key) ?? [];
    const opener = d.canClose ? stack.pop() : undefined;
    if (opener !== undefined) {
      (tokens[opener]?.delimiter as Delimiter).match = k;
      d.match = opener;
    } else if (d.canOpen) {
      stack.push(k);
      stacks.set(d.key, stack);
    }
  });
}

/** Inline markdown as styled pieces; `base` styles apply to all of it (a heading's bold). */
export function inlinePieces(src: string, base: readonly Format[] = []): Piece[] {
  const tokens = tokenize(src);
  pairDelimiters(tokens);
  const active = new Map<Format, number>();
  const pieces: Piece[] = [];
  tokens.forEach((token, k) => {
    const d = token.delimiter;
    if (d?.match !== undefined) {
      const step = d.match > k ? 1 : -1;
      for (const f of EMPHASIS[d.key] ?? []) active.set(f, (active.get(f) ?? 0) + step);
      return;
    }
    const on = [...active].filter(([, n]) => n > 0).map(([f]) => f);
    const formats = ordered([...base, ...token.formats, ...on]);
    const last = pieces.at(-1);
    if (last && !last.nowrap && !token.nowrap && formatKey(last.formats) === formatKey(formats)) {
      last.text += token.text;
    } else {
      pieces.push({ text: token.text, formats, nowrap: token.nowrap });
    }
  });
  return pieces;
}

// ── Wrapping ─────────────────────────────────────────────────────────────────

const WHITESPACE_SPLIT_RE = /(\s+)/;
const WHITESPACE_ONLY_RE = /^\s+$/;

/** Pieces → words, breaking only at whitespace outside a `nowrap` piece. */
export function toWords(pieces: readonly Piece[]): Word[] {
  const words: Word[] = [];
  let current: Piece[] = [];
  let spaceBefore = false;
  const end = (): void => {
    if (!current.length) return;
    words.push({ pieces: current, spaceBefore });
    current = [];
    spaceBefore = false;
  };
  for (const piece of pieces) {
    if (piece.nowrap) {
      current.push(piece);
      continue;
    }
    for (const part of piece.text.split(WHITESPACE_SPLIT_RE)) {
      if (!part) continue;
      if (WHITESPACE_ONLY_RE.test(part)) {
        end();
        spaceBefore = true;
      } else {
        current.push({ text: part, formats: piece.formats });
      }
    }
  }
  end();
  return words;
}

const piecesWidth = (pieces: readonly Piece[]): number =>
  pieces.reduce((n, p) => n + displayWidth(p.text), 0);

/** One escape pair per run of equal style; a space between two runs of one style joins them. */
function paintLine(items: (Piece | null)[]): string {
  const resolved = items.map((item, k): Piece => {
    if (item) return item;
    const prev = items[k - 1];
    const next = items[k + 1];
    if (prev && next && formatKey(prev.formats) === formatKey(next.formats)) {
      return { text: " ", formats: prev.formats };
    }
    return { text: " ", formats: [] };
  });
  let out = "";
  let k = 0;
  while (k < resolved.length) {
    const key = formatKey((resolved[k] as Piece).formats);
    let text = "";
    let j = k;
    while (j < resolved.length && formatKey((resolved[j] as Piece).formats) === key) {
      text += (resolved[j] as Piece).text;
      j++;
    }
    out += paintAll((resolved[k] as Piece).formats, text);
    k = j;
  }
  return out;
}

/**
 * Words laid out at `width` display columns: greedy, after `first` on the first line and `rest`
 * on the others. A word wider than a whole line (a CJK sentence, a long URL) is cut by grapheme,
 * unless `cut` is false: then it runs past the width on its own line, whole — an id, a link or a
 * command to copy must survive a copy and paste.
 */
export function layoutWords(
  words: readonly Word[],
  width: number,
  first = "",
  rest = first,
  cut = true,
): string[] {
  const lines: string[] = [];
  let prefix = first;
  let items: (Piece | null)[] = [];
  let col = displayWidth(prefix);
  const newLine = (): void => {
    lines.push(prefix + paintLine(items));
    prefix = rest;
    items = [];
    col = displayWidth(prefix);
  };
  const place = (pieces: Piece[], w: number, space: boolean): void => {
    if (space && items.length) {
      items.push(null);
      col++;
    }
    items.push(...pieces);
    col += w;
  };
  for (const word of words) {
    const lead = word.lead ?? [];
    const gap = (word.spaceBefore ? 1 : 0) + piecesWidth(lead);
    if (items.length && col + gap + piecesWidth(word.pieces) > width) newLine();
    const pieces = items.length ? [...lead, ...word.pieces] : word.pieces;
    const w = piecesWidth(pieces);
    if (w <= width - col || !cut) {
      place(pieces, w, word.spaceBefore);
      continue;
    }
    let space = word.spaceBefore;
    for (const piece of pieces) {
      for (const { segment } of graphemes.segment(piece.text)) {
        const gw = displayWidth(segment);
        if (items.length && col + gw + (space ? 1 : 0) > width) newLine();
        place([{ text: segment, formats: piece.formats }], gw, space);
        space = false;
      }
    }
  }
  if (items.length || lines.length === 0) newLine();
  return lines;
}

export const wrapPieces = (
  pieces: readonly Piece[],
  width: number,
  first = "",
  rest = first,
  cut = true,
): string[] => layoutWords(toWords(pieces), width, first, rest, cut);

const SEPARATOR: Piece = { text: "· ", formats: ["dim"] };

/**
 * Phrases joined by a dim ` · `. A phrase never breaks: a long line moves whole phrases down, and
 * a phrase that starts a line drops its separator.
 */
export function phraseWords(phrases: readonly Piece[][]): Word[] {
  return phrases
    .filter((p) => p.length)
    .map((pieces, k) => ({ pieces, spaceBefore: k > 0, lead: k ? [SEPARATOR] : [] }));
}

// ── Code ─────────────────────────────────────────────────────────────────────

const TAB_STOP = 4;
const expandTabs = (line: string): string => {
  let out = "";
  for (const ch of line) out += ch === "\t" ? " ".repeat(TAB_STOP - (out.length % TAB_STOP)) : ch;
  return out;
};

/** Where to cut `s` to fit `avail` columns: after the last space, or mid-token if there is none. */
function codeBreak(s: string, avail: number): { end: number; next: number } {
  let width = 0;
  let lastSpace = -1;
  let seenText = false;
  for (const { segment, index } of graphemes.segment(s)) {
    const w = displayWidth(segment);
    if (width + w > avail) {
      if (lastSpace > 0) {
        let next = lastSpace;
        while (s[next] === " ") next++;
        return { end: lastSpace, next };
      }
      const cut = index > 0 ? index : segment.length;
      return { end: cut, next: cut };
    }
    if (segment === " " && seenText) lastSpace = index;
    else if (segment !== " ") seenText = true;
    width += w;
  }
  return { end: s.length, next: s.length };
}

/**
 * One line of a fence in its `│` gutter. Code is never re-flowed: a line wider than the frame
 * continues under `↳`, cut at a space so no word is split (a single token longer than the line
 * is the only thing ever cut).
 */
export function codeLines(line: string, width: number): string[] {
  const avail = Math.max(1, width - 2);
  const chunks: string[] = [];
  let rest = expandTabs(line).trimEnd();
  while (displayWidth(rest) > avail) {
    const { end, next } = codeBreak(rest, avail);
    chunks.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(next);
  }
  chunks.push(rest);
  return chunks.map((chunk, k) => `${c.dim(k ? "↳" : "│")}${chunk ? ` ${chunk}` : ""}`);
}

// ── Blocks ───────────────────────────────────────────────────────────────────

const FENCE_RE = /^( *)(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:\s|$)/;
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)]) +(\S.*)$/;
const RAW_RE = /^ {0,3}(?:[|>]|<!--|<\/?[a-z][a-z0-9-]*(?:[\s/>]|$))/i;
const BLANK_RE = /^\s*$/;
const BULLET_RE = /^[-*+]$/;
const LEADING_TABS_RE = /^\t+/;

function isThematicBreak(line: string): boolean {
  const t = line.replace(/\s/g, "");
  return t.length >= 3 && /^(?:-+|\*+|_+)$/.test(t) && !line.startsWith("    ");
}

const startsBlock = (line: string): boolean =>
  FENCE_RE.test(line) ||
  HEADING_RE.test(line) ||
  LIST_RE.test(line) ||
  RAW_RE.test(line) ||
  isThematicBreak(line);

interface Block {
  lines: string[];
  /** A blank line separates it from the block before, whatever the source said. */
  spaced: boolean;
  /** The source had a blank line before it. */
  blankBefore: boolean;
}

interface Fence {
  char: string;
  length: number;
  lang: string;
  /** The opener's indentation, taken off every code line (a fence inside a list item). */
  indent: number;
}

const MAX_LANG_LENGTH = 24;

function openFence(line: string): Fence | null {
  const m = FENCE_RE.exec(line);
  if (!m) return null;
  const marks = m[2] as string;
  const info = (m[3] as string).trim();
  if (marks.startsWith("`") && info.includes("`")) return null;
  const lang = (info.split(/\s+/)[0] ?? "").slice(0, MAX_LANG_LENGTH);
  return { char: marks.charAt(0), length: marks.length, lang, indent: (m[1] as string).length };
}

const closesFence = (line: string, fence: Fence): boolean => {
  const t = line.trim();
  return t.length >= fence.length && t === fence.char.repeat(t.length);
};

function renderFence(fence: Fence, code: string[], width: number): string[] {
  const unindent = (l: string): string => l.slice(Math.min(fence.indent, l.search(/\S|$/)));
  return [
    c.dim(rule(fence.lang || "code", width)),
    ...code.flatMap((l) => codeLines(unindent(l), width)),
  ];
}

/** A paragraph that opens with 💡: the label after it in bold yellow, the rest hanging under it. */
function renderTip(text: string, width: number): string[] {
  const pieces = inlinePieces(text.replace(/^💡\s*/u, ""));
  const label = pieces[0];
  if (
    label?.text.trimEnd().endsWith(":") &&
    label.formats.some((f) => f === "bold" || f === "italic")
  ) {
    pieces[0] = { ...label, formats: ["bold", "yellow"] };
  }
  return wrapPieces(pieces, width, "💡 ", "   ");
}

interface ListLevel {
  source: number;
  indent: number;
  marker: number;
}

/** A run of list items: `•` for bullets, the number as written, a hanging indent per level. */
function renderList(
  lines: string[],
  start: number,
  width: number,
): { out: string[]; next: number } {
  const out: string[] = [];
  const levels: ListLevel[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i] as string);
    if (!m || isThematicBreak(lines[i] as string)) break;
    const source = (m[1] as string).length;
    while (levels.length && source < (levels.at(-1) as ListLevel).source) levels.pop();
    const top = levels.at(-1);
    const indent = !top ? 0 : source === top.source ? top.indent : top.indent + top.marker + 1;
    if (top && source === top.source) levels.pop();
    const marker = BULLET_RE.test(m[2] as string) ? "•" : (m[2] as string);
    levels.push({ source, indent, marker: displayWidth(marker) });
    let text = m[3] as string;
    i++;
    // Lazy continuation: a following line that starts no block belongs to this item.
    while (
      i < lines.length &&
      !BLANK_RE.test(lines[i] as string) &&
      !startsBlock(lines[i] as string)
    ) {
      text += ` ${(lines[i] as string).trim()}`;
      i++;
    }
    const pad = " ".repeat(indent);
    out.push(
      ...wrapPieces(
        inlinePieces(text),
        width,
        `${pad}${c.dim(marker)} `,
        " ".repeat(indent + displayWidth(marker) + 1),
      ),
    );
  }
  return { out, next: i };
}

/**
 * A lesson body as terminal lines at `width` columns: paragraphs wrapped, fences under a
 * `── lang ──` caption in a `│` gutter, lists with hanging indents, the 💡 tip hanging under its
 * glyph, headings in bold. Tables, blockquotes, HTML and rules print as written.
 */
export function renderMarkdown(markdown: string, width: number): string[] {
  const lines = sanitizeForTerminal(markdown)
    .split("\n")
    .map((l) => l.replace(LEADING_TABS_RE, (t) => " ".repeat(TAB_STOP * t.length)));
  const blocks: Block[] = [];
  let blankBefore = false;
  let i = 0;
  const add = (out: string[], spaced = false): void => {
    blocks.push({ lines: out, spaced, blankBefore });
    blankBefore = false;
  };
  while (i < lines.length) {
    const line = lines[i] as string;
    if (BLANK_RE.test(line)) {
      blankBefore = true;
      i++;
      continue;
    }
    const fence = openFence(line);
    if (fence) {
      const code: string[] = [];
      for (i++; i < lines.length && !closesFence(lines[i] as string, fence); i++)
        code.push(lines[i] as string);
      i++;
      add(renderFence(fence, code, width), true);
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const text = line
        .trim()
        .slice((heading[1] as string).length)
        .replace(/\s#+$/, "")
        .trim();
      add(wrapPieces(inlinePieces(text, ["bold"]), width), true);
      i++;
      continue;
    }
    if (isThematicBreak(line) || RAW_RE.test(line)) {
      const raw: string[] = [];
      for (
        ;
        i < lines.length &&
        (RAW_RE.test(lines[i] as string) || isThematicBreak(lines[i] as string));
        i++
      ) {
        raw.push(expandTabs(lines[i] as string).trimEnd());
      }
      add(raw);
      continue;
    }
    if (LIST_RE.test(line)) {
      const list = renderList(lines, i, width);
      i = list.next;
      add(list.out);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && !BLANK_RE.test(lines[i] as string); i++) {
      if (para.length && startsBlock(lines[i] as string)) break;
      para.push((lines[i] as string).trim());
    }
    const text = para.join(" ");
    add(text.startsWith("💡") ? renderTip(text, width) : wrapPieces(inlinePieces(text), width));
  }
  return blocks.flatMap((block, k) => {
    const prev = blocks[k - 1];
    const gap = prev && (block.blankBefore || block.spaced || prev.spaced);
    return gap ? ["", ...block.lines] : block.lines;
  });
}

/** Words of prose in a lesson body, fenced code left out: what the ≤ 160-word rule counts. */
export function proseWordCount(markdown: string): number {
  let words = 0;
  let fence: Fence | null = null;
  for (const line of markdown.split("\n")) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    fence = openFence(line);
    if (!fence) words += line.split(/\s+/).filter(Boolean).length;
  }
  return words;
}
