// A short conversation for the guides: who says what, and which choice was picked. It shows how
// devcoach behaves in the chat without a screenshot of any one client; the text is real text
// (selectable, translatable, read by screen readers).
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function Chat({ label, children }: { label?: string; children: ReactNode }): ReactNode {
  return (
    <figure className={styles.chat}>
      {label && <figcaption className={styles.bar}>{label}</figcaption>}
      <div className={styles.rows}>{children}</div>
    </figure>
  );
}

const WHO = { you: "you", coach: "devcoach", agent: "agent" } as const;

export function Say({ who, children }: { who: keyof typeof WHO; children: ReactNode }): ReactNode {
  return (
    <div className={clsx(styles.row, styles[who])}>
      <span className={styles.who}>{WHO[who]}</span>
      <div className={styles.text}>{children}</div>
    </div>
  );
}

/**
 * The options a question offered, with the one that was picked. Illustration only, not a control.
 * `stacked` puts one option per line, for options that are whole sentences.
 */
export function Choices({
  options,
  picked,
  stacked,
}: {
  options: string[];
  picked?: string;
  stacked?: boolean;
}): ReactNode {
  return (
    <div className={clsx(styles.row, styles.you)}>
      <span className={styles.who}>{WHO.you}</span>
      <ul className={clsx(styles.choices, stacked && styles.stacked)}>
        {options.map((option) => (
          <li key={option} className={clsx(option === picked && styles.picked)}>
            {option}
            {option === picked && <span className={styles.srOnly}> (picked)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
