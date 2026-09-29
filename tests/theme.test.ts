// The palette is decided in two places — the dashboard tokens (assets/static/style.css) and the
// token values the course skill hands to the model (assets/references/course.md). Both must stay
// readable: these tests hold the WCAG contrast floor for the pairs the UI relies on, and keep
// the two palettes in step (a course's neutrals ARE the dashboard's).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYNTAX_TOKENS } from "../src/core/highlighter";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

type Rgb = [number, number, number];

const hex = (h: string): Rgb => {
  const v = h.replace("#", "");
  const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb;
};

const luminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `--dc-gray-900: 43 45 48;` inside the block that starts at `selector {`. */
function dashboardTokens(css: string, selector: string): Record<string, Rgb> {
  const start = css.indexOf(`\n${selector} {\n  --dc-`);
  expect(start, `${selector} token block`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, Rgb> = {};
  for (const m of block.matchAll(/--dc-([a-z]+-\d+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

/** `--bg:#f9fafb; --panel:#ffffff; …` from the line of the skeleton that starts with `prefix`. */
function courseTokens(md: string, prefix: string): Record<string, Rgb> {
  const line = md.split("\n").find((l) => l.trimStart().startsWith(prefix));
  expect(line, `skeleton line ${prefix}`).toBeDefined();
  const out: Record<string, Rgb> = {};
  for (const m of (line as string).matchAll(/--([a-z-]+):(#[0-9a-fA-F]{3,6})/g))
    out[m[1]] = hex(m[2]);
  return out;
}

const WHITE: Rgb = [255, 255, 255];

describe("dashboard palette (assets/static/style.css)", () => {
  const css = read("assets", "static", "style.css");
  const light = dashboardTokens(css, ":root");
  const dark = { ...light, ...dashboardTokens(css, ".dark") };

  it("defines the full gray and accent scales, light and dark", () => {
    for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(light[`gray-${n}`], `light gray-${n}`).toBeDefined();
      expect(light[`accent-${n}`], `accent-${n}`).toBeDefined();
      expect(dashboardTokens(css, ".dark")[`gray-${n}`], `dark gray-${n}`).toBeDefined();
    }
  });

  it("dark mode is the IDE ramp: page → panel → raised → border get lighter in that order", () => {
    const l = (k: string) => luminance(dark[k]);
    expect(l("gray-950")).toBeLessThan(l("gray-900"));
    expect(l("gray-900")).toBeLessThan(l("gray-800"));
    expect(l("gray-800")).toBeLessThan(l("gray-700"));
    expect(dark["gray-950"]).toEqual(hex("#1e1f22"));
    expect(dark["gray-900"]).toEqual(hex("#2b2d30"));
  });

  it.each([
    ["dark", "gray-200", "gray-900"], // body text on a panel
    ["dark", "gray-200", "gray-950"], // body text on the page
    ["dark", "gray-400", "gray-900"], // muted text on a panel
    ["dark", "gray-400", "gray-950"],
    ["dark", "gray-500", "gray-900"], // secondary text on a panel
    ["dark", "gray-500", "gray-950"],
    ["dark", "accent-300", "gray-900"], // links, the current step
    ["dark", "accent-400", "gray-900"],
    ["light", "gray-900", "gray-50"],
    ["light", "gray-500", "gray-50"],
    ["light", "accent-600", "gray-50"],
  ])("%s: %s on %s reads at 4.5:1 or better", (mode, fg, bg) => {
    const t = mode === "dark" ? dark : light;
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("white text on the accent button and accent text on white both read", () => {
    expect(contrast(WHITE, light["accent-600"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["accent-600"], WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("borders are visible against the surfaces they separate (3:1 is not required of a hairline, 1.3:1 is)", () => {
    expect(contrast(dark["gray-700"], dark["gray-950"])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(dark["gray-700"], dark["gray-900"])).toBeGreaterThanOrEqual(1.3);
  });
});

describe("course palette (assets/references/course.md)", () => {
  const md = read("assets", "references", "course.md");
  const css = read("assets", "static", "style.css");
  const light = courseTokens(md, ":root { --bg");
  const darkMedia = courseTokens(md, "@media (prefers-color-scheme: dark)");
  const darkAttr = courseTokens(md, ':root[data-theme="dark"]');
  const NAMES = [
    "bg",
    "panel",
    "text",
    "muted",
    "line",
    "code-bg",
    "accent",
    "accent-soft",
    "on-accent",
    "ok",
    "ok-soft",
    "warn",
    "warn-soft",
    "log-bg",
    "log-text",
  ];

  it("the skeleton defines every token in all three selectors, and the two dark blocks agree", () => {
    for (const name of NAMES) {
      expect(light[name], `light --${name}`).toBeDefined();
      expect(darkAttr[name], `dark --${name}`).toBeDefined();
    }
    expect(darkMedia).toEqual(darkAttr);
  });

  it("a course's neutrals are the dashboard's", () => {
    const dl = dashboardTokens(css, ":root");
    const dd = dashboardTokens(css, ".dark");
    expect(light.bg).toEqual(dl["gray-50"]);
    expect(light.text).toEqual(dl["gray-900"]);
    expect(light.muted).toEqual(dl["gray-500"]);
    expect(light.line).toEqual(dl["gray-200"]);
    expect(darkAttr.bg).toEqual(dd["gray-950"]);
    expect(darkAttr.panel).toEqual(dd["gray-900"]);
    expect(darkAttr.text).toEqual(dd["gray-200"]);
    expect(darkAttr.muted).toEqual(dd["gray-400"]);
    expect(darkAttr.line).toEqual(dd["gray-700"]);
  });

  it.each([
    ["text", "panel"],
    ["text", "bg"],
    ["muted", "panel"],
    ["accent", "panel"],
    ["accent", "accent-soft"],
    ["on-accent", "accent"],
    ["ok", "panel"],
    ["warn", "panel"],
    ["log-text", "log-bg"],
  ])("--%s on --%s reads at 4.5:1 or better, light and dark", (fg, bg) => {
    expect(contrast(light[fg], light[bg]), "light").toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkAttr[fg], darkAttr[bg]), "dark").toBeGreaterThanOrEqual(4.5);
  });

  it("the viewer's embedded neutrals are the same values (assets/static/course-frame.js)", () => {
    const frame = read("assets", "static", "course-frame.js");
    for (const [name, mode, tokens] of [
      ["bg", "dark", darkAttr],
      ["panel", "dark", darkAttr],
      ["text", "dark", darkAttr],
      ["muted", "dark", darkAttr],
      ["line", "dark", darkAttr],
      ["bg", "light", light],
      ["panel", "light", light],
      ["text", "light", light],
      ["muted", "light", light],
      ["line", "light", light],
    ] as const) {
      const [r, g, b] = tokens[name];
      const asHex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      expect(frame, `${mode} --${name}`).toContain(`--${name}:${asHex}`);
    }
  });
});

describe("no colour typed by hand in the views", () => {
  it("src/web/views.ts holds no hex colour outside comments, and no indigo is left", () => {
    const code = read("src", "web", "views.ts")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|<!--)/.test(line) && !line.includes("teal-600/300"));
    const hexes = code.flatMap((line) => line.match(/#[0-9a-fA-F]{6}\b/g) ?? []);
    expect(hexes).toEqual([]);
    expect(read("src", "web", "views.ts")).not.toContain("indigo-");
  });
});

describe("course syntax colours (src/core/highlighter.ts)", () => {
  const md = read("assets", "references", "course.md");
  const frame = read("assets", "static", "course-frame.js");
  const embedded = (mode: string): Rgb => {
    const m = new RegExp(`\\[data-theme="${mode}"\\]\\{[^}]*--code-bg:(#[0-9a-f]{6})`).exec(
      frame.replace(/['"]\s*\+\s*['"]/g, ""),
    );
    expect(m, `embedded ${mode} --code-bg`).not.toBeNull();
    return hex((m as RegExpExecArray)[1]);
  };
  const backgrounds = {
    light: [courseTokens(md, ":root { --bg")["code-bg"], embedded("light")],
    dark: [courseTokens(md, ':root[data-theme="dark"]')["code-bg"], embedded("dark")],
  };

  it("light and dark define the same tokens", () => {
    expect(Object.keys(SYNTAX_TOKENS.dark)).toEqual(Object.keys(SYNTAX_TOKENS.light));
  });

  it.each(Object.keys(SYNTAX_TOKENS.light))(
    "--syn-%s reads at 4.5:1 or better on --code-bg, standalone and embedded",
    (name) => {
      for (const mode of ["light", "dark"] as const) {
        const colour = hex(SYNTAX_TOKENS[mode][name as keyof typeof SYNTAX_TOKENS.light]);
        for (const bg of backgrounds[mode]) {
          expect(contrast(colour, bg), `${mode} --syn-${name}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("the skill names every token the stylesheet defines", () => {
    for (const name of Object.keys(SYNTAX_TOKENS.light)) expect(md).toContain(`--syn-${name}`);
  });
});
