// The docs site's colours stay readable: the twin of tests/theme.test.ts (the dashboard's palette)
// for website/. It reads the token values from custom.css (and the few components that keep their
// own palette), resolves var() and color-mix() the way the browser does, and holds WCAG AA for
// every text/background pair the components use, in both themes. It also fails when a stylesheet
// sets a text colour that is known to fall under AA at small sizes.
// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { darkCodeTheme, lightCodeTheme } from "../lib/codeThemes.ts";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

type Rgba = [number, number, number, number];
type Vars = Record<string, string>;

/** The custom properties of every rule whose selector is exactly `selector`, later rules winning. */
function declarations(css: string, selector: string): Vars {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Vars = {};
  let found = false;
  for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (rule[1].trim() !== selector) continue;
    found = true;
    for (const decl of rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[decl[1]] = decl[2].trim();
  }
  assert.ok(found, `no rule for ${selector}`);
  return out;
}

/** Split on the commas that are not inside parentheses. */
function args(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") depth++;
    else if (list[i] === ")") depth--;
    else if (list[i] === "," && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts;
}

/** A CSS colour as the browser computes it: hex, rgb()/rgba(), transparent, var(), color-mix(in srgb). */
function color(value: string, vars: Vars, seen: string[] = []): Rgba {
  const v = value.trim();
  const call = v.match(/^([a-z-]+)\(([\s\S]*)\)$/);
  if (v === "transparent") return [0, 0, 0, 0];
  if (v.startsWith("#")) {
    const h = v.slice(1);
    const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
    const n = [0, 2, 4, 6].map((i) => Number.parseInt(full.slice(i, i + 2) || "ff", 16));
    return [n[0], n[1], n[2], n[3] / 255];
  }
  assert.ok(call, `cannot read the colour ${v}`);
  const [name, inner] = [call[1], call[2]];
  if (name === "var") {
    const [ref, fallback] = args(inner);
    assert.ok(!seen.includes(ref), `var() cycle through ${ref}`);
    const next = vars[ref] ?? fallback;
    assert.ok(next !== undefined, `${ref} is not defined`);
    return color(next, vars, [...seen, ref]);
  }
  if (name === "rgb" || name === "rgba") {
    const n = inner.split(/[\s,/]+/).filter(Boolean).map(Number);
    return [n[0], n[1], n[2], n[3] ?? 1];
  }
  if (name === "color-mix") {
    const [space, a, b] = args(inner);
    assert.equal(space, "in srgb", `color-mix space in ${v}`);
    const part = (s: string) => {
      const m = s.match(/^(.*?)\s+([\d.]+)%$/);
      return m ? { c: color(m[1], vars, seen), p: Number(m[2]) / 100 } : { c: color(s, vars, seen), p: undefined };
    };
    const [x, y] = [part(a), part(b)];
    const p = x.p ?? (y.p === undefined ? 0.5 : 1 - y.p);
    // Premultiplied interpolation, as the browser does it: transparent adds no colour, only alpha.
    const alpha = x.c[3] * p + y.c[3] * (1 - p);
    if (!alpha) return [0, 0, 0, 0];
    const ch = (i: number) => (x.c[i] * x.c[3] * p + y.c[i] * y.c[3] * (1 - p)) / alpha;
    return [ch(0), ch(1), ch(2), alpha];
  }
  throw new Error(`cannot read the colour ${v}`);
}

/** `top` painted over `bottom` (which ends up opaque: the page is). */
const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
};

const luminance = ([r, g, b]: Rgba): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: Rgba, b: Rgba): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Contrast of `fg` on `bg` (each a colour or a token), `bg` laid on the page and `fg` on `bg`. */
function ratio(fg: string, bg: string, vars: Vars): number {
  const page = color("var(--dc-page-bg)", vars);
  const back = over(color(bg, vars), page);
  return contrast(over(color(fg, vars), back), back);
}
/** A token name (`--x`) as `var(--x)`; anything else is already a colour expression. */
const tok = (name: string) => (name.startsWith("--") ? `var(${name})` : name);

const css = read("css", "custom.css");
const LIGHT = declarations(css, ":root");
const THEMES: [string, Vars][] = [
  ["light", LIGHT],
  ["dark", { ...LIGHT, ...declarations(css, 'html[data-theme="dark"]') }],
];

// Text pairs: [text token, the backgrounds it is used on, where]. Every one needs 4.5:1.
const CURRENT_STEP = "color-mix(in srgb, var(--devcoach-accent) 16%, var(--dc-course-canvas))";
const TEXT: [string, string[], string][] = [
  [
    "--dc-accent-text",
    ["--dc-page-bg", "--dc-surface", "--dc-course-canvas", "--ifm-color-primary-contrast-background"],
    "teal text: card labels, the coach's name in a chat, step numbers, the wordmark, the share page's topic and TL;DR",
  ],
  [
    "--dc-text-muted",
    ["--dc-page-bg", "--dc-surface", "--dc-course-canvas", CURRENT_STEP],
    "secondary text: eyebrows, speakers, a course step's kind (also on the current step), panel titles",
  ],
  ["--ifm-color-primary", ["--dc-page-bg", "--dc-surface"], "links"],
  ["--dc-on-primary", ["--ifm-color-primary"], "text on a primary fill: a pressed button, the picked choice"],
  ["--dc-ok", ["--dc-surface", "--dc-ok-soft"], "the share page's junior chip, 'dashboard running'"],
  ["--dc-warn", ["--dc-surface", "--dc-warn-soft", "--dc-page-bg"], "the mid chip, the tour's 'did not start' note"],
  ["--dc-danger", ["--dc-surface", "--dc-danger-soft"], "the senior chip, the share page's error box"],
  ["--dc-term-fg", ["--dc-term-bg", "--dc-term-bar"], "terminal text"],
  ["--dc-term-strong", ["--dc-term-bg", "--dc-term-bar"], "terminal bold text, the typed prompt"],
  ["--dc-term-dim", ["--dc-term-bg", "--dc-term-bar"], "terminal dim text, the title bars"],
  ["--dc-term-accent", ["--dc-term-bg", "--dc-term-bar"], "the lesson card's rules, Terminal's cyan"],
  ["--dc-term-ok", ["--dc-term-bg"], "the tool bullet"],
  ["--dc-term-code", ["--dc-term-code-bg"], "code in the terminal lesson card"],
];

// Non-text pairs (WCAG 1.4.11, 3:1): focus rings, the selected tab's border, a hovered card; and
// display type at 24px and up (the hero's "Learn"), which needs 3:1 too.
const NON_TEXT: [string, string[]][] = [["--devcoach-accent", ["--dc-page-bg", "--dc-surface", "--dc-course-canvas"]]];

for (const [mode, vars] of THEMES) {
  describe(`site tokens, ${mode} theme (src/css/custom.css)`, () => {
    for (const [fg, backs, where] of TEXT) {
      for (const bg of backs) {
        test(`${fg} on ${bg} reads at 4.5:1 (${where})`, () => {
          const r = ratio(tok(fg), tok(bg), vars);
          assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}:1`);
        });
      }
    }
    for (const [fg, backs] of NON_TEXT) {
      for (const bg of backs) {
        test(`${fg} on ${bg} reaches 3:1 (focus rings, borders, display type)`, () => {
          const r = ratio(tok(fg), tok(bg), vars);
          assert.ok(r >= 3, `${fg} on ${bg}: ${r.toFixed(2)}:1`);
        });
      }
    }
  });
}

describe("component palettes", () => {
  test("Terminal: every ANSI colour, plain and dim, reads on the terminal canvas", () => {
    const module = read("components", "Terminal", "styles.module.css");
    for (const [mode, vars] of THEMES) {
      const all = { ...vars, ...declarations(module, ".window") };
      const ansi = Object.keys(all).filter((k) => k.startsWith("--ansi-"));
      assert.ok(ansi.length >= 16, "the 16 ANSI colours");
      for (const name of ansi) {
        // Dim mixes a colour toward the canvas; black and bright black are already grey and take
        // the dim grey instead (`.dim.black, .dim.brightBlack` in the module).
        const grey = name === "--ansi-black" || name === "--ansi-bright-black";
        const dim = grey ? "var(--term-dim)" : `color-mix(in srgb, ${tok(name)} 78%, var(--term-bg))`;
        for (const shade of [tok(name), dim]) {
          const r = ratio(shade, "var(--term-bg)", all);
          assert.ok(r >= 4.5, `${mode}: ${shade} on --term-bg: ${r.toFixed(2)}:1`);
        }
      }
      for (const name of ["--term-fg", "--term-dim"]) {
        const r = ratio(tok(name), "var(--term-bar)", all);
        assert.ok(r >= 4.5, `${mode}: ${name} on the bar: ${r.toFixed(2)}:1`);
      }
    }
  });

  test("Scale: band labels read at 4.5:1 and bars reach 3:1 on the box, in both themes", () => {
    const module = read("components", "Scale", "styles.module.css");
    for (const tone of ["low", "mid", "high"]) {
      for (const [mode, vars] of THEMES) {
        const own = declarations(module, `.${tone}`);
        const all = { ...vars, ...own, ...(mode === "dark" ? declarations(module, `:global([data-theme="dark"]) .${tone}`) : {}) };
        const text = ratio("var(--tone-text)", "var(--dc-surface)", all);
        const fill = ratio("var(--tone-fill)", "var(--dc-surface)", all);
        assert.ok(text >= 4.5, `${mode} ${tone} label: ${text.toFixed(2)}:1`);
        assert.ok(fill >= 3, `${mode} ${tone} bar: ${fill.toFixed(2)}:1`);
      }
    }
  });

  test("code blocks: every token colour reads on its theme's background", () => {
    for (const theme of [lightCodeTheme, darkCodeTheme]) {
      const bg = theme.plain.backgroundColor as string;
      for (const entry of [{ types: ["plain"], style: theme.plain }, ...theme.styles]) {
        const fg = entry.style.color as string | undefined;
        if (!fg) continue;
        const r = ratio(fg, bg, LIGHT);
        assert.ok(r >= 4.5, `${entry.types.join(",")} ${fg} on ${bg}: ${r.toFixed(2)}:1`);
      }
    }
  });
});

// Colours that fall under AA as small text, by name: emphasis-600 is 3.1:1 on white, emphasis-500
// 2.0:1, and the light --devcoach-accent 3.7:1. A `color:` set to one of them is a regression; the
// one exception is display type, marked on its line with the words "display type".
describe("no stylesheet sets a known-failing text colour", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  };
  walk(src);
  for (const file of files) {
    test(relative(src, file), () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const bad = lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /(^|[\s;{])color:\s*var\(--(ifm-color-emphasis-[56]00|devcoach-accent)\)/.test(line))
        .filter(({ line }) => !line.includes("display type"));
      assert.deepEqual(
        bad.map(({ line, n }) => `${n}: ${line.trim()}`),
        [],
        "use --dc-text-muted or --dc-accent-text",
      );
    });
  }
});
