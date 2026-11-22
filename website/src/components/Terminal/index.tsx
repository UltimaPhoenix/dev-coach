// Real command output, shown the way the terminal showed it: colours, bold, dim, tables. The text
// is captured from the real CLI on the demo data, never typed (`npm run docs:cli-output` writes
// src/data/cli-output.json, one key per command; scripts/docs-cli-output.mjs lists them).
//
//   import cli from "@site/src/data/cli-output.json";
//   import Terminal from "@site/src/components/Terminal";
//
//   <Terminal command="devcoach stats" output={cli.stats} />
//   <Terminal command="devcoach doctor" output={cli.doctor} maxLines={14} caption="…" />
//
// - `command`: what was typed, shown after a `$` in the title bar; it is also the figure's name.
// - `output`: the raw text with its ANSI codes (see ./ansi.ts for what is kept and what is dropped);
//   blank lines before the first and after the last printed line are not shown.
// - `caption`: optional; a sentence under the window (plain text or inline JSX).
// - `maxLines`: optional; show that many lines and fold the rest behind "Show all N lines".
// The window is dark in both site themes. Wide output scrolls sideways inside it, never the page.
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { useId, useMemo, useRef, useState } from "react";
import { type AnsiStyle, cells, type Line, parseAnsi } from "./ansi";
import styles from "./styles.module.css";

interface Props {
  command: string;
  output: string;
  caption?: ReactNode;
  maxLines?: number;
}

function runClass(style: AnsiStyle): string | undefined {
  return (
    clsx(
      style.fg && [styles.fg, styles[style.fg]],
      style.bold && styles.bold,
      style.dim && styles.dim,
      style.underline && styles.underline,
    ) || undefined
  );
}

function renderLine(line: Line, key: number): ReactNode {
  return (
    <span key={key} className={styles.line}>
      {line.map((run, i) => (
        <span key={i} className={runClass(run.style)}>
          {cells(run.text).map((piece, j) =>
            typeof piece === "string" ? (
              piece
            ) : (
              <span key={j} className={styles.cell} style={{ "--w": piece.width } as CSSProperties}>
                {piece.text}
              </span>
            ),
          )}
        </span>
      ))}
      {"\n"}
    </span>
  );
}

export default function Terminal({ command, output, caption, maxLines }: Props): ReactNode {
  const lines = useMemo(() => {
    const parsed = parseAnsi(output);
    // The window starts at the first printed line and ends at the last: blank lines around the
    // output (doctor opens with one) would only look like padding.
    const blank = (line: Line) => line.every((run) => run.text.trim() === "");
    while (parsed.length > 1 && blank(parsed[0])) parsed.shift();
    while (parsed.length > 1 && blank(parsed[parsed.length - 1])) parsed.pop();
    return parsed;
  }, [output]);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  const foldable = maxLines !== undefined && maxLines > 0 && lines.length > maxLines + 1;
  const cut = foldable ? (maxLines as number) : lines.length;

  const onToggle = () => {
    setOpen((was) => {
      if (was) {
        // Folding back: keep the button where the reader is, rather than leaving it far above.
        requestAnimationFrame(() => toggle.current?.scrollIntoView({ block: "nearest" }));
      }
      return !was;
    });
  };

  return (
    <figure className={styles.figure} aria-labelledby={`${id}-title`}>
      <div className={styles.window}>
        <div className={styles.bar}>
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span id={`${id}-title`} className={styles.title}>
            <span className={styles.prompt} aria-hidden="true">
              {"$ "}
            </span>
            {command}
          </span>
        </div>
        {/* Focusable so a keyboard can scroll a wide table sideways. */}
        <div
          className={clsx(styles.scroll, foldable && !open && styles.folded)}
          tabIndex={0}
          role="region"
          aria-label={`Output of ${command}`}
          id={`${id}-out`}
        >
          <pre className={styles.pre}>
            <code>
              {lines.slice(0, cut).map(renderLine)}
              {/* Folded lines stay in the page (and its HTML), hidden until the button opens them. */}
              {foldable && <span hidden={!open}>{lines.slice(cut).map((line, i) => renderLine(line, cut + i))}</span>}
            </code>
          </pre>
        </div>
        {foldable && (
          <button
            ref={toggle}
            type="button"
            className={styles.more}
            aria-expanded={open}
            aria-controls={`${id}-out`}
            onClick={onToggle}
          >
            {open ? "Show fewer lines" : `Show all ${lines.length} lines`}
            {!open && <span className={styles.moreHint}> ({lines.length - cut} more)</span>}
          </button>
        )}
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
