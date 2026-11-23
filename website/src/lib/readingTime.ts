// How long a docs page takes to read, measured from its Markdown/MDX source. Two things use the
// number: the "N min read" line under the title of a guide (docusaurus.config.ts computes it,
// src/theme/MDXComponents/Heading shows it) and the page budgets (readingBudget.test.ts).
//
// The method is the one of the docs' reading analysis, applied to the source instead of the built
// page:
// - prose and table words at 200 a minute: headings, list items, cells, a link's text, the words
//   of `inline code`;
// - code at 2 seconds a line for the first 12 lines of a block, half a second a line after that: a
//   short block is read, a long one is scanned;
// - 6 seconds for each figure: an image, a component that draws (FIGURES), a Mermaid diagram, whose
//   labels are words too;
// - what the reader opens on demand is left out, as it is on the page: the inside of a <details>
//   (its <summary> counts) and, in a set of tabs, every tab but the one shown first.
// Front matter, MDX imports and exports, comments, `{expressions}` and tags are not text; what a
// tag wraps is. What a component is given as a prop (a card's title, a terminal's output) is not
// counted: the result is an estimate, a little under the built page's.
// Build-time only (the site config and `npm test`): pure functions, no dependency.
import { dropEsm } from "./llmsFull.ts";

/**
 * The guides and the essays, by doc id: the pages that show "N min read" under their title. A
 * landing page, an install page or a reference page is not read top to bottom: no total there.
 */
export const READING_TIME_PAGES = [
  "why",
  "how-it-works",
  "vision",
  "usage/coaching",
  "usage/courses",
  "usage/sharing",
  "usage/web-ui",
];

/** What the pages get from the `devcoach-reading-time` plugin: whole minutes by doc id. */
export type ReadingTimes = Record<string, number>;

const WORDS_PER_MINUTE = 200;
/** A block is read line by line up to here, then scanned. */
const LINES_READ = 12;
const SECONDS_PER_LINE = 2;
const SECONDS_PER_SCANNED_LINE = 0.5;
const SECONDS_PER_FIGURE = 6;

/**
 * The components that draw something to look at: a screenshot, a clip, a terminal, a diagram. Each
 * use is one figure. A component that only wraps text (Cards, Chat, Matrix, Timeline) is not here:
 * its words are counted. A new drawing component belongs in this list; until it is, it counts as
 * nothing.
 */
const FIGURES = new Set([
  "Clip",
  "DemoCourse",
  "FileTree",
  "Hero",
  "LessonLoop",
  "LogLine",
  "PacingDay",
  "Scale",
  "ShareCode",
  "Terminal",
  "ThemedShot",
  "ToolFlow",
  "Tour",
  "TwoSpeeds",
  "ValidationGap",
  "img",
  "video",
]);

/** What there is to read on a page. */
export interface PageReading {
  /** Prose and table words. */
  words: number;
  /** The number of lines of each code block. */
  codeBlocks: number[];
  /** Images, diagrams and components that draw. */
  figures: number;
}

const nothing = (): PageReading => ({ words: 0, codeBlocks: [], figures: 0 });
const add = (to: PageReading, from: PageReading) => {
  to.words += from.words;
  to.codeBlocks.push(...from.codeBlocks);
  to.figures += from.figures;
};

/** A word starts with a letter or a digit; a path, a URL or `nudge_every` is one word. */
const WORD = /[A-Za-z0-9][A-Za-z0-9'’./:_-]*/g;

/** Words in a piece of prose: no admonition marker (`:::tip`), footnote mark (`[^1]`) or entity. */
export function countWords(text: string): number {
  const clean = text
    .replace(/^[ \t]*:::+\w*/gm, " ")
    .replace(/\[\^[^\]\s]+\]:?/g, " ")
    .replace(/&#?\w+;/g, " ");
  return clean.match(WORD)?.length ?? 0;
}

interface Tag {
  name: string;
  attrs: string;
  closing: boolean;
  selfClosing: boolean;
  end: number;
}

/**
 * Reads the tag that starts at `s[start] === "<"`, across lines. A `>` inside an attribute's
 * quotes or `{…}` does not end it; inside `{…}` an apostrophe is JSX text, not a quote.
 */
function readTag(s: string, start: number): Tag | null {
  const head = s.slice(start, start + 80).match(/^<(\/?)([A-Za-z][\w.-]*)/);
  if (!head) return null;
  const from = start + head[0].length;
  let depth = 0;
  let quote = "";
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "`" || (c === "'" && depth === 0)) quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) {
      const selfClosing = s[i - 1] === "/";
      return { name: head[2], attrs: s.slice(from, selfClosing ? i - 1 : i), closing: head[1] === "/", selfClosing, end: i + 1 };
    }
  }
  return null;
}

/** The end of the `{…}` that opens at `s[start]`, or -1: braces balance, strings are skipped. */
function expressionEnd(s: string, start: number): number {
  if (s.startsWith("{/*", start)) {
    const end = s.indexOf("*/}", start);
    return end === -1 ? -1 : end + 3;
  }
  let depth = 0;
  let quote = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * A part of the page that is counted apart, then kept or dropped when its tag closes: a
 * <details>, its <summary>, a set of tabs, one tab.
 */
interface Scope {
  tag: string;
  reading: PageReading;
  /** A <details open>, or the tab marked `default`. */
  shown: boolean;
  /** The tabs of a set, in order. */
  tabs: Scope[];
}

/** Tabs, and WrapTabs around the same TabItems. */
const isTabs = (name: string) => /Tabs$/.test(name);
const isScope = (name: string) => name === "details" || name === "summary" || name === "TabItem" || isTabs(name);

/** Closes the innermost scope: where its count goes is the whole of what "on demand" means. */
function close(scopes: Scope[]): void {
  const scope = scopes.pop() as Scope;
  const around = scopes[scopes.length - 1];
  if (scope.tag === "summary") {
    // The line that stays on show: it belongs to what surrounds the <details>.
    add((around.tag === "details" ? scopes[scopes.length - 2] : around).reading, scope.reading);
  } else if (scope.tag === "details") {
    if (scope.shown) add(around.reading, scope.reading);
  } else if (scope.tag === "TabItem" && isTabs(around.tag)) {
    around.tabs.push(scope);
  } else {
    // A set of tabs: what it holds itself, and the tab the page opens on.
    add(around.reading, scope.reading);
    const first = scope.tabs.find((tab) => tab.shown) ?? scope.tabs[0];
    if (first) add(around.reading, first.reading);
  }
}

/** `inline code`, which may wrap onto the next line and never runs past a blank one. */
const CODE_SPAN = /(`+)((?:.|\n(?!\s*\n))*?)\1/y;
const COMMENT = /<!--[\s\S]*?-->/y;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/y;
/** What follows a link's text: `](./page.md#anchor "title")`. */
const LINK_TARGET = /\]\((?:[^()\s]|\([^()]*\))*(?:\s+"[^"]*")?\)/y;

/** What `pattern` (a sticky one) matches at `s[start]`, or null. */
function matchAt(pattern: RegExp, s: string, start: number): RegExpExecArray | null {
  pattern.lastIndex = start;
  return pattern.exec(s);
}

/** Markdown and JSX outside code blocks: counts its words and figures, opens and closes scopes. */
function readText(text: string, scopes: Scope[]): void {
  const here = () => scopes[scopes.length - 1].reading;
  let prose = "";
  const flush = () => {
    here().words += countWords(prose);
    prose = "";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const span = c === "`" ? matchAt(CODE_SPAN, text, i) : null;
    const skipped = c === "<" ? matchAt(COMMENT, text, i) : c === "]" ? matchAt(LINK_TARGET, text, i) : null;
    const image = c === "!" ? matchAt(IMAGE, text, i) : null;
    const expression = c === "{" ? expressionEnd(text, i) : -1;
    const tag = c === "<" && !skipped ? readTag(text, i) : null;
    if (c === "\\") {
      // An escaped character is text: \{ is a brace, not an expression.
      prose += text[i + 1] ?? "";
      i += 2;
    } else if (span) {
      // `inline code`: its words count, and a tag named in it is not a tag.
      prose += ` ${span[2]} `;
      i += span[0].length;
    } else if (skipped) {
      prose += " ";
      i += skipped[0].length;
    } else if (image) {
      // A Markdown image is a figure; its alternative text is not on show.
      here().figures++;
      i += image[0].length;
    } else if (expression !== -1) {
      prose += " ";
      i = expression;
    } else if (tag) {
      flush();
      i = tag.end;
      if (tag.closing) {
        const opened = scopes.map((scope) => scope.tag).lastIndexOf(tag.name);
        while (opened > 0 && scopes.length > opened) close(scopes);
        continue;
      }
      if (FIGURES.has(tag.name)) here().figures++;
      if (!tag.selfClosing && isScope(tag.name)) {
        const shown = new RegExp(`(^|\\s)${tag.name === "details" ? "open" : "default"}(\\s|=|$)`).test(tag.attrs);
        scopes.push({ tag: tag.name, reading: nothing(), shown, tabs: [] });
      }
    } else {
      prose += c;
      i++;
    }
  }
  flush();
}

/**
 * The words a Mermaid diagram shows, read from its source: what is in "double quotes" (a
 * flowchart's labels) and, on a line without any, what follows a colon (a sequence diagram's
 * messages and notes). Its settings (an `%%{init}%%` line, a `---` config block) are not on show.
 */
function diagramWords(lines: string[]): number {
  const body = lines.join("\n").replace(/^\s*---\n[\s\S]*?\n\s*---\n/, "");
  let shown = "";
  for (const line of body.split("\n")) {
    if (/^\s*%%/.test(line)) continue;
    const quoted = [...line.matchAll(/"([^"]*)"/g)].map((label) => label[1]);
    shown += ` ${quoted.length ? quoted.join(" ") : (line.match(/:\s+(.+)$/)?.[1] ?? "")}`;
  }
  return countWords(shown.replace(/<[^>]*>/g, " "));
}

/** What a docs page (its raw Markdown/MDX) gives the reader to read. */
export function measurePage(source: string): PageReading {
  const page = nothing();
  const scopes: Scope[] = [{ tag: "", reading: page, shown: true, tabs: [] }];
  let text = "";
  let fence: { marker: string; language: string; lines: string[] } | null = null;
  for (const line of dropEsm(source.replace(/^---\n[\s\S]*?\n---\n/, "")).split("\n")) {
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})\s*(\S*)/);
    if (!fence && !marker) {
      text += `${line}\n`;
    } else if (!fence && marker) {
      readText(text, scopes);
      text = "";
      fence = { marker: marker[1], language: marker[2], lines: [] };
    } else if (fence && marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length && line.trim() === marker[1]) {
      const reading = scopes[scopes.length - 1].reading;
      if (fence.language === "mermaid") {
        reading.figures++;
        reading.words += diagramWords(fence.lines);
      } else {
        // As many lines as the page shows: a block's last blank lines are not.
        reading.codeBlocks.push(fence.lines.join("\n").trimEnd().split("\n").length);
      }
      fence = null;
    } else {
      fence?.lines.push(line);
    }
  }
  readText(text, scopes);
  while (scopes.length > 1) close(scopes); // a tag left open closes with the page
  return page;
}

/** The seconds a reading takes, by the rules at the top of this file. */
export function readingSeconds({ words, codeBlocks, figures }: PageReading): number {
  const code = codeBlocks.reduce(
    (sum, lines) => sum + Math.min(lines, LINES_READ) * SECONDS_PER_LINE + Math.max(0, lines - LINES_READ) * SECONDS_PER_SCANNED_LINE,
    0,
  );
  return (words / WORDS_PER_MINUTE) * 60 + code + figures * SECONDS_PER_FIGURE;
}

/** A page's reading time in minutes, not rounded: what the budgets compare. */
export const readingMinutes = (source: string): number => readingSeconds(measurePage(source)) / 60;

/** What the label shows: whole minutes, and never "0 min read". */
export const labelMinutes = (minutes: number): number => Math.max(1, Math.round(minutes));

/** A doc file's id, as Docusaurus names it: `usage/coaching.md` → `usage/coaching`. */
export const docId = (relPath: string): string => relPath.replace(/\\/g, "/").replace(/\.mdx?$/, "");
