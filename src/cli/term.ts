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

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is intentional
const ANSI_RE = /\[[0-9;]*m/g;
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
    out.push(rowLine(columns.map((col) => c.bold(col.header))));
    out.push(sep("├", "┼", "┤"));
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
