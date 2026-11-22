// Build-time only (docusaurus.config.ts's llms-full plugin): one docs page's MDX source as plain
// Markdown for /llms-full.txt. What a component wraps comes through; what it draws from its props
// (a screenshot, a terminal's output, a table given as data) cannot:
// - a Card becomes its title in bold, then its text; a wrapper with a `label` or `title` (a tab, a
//   chat, a matrix) gets it as a bold line; a chat line starts with its speaker; Choices lists its
//   options with the one picked;
// - every other component tag is dropped and its children stay; MDX imports, exports and comments,
//   <Head> blocks and images are dropped;
// - links to other pages, to `#anchors` and to `/paths` become full URLs of the site.
// Code (fenced blocks and `inline` spans) is copied as it is. Node built-ins only, so `npm test`
// runs it without an install (llmsFull.test.ts).
import * as path from "node:path";

/** The route of a doc file under docs/: `install/index.md` → `install`, `index.mdx` → ``. */
export function docRoute(relPath: string): string {
  return relPath
    .replace(/\\/g, "/")
    .replace(/\.mdx?$/, "")
    .replace(/(^|\/)index$/, "");
}

/** The page's title: its front matter `title`, else its H1, else the file name. */
export function pageTitle(raw: string, relPath: string): string {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  const title = fm?.[1].match(/^title:\s*(.+?)\s*$/m);
  if (title) return title[1].replace(/^["']|["']$/g, "");
  const h1 = raw.match(/^#\s+(.+)$/m);
  return h1 ? h1[1] : path.posix.basename(relPath).replace(/\.mdx?$/, "");
}

/** The doc ids of a sidebar, in reading order (a category's own page before its items). */
export function sidebarDocIds(items: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      ids.push(item);
      continue;
    }
    const it = item as { type?: string; id?: string; link?: { type?: string; id?: string }; items?: unknown[] };
    if (it.type === "doc" && it.id) ids.push(it.id);
    if (it.type === "category") {
      if (it.link?.type === "doc" && it.link.id) ids.push(it.link.id);
      ids.push(...sidebarDocIds(it.items ?? []));
    }
  }
  return ids;
}

/** The hand-written summary of llms.txt: everything between its H1 and its first `##` section. */
export function llmsIntro(llmsTxt: string): string {
  const afterTitle = llmsTxt.replace(/^#\s.*\n/, "");
  const end = afterTitle.search(/^## /m);
  return (end === -1 ? afterTitle : afterTitle.slice(0, end)).trim();
}

/** The chat's speakers, as the Chat component names them. */
const SPEAKER: Record<string, string> = { you: "you", coach: "devcoach", agent: "agent" };
/** Components dropped with everything inside them. */
const DROP_WITH_CONTENT = new Set(["Head"]);

interface Tag {
  name: string;
  attrs: string;
  selfClosing: boolean;
  end: number;
}

/**
 * Reads the JSX tag that starts at `s[start] === "<"`, across lines, quotes and `{…}` included.
 * A JSX attribute string has no escapes (`root="C:\dir\"`); inside `{…}`, JSX text such as
 * `<>the extension's copy</>` is common, so an apostrophe there is not taken for a JS quote.
 */
function readTag(s: string, start: number): Tag | null {
  const name = s.slice(start + 1).match(/^[A-Z][\w.]*/)?.[0];
  if (!name) return null;
  let depth = 0;
  let quote = "";
  for (let i = start + 1 + name.length; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\" && depth > 0) i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "`" || (c === "'" && depth === 0)) quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) {
      const selfClosing = s[i - 1] === "/";
      return { name, attrs: s.slice(start + 1 + name.length, selfClosing ? i - 1 : i), selfClosing, end: i + 1 };
    }
  }
  return null;
}

const attr = (attrs: string, key: string) =>
  attrs.match(new RegExp(`(?:^|\\s)${key}=(?:"([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\})`))?.slice(1).find((v) => v !== undefined);

/** What an opening tag leaves in the Markdown. */
function openingText(tag: Tag): string {
  if (tag.name === "Card") {
    const title = attr(tag.attrs, "title");
    return title ? `\n\n**${title}**\n\n` : "";
  }
  if (tag.name === "Say") {
    const who = attr(tag.attrs, "who") ?? "";
    return `\n\n**${SPEAKER[who] ?? who}:** `;
  }
  if (tag.name === "Choices") {
    const list = tag.attrs.match(/options=\{\s*\[([\s\S]*?)\]\s*\}/)?.[1] ?? "";
    const options = [...list.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const picked = attr(tag.attrs, "picked");
    const shown = options.map((o) => (o === picked ? `**${o}** (picked)` : o));
    return options.length ? `\n\n**${SPEAKER.you}:** ${shown.join(" · ")}\n\n` : "";
  }
  if (tag.selfClosing) return "";
  const label = attr(tag.attrs, "label") ?? attr(tag.attrs, "title");
  return label ? `\n\n**${label}**\n\n` : "";
}

/** Drops a page's MDX imports and exports: a statement runs until its brackets close. */
function dropEsm(source: string): string {
  const lines = source.split("\n");
  const kept: string[] = [];
  let fence = "";
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = "";
      kept.push(line);
      continue;
    }
    if (marker) fence = marker;
    if (marker || !/^(import|export)\s/.test(line)) {
      kept.push(line);
      continue;
    }
    let depth = 0;
    let quote = "";
    for (; n < lines.length; n++) {
      const l = lines[n];
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = "";
        } else if (c === "/" && l[i + 1] === "/") break;
        else if (c === '"' || c === "'" || c === "`") quote = c;
        else if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) depth--;
      }
      if (quote !== "`") quote = ""; // only a template literal spans lines
      if (depth <= 0 && !quote) break;
    }
  }
  return kept.join("\n");
}

/** Makes a link target absolute on the site; an asset or another site's link stays as it is. */
function resolveLink(target: string, relPath: string, siteUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (target.startsWith("#")) return `${siteUrl}${docRoute(relPath)}${target}`;
  if (target.startsWith("/")) return `${siteUrl}${target.slice(1)}`;
  const [file, hash = ""] = target.split("#");
  if (/\.\w+$/.test(file) && !/\.mdx?$/.test(file)) return target; // an image, a zip, a script
  const route = docRoute(path.posix.normalize(path.posix.join(path.posix.dirname(relPath), file)));
  return `${siteUrl}${route}${hash ? `#${hash}` : ""}`;
}

function rewriteProse(prose: string, relPath: string, siteUrl: string): string {
  return prose
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (_, target: string, title: string) =>
      `](${resolveLink(target, relPath, siteUrl)}${title})`,
    );
}

/** One docs page (its raw MDX) as Markdown, without its front matter and its H1. */
export function mdxToMarkdown(raw: string, relPath: string, siteUrl: string): string {
  const s = dropEsm(raw.replace(/^---\n[\s\S]*?\n---\n/, ""));
  const out: string[] = [];
  let prose = "";
  const flush = () => {
    out.push(rewriteProse(prose, relPath, siteUrl));
    prose = "";
  };
  const verbatim = (text: string) => {
    flush();
    out.push(text);
  };
  const open: string[] = [];
  let fence: { marker: string; indent: number } | null = null;
  let lineStart = true;
  let i = 0;
  while (i < s.length) {
    if (lineStart) {
      const eol = s.indexOf("\n", i);
      const next = eol === -1 ? s.length : eol + 1;
      const line = s.slice(i, eol === -1 ? s.length : eol);
      const indent = line.match(/^[ \t]*/)?.[0].length ?? 0;
      const marker = line.match(/^[ \t]*(`{3,}|~{3,})/)?.[1];
      if (fence) {
        verbatim(`${line.slice(Math.min(fence.indent, indent))}\n`);
        if (marker && marker[0] === fence.marker[0] && marker.length >= fence.marker.length && line.trim() === marker) {
          fence = null;
        }
        i = next;
        continue;
      }
      if (marker) {
        // In a component, the fence comes out to the margin with its markdown; in a list item, it stays.
        fence = { marker, indent: open.length ? indent : 0 };
        verbatim(`${line.slice(fence.indent)}\n`);
        i = next;
        continue;
      }
      // Markdown nested in a component is indented in the source; out of it, that would be code.
      if (open.length) i += indent;
      lineStart = false;
      continue;
    }
    const c = s[i];
    if (c === "\n") {
      prose += c;
      lineStart = true;
      i++;
    } else if (c === "`") {
      const run = s.slice(i).match(/^`+/)?.[0] ?? "`";
      const close = s.indexOf(run, i + run.length);
      const blank = s.indexOf("\n\n", i);
      if (close !== -1 && (blank === -1 || close < blank)) {
        verbatim(s.slice(i, close + run.length));
        i = close + run.length;
      } else {
        prose += run;
        i += run.length;
      }
    } else if (s.startsWith("{/*", i)) {
      const end = s.indexOf("*/}", i);
      i = end === -1 ? s.length : end + 3;
    } else if (c === "<" && s[i + 1] === "/" && /[A-Z]/.test(s[i + 2] ?? "")) {
      const end = s.indexOf(">", i);
      const name = s.slice(i + 2, end === -1 ? s.length : end).trim();
      const at = open.lastIndexOf(name);
      if (at !== -1) open.length = at;
      if (name === "Card" || name === "Say") prose += "\n\n";
      i = end === -1 ? s.length : end + 1;
    } else if (c === "<" && /[A-Z]/.test(s[i + 1] ?? "")) {
      const tag = readTag(s, i);
      if (!tag) {
        prose += c;
        i++;
        continue;
      }
      i = tag.end;
      if (DROP_WITH_CONTENT.has(tag.name) && !tag.selfClosing) {
        const close = s.indexOf(`</${tag.name}>`, i);
        i = close === -1 ? s.length : close + tag.name.length + 3;
        continue;
      }
      prose += openingText(tag);
      if (!tag.selfClosing) open.push(tag.name);
    } else {
      prose += c;
      i++;
    }
  }
  flush();
  return out
    .join("")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^#\s+.+\n+/, "")
    .trim();
}
