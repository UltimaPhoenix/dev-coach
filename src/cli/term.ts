// Zero-dependency terminal styling + table rendering (replaces Rich) using node:util styleText.
import { styleText } from "node:util";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
type Fmt = Parameters<typeof styleText>[0];
const paint = (fmt: Fmt, s: string): string => (useColor ? styleText(fmt, s) : s);

export const c = {
  green: (s: string) => paint("green", s),
  red: (s: string) => paint("red", s),
  yellow: (s: string) => paint("yellow", s),
  cyan: (s: string) => paint("cyan", s),
  magenta: (s: string) => paint("magenta", s),
  dim: (s: string) => paint("dim", s),
  bold: (s: string) => paint("bold", s),
};

export function colorize(name: "green" | "yellow" | "red", s: string): string {
  return name === "green" ? c.green(s) : name === "yellow" ? c.yellow(s) : c.red(s);
}

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

/** `url` as a clickable terminal link (OSC 8) where supported, otherwise the plain text. */
export function link(url: string, text = url): string {
  return supportsHyperlinks() ? `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007` : text;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI/OSC escapes is intentional
const ANSI_RE = /\u001b\[[0-9;]*m|\u001b\]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");
const width = (s: string): number => [...stripAnsi(s)].length;

function pad(s: string, w: number, justify: "left" | "right" | "center"): string {
  const gap = Math.max(0, w - width(s));
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
    Math.max(showHeader ? width(col.header) : 0, ...rows.map((r) => width(r[i] ?? ""))),
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

export function rule(text = ""): string {
  const total = 60;
  if (!text) return "─".repeat(total);
  const t = ` ${text} `;
  const side = Math.max(2, total - width(t));
  const l = Math.floor(side / 2);
  return "─".repeat(l) + t + "─".repeat(side - l);
}

export const confidenceBar = (confidence: number): string => {
  const filled = Math.max(0, Math.min(10, Math.round(confidence)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
};

export const confidenceColor = (confidence: number): "green" | "yellow" | "red" =>
  confidence >= 7 ? "green" : confidence >= 4 ? "yellow" : "red";
