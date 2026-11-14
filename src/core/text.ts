// Text written by someone else (a shared lesson) must never drive a terminal. One strip, used when
// a lesson is imported (so stored text is clean for every surface) and by the CLI right before it
// prints, which also covers rows stored before the import strip existed.

const TAB = 0x09;
const NEWLINE = 0x0a;
const BEL = 0x07;
const ESC = 0x1b;
const CSI_8BIT = 0x9b;
const ST_8BIT = 0x9c;
/** 8-bit openers of a control string: DCS, SOS, OSC, PM, APC. */
const STRING_OPENERS_8BIT = new Set([0x90, 0x98, 0x9d, 0x9e, 0x9f]);
/** What follows ESC to open a control string: OSC `]`, DCS `P`, SOS `X`, PM `^`, APC `_`. */
const STRING_INTRODUCERS = new Set(["]", "P", "X", "^", "_"]);
/**
 * The invisible characters that reorder or hide text: ALM, zero-width space, LRM/RLM, the line and
 * paragraph separators, bidi embeddings and overrides, bidi isolates, and the BOM. ZWJ and ZWNJ
 * stay: emoji sequences and several scripts need them, and they move nothing.
 */
const INVISIBLE_FORMAT_CHARS = new Set([
  0x061c, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066,
  0x2067, 0x2068, 0x2069, 0xfeff,
]);

const inRange = (code: number, lo: number, hi: number): boolean => code >= lo && code <= hi;

/** Every C0 control except tab and newline, DEL, every C1 control, and the invisible format chars. */
function isStrippedChar(code: number): boolean {
  if (code === TAB || code === NEWLINE) return false;
  return code < 0x20 || inRange(code, 0x7f, 0x9f) || INVISIBLE_FORMAT_CHARS.has(code);
}

function skipRange(text: string, i: number, lo: number, hi: number): number {
  let j = i;
  while (j < text.length && inRange(text.charCodeAt(j), lo, hi)) j++;
  return j;
}

/** CSI: parameter bytes, intermediate bytes, one final byte (`ESC [ 2 J`, `ESC [ ? 1049 h`). */
function csiEnd(text: string, i: number): number {
  const j = skipRange(text, skipRange(text, i, 0x30, 0x3f), 0x20, 0x2f);
  return inRange(text.charCodeAt(j), 0x40, 0x7e) ? j + 1 : j;
}

/** Any other ESC sequence: intermediate bytes, one final byte (`ESC c` resets the terminal). */
function escEnd(text: string, i: number): number {
  const j = skipRange(text, i, 0x20, 0x2f);
  return inRange(text.charCodeAt(j), 0x30, 0x7e) ? j + 1 : j;
}

/**
 * A control string (OSC 8 link, OSC 52 clipboard write, DCS…) runs to BEL or ST. Unterminated, it
 * stops at the end of its line, so a stray `ESC ]` cannot swallow the rest of a lesson.
 */
function controlStringEnd(text: string, i: number): number {
  for (let j = i; j < text.length; j++) {
    const code = text.charCodeAt(j);
    if (code === BEL || code === ST_8BIT) return j + 1;
    if (code === ESC) return text[j + 1] === "\\" ? j + 2 : j;
    if (code === NEWLINE) return j;
  }
  return text.length;
}

/** Where the escape sequence that starts at `i` (ESC, 8-bit CSI or a C1 string opener) ends. */
function sequenceEnd(text: string, i: number): number {
  const code = text.charCodeAt(i);
  if (code === CSI_8BIT) return csiEnd(text, i + 1);
  if (code !== ESC) return controlStringEnd(text, i + 1);
  const next = text[i + 1] ?? "";
  if (next === "[") return csiEnd(text, i + 2);
  if (STRING_INTRODUCERS.has(next)) return controlStringEnd(text, i + 2);
  return escEnd(text, i + 1);
}

/**
 * `text` with every escape sequence and control character removed; newlines and tabs stay.
 * ECMA-48 sequences, 7-bit (ESC …) and 8-bit (C1), go whole, so their parameters do not show up as
 * text; any control character left over (a lone BEL, CR, a bidi override) is dropped on its own.
 * Nothing a terminal could act on survives: no ESC, no C1, no BEL.
 */
export function stripControlChars(text: string): string {
  const kept: string[] = [];
  let runStart = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    const startsSequence = code === ESC || code === CSI_8BIT || STRING_OPENERS_8BIT.has(code);
    if (!startsSequence && !isStrippedChar(code)) {
      i++;
      continue;
    }
    kept.push(text.slice(runStart, i));
    i = startsSequence ? sequenceEnd(text, i) : i + 1;
    runStart = i;
  }
  kept.push(text.slice(runStart));
  return kept.join("");
}

/** `stripControlChars` for a one-line slot (a title, a name, a table cell): breaks become one space. */
export function stripControlCharsInline(text: string): string {
  return stripControlChars(text).replace(/[\t\n]+/g, " ");
}

/** The lesson fields that are prose: they keep their line breaks. Every other string is one line. */
const MULTILINE_KEYS = new Set(["summary", "body"]);

/**
 * A copy of `value` with every string inside it (nested objects and arrays included) stripped:
 * one-line everywhere except under the `summary` and `body` keys. Made for lesson-shaped records
 * (a `Lesson`, a course, a shared-lesson payload, a legacy import row); other values pass through.
 */
export function stripControlCharsDeep<T>(value: T): T {
  return stripDeep(value, "");
}

function stripDeep<T>(value: T, key: string): T {
  if (typeof value === "string") {
    return (
      MULTILINE_KEYS.has(key) ? stripControlChars(value) : stripControlCharsInline(value)
    ) as T;
  }
  if (Array.isArray(value)) return value.map((item) => stripDeep(item, key)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripDeep(v, k)])) as T;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
