// Syntax highlighting for course documents.
//
// A course is ONE self-contained file that must read the same embedded in the dashboard, opened
// from disk and published as an artifact — no external URL can be loaded. So the highlighter is
// inlined INTO the file: the model writes a placeholder tag, devcoach fills it with the vendored
// highlight.js build (BSD-3-Clause) plus the licence text the BSD terms require to travel with
// every redistribution, a small stylesheet that maps highlight.js classes to palette tokens, and
// the call that highlights every `<pre><code>`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** What the model writes, once, in a course that shows code. */
export const HIGHLIGHTER_PLACEHOLDER = '<script data-devcoach="highlighter"></script>';
const EMPTY_PLACEHOLDER = /<script data-devcoach="highlighter">\s*<\/script>/;
// Anything but whitespace before the closing tag: the empty placeholder is not a block.
const FILLED_BLOCK = /<script data-devcoach="highlighter">\s*(?!<\/script>)\S/;

// prod: dist/<chunk>.js → ../assets · dev: src/core/highlighter.ts → ../../assets
function vendorDir(): string | null {
  for (const base of ["../assets", "../../assets"]) {
    const dir = join(here, base, "static", "vendor");
    if (existsSync(join(dir, "highlight.min.js"))) return dir;
  }
  return null;
}

/**
 * Syntax colours as tokens, light and dark, under the three selectors of the course contract.
 * `:where()` keeps their specificity at zero: a course that defines its own `--syn-*` wins
 * whatever the order of the rules. tests/theme.test.ts holds their contrast on `--code-bg`.
 */
export const SYNTAX_TOKENS = {
  light: {
    keyword: "#0033b3",
    string: "#067d17",
    comment: "#5f6672",
    number: "#1750eb",
    title: "#00627a",
    type: "#871094",
    attr: "#374151",
    meta: "#7a6a00",
  },
  dark: {
    keyword: "#cf8e6d",
    string: "#6aab73",
    comment: "#8b8f96",
    number: "#2aacb8",
    title: "#56a8f5",
    type: "#c77dbb",
    attr: "#bcbec4",
    meta: "#b3ae60",
  },
} as const;

function tokenList(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `--syn-${name}:${value}`)
    .join(";");
}

function stylesheet(): string {
  const light = tokenList(SYNTAX_TOKENS.light);
  const dark = tokenList(SYNTAX_TOKENS.dark);
  return [
    `:where(:root){${light}}`,
    `@media (prefers-color-scheme: dark){:where(:root:not([data-theme="light"])){${dark}}}`,
    `:where(:root[data-theme="dark"]){${dark}}`,
    "pre code.hljs{display:block;background:transparent;color:inherit;padding:0}",
    ".hljs-comment,.hljs-quote{color:var(--syn-comment);font-style:italic}",
    ".hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag{color:var(--syn-keyword)}",
    ".hljs-string,.hljs-regexp,.hljs-addition,.hljs-selector-attr,.hljs-selector-pseudo{color:var(--syn-string)}",
    ".hljs-number,.hljs-symbol,.hljs-bullet,.hljs-link{color:var(--syn-number)}",
    ".hljs-title,.hljs-section,.hljs-name,.hljs-selector-id,.hljs-selector-class{color:var(--syn-title)}",
    ".hljs-type,.hljs-built_in,.hljs-title.class_,.hljs-tag{color:var(--syn-type)}",
    ".hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-property,.hljs-params{color:var(--syn-attr)}",
    ".hljs-meta,.hljs-deletion,.hljs-subst{color:var(--syn-meta)}",
    ".hljs-emphasis{font-style:italic}.hljs-strong{font-weight:bold}",
  ].join("");
}

const RUN =
  ";(function(){function run(){hljs.configure({ignoreUnescapedHTML:true});" +
  'document.querySelectorAll("pre code").forEach(function(el){' +
  'if(el.dataset.highlighted||el.classList.contains("nohighlight"))return;hljs.highlightElement(el);});}' +
  'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();})();';

let cached: string | null | undefined;

/** The `<style>` + `<script>` pair that replaces the placeholder; null when the bundle is missing. */
export function highlighterBlock(): string | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const dir = vendorDir();
    if (dir === null) return cached;
    const library = readFileSync(join(dir, "highlight.min.js"), "utf8");
    const licence = readFileSync(join(dir, "highlight.LICENSE.txt"), "utf8").trim();
    // A closing script tag inside the inlined text would end the element early.
    if (/<\/script/i.test(library) || licence.includes("*/")) return cached;
    cached =
      `<style data-devcoach="highlighter">${stylesheet()}</style>\n` +
      '<script data-devcoach="highlighter">' +
      `/*\nSyntax highlighting by highlight.js, inlined by devcoach.\n\n${licence}\n*/\n` +
      `${library}\n${RUN}</script>`;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the document already carries a filled highlighter block. */
export function hasHighlighter(html: string): boolean {
  return FILLED_BLOCK.test(html);
}

/** True when the document shows code a highlighter would colour. */
export function hasCode(html: string): boolean {
  return /<pre[\s>][\s\S]*?<code[\s>]/.test(html);
}

/**
 * The document with its placeholder filled — or null when there is nothing to do: no
 * placeholder, already filled, no code to colour (a course without code never carries the
 * library), or the bundle is unavailable.
 */
export function fillHighlighter(html: string): string | null {
  if (hasHighlighter(html) || !EMPTY_PLACEHOLDER.test(html) || !hasCode(html)) return null;
  const block = highlighterBlock();
  if (block === null) return null;
  // A function replacement: the library text contains `$&`-like sequences.
  return html.replace(EMPTY_PLACEHOLDER, () => block);
}

/**
 * The inverse of `fillHighlighter`, for archives: a backup keeps ONE placeholder per course
 * instead of one copy of the library per course, and restore fills it again. Only the exact
 * block this build writes is taken out — anything else (another version, an edited block)
 * travels as it is, so stripping then filling always gives the same bytes back.
 */
export function stripHighlighter(html: string): string {
  const block = highlighterBlock();
  if (block === null || !html.includes(block)) return html;
  return html.replace(block, () => HIGHLIGHTER_PLACEHOLDER);
}
