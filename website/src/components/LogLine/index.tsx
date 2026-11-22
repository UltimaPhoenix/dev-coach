// One real log line, its parts numbered and explained: what a reader should look for in a line
// such as devcoach's startup line ("version · Node · install channel · data"). The line is shown
// whole, in the terminal's colours, wrapping between and inside its parts (a scrolling code block
// hides the end of a long line); each part carries a number, and a list under it says what that
// part tells you.
//
//   import LogLine from "@site/src/components/LogLine";
//
//   <LogLine
//     parts={[
//       { text: "devcoach 2.7.1 mcp", label: "Version", note: "which devcoach ran" },
//       { text: "data ~/.devcoach (schema 6)", label: "Data", note: "the data folder" },
//     ]}
//     caption="…"
//   />
//
// - `parts`: the line's pieces, in order, exactly as printed; `separator` (default " · ") joins them.
// - `label`: one to three words; `note`: a sentence (text or inline JSX).
// - `caption`: optional sentence under the figure; without one the figure is named "A log line".
// Screen readers read the line as one piece of code, then the numbered list.
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export interface LogLinePart {
  text: string;
  label: string;
  note: ReactNode;
}

interface Props {
  parts: LogLinePart[];
  separator?: string;
  caption?: ReactNode;
}

export default function LogLine({ parts, separator = " · ", caption }: Props): ReactNode {
  return (
    <figure className={styles.figure} aria-label={caption ? undefined : "A log line"}>
      <div className={styles.box}>
        <code className={styles.line}>
          {parts.map((part, i) => (
            <span key={part.label}>
              {i > 0 && <span className={styles.sep}>{separator}</span>}
              <span className={styles.badge} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.part}>{part.text}</span>
            </span>
          ))}
        </code>
      </div>
      <ol className={styles.list}>
        {parts.map((part, i) => (
          <li key={part.label} className={styles.item}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <strong>{part.label}.</strong> {part.note}
            </span>
          </li>
        ))}
      </ol>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
