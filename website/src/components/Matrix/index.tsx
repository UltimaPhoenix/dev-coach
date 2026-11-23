// A comparison table that stays readable on a phone: the markdown table inside scrolls in its own
// box while its first column (what each row is) stays pinned. Cells say yes / with a condition /
// no with an icon AND a word; the icon is hidden from screen readers, which hear "Yes:",
// "With a condition:" or "No:" before the word instead, so nothing relies on the icon or its colour.
//
//   import Matrix, { Legend, No, Note, Notes, Partly, Ref, Yes } from "@site/src/components/Matrix";
//
//   <Matrix label="What each agent gets" minWidth={34}>
//
//   | Agent | Lessons after a task |
//   |---|---|
//   | **Claude Code** | <Yes>Automatic</Yes> |
//   | **Claude Desktop** | <No>When you ask<Ref n={1} to="ask" /></No> |
//
//   </Matrix>
//
//   <Notes>
//     <Legend />
//     <Note n={1} id="ask">No hooks there: ask for a lesson.</Note>
//   </Notes>
//
// - `label`: names the scrollable box for screen readers and keyboard users (it takes focus).
// - `minWidth`: optional, in rem. Below it the table scrolls sideways instead of squeezing columns.
// - Keep a blank line after `<Matrix …>` and before `</Matrix>`, or MDX will not see the table.
// - `Ref` links to the `Note` with the same id (`#note-<id>`); give each note its number by hand.
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import styles from "./styles.module.css";

export default function Matrix({
  label,
  minWidth,
  children,
}: {
  label: string;
  minWidth?: number;
  children: ReactNode;
}): ReactNode {
  const style = minWidth ? ({ "--matrix-min": `${minWidth}rem` } as CSSProperties) : undefined;
  // tabIndex: a box that scrolls must be reachable from the keyboard.
  return (
    <div className={styles.matrix} style={style} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

type Kind = "yes" | "partly" | "no";

const SHAPES: Record<Kind, ReactNode> = {
  yes: (
    <path
      d="M3 8.6l3.1 3.1L13 4.8"
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  partly: (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.8" />
      <path d="M8 2.6a5.4 5.4 0 0 0 0 10.8z" stroke="none" />
    </>
  ),
  no: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" strokeWidth="2.2" strokeLinecap="round" />,
};

const SPOKEN: Record<Kind, string> = { yes: "Yes:", partly: "With a condition:", no: "No:" };

function Icon({ kind }: { kind: Kind }): ReactNode {
  return (
    <svg
      className={clsx(styles.icon, styles[kind])}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[kind]}
    </svg>
  );
}

function Mark({ kind, children }: { kind: Kind; children: ReactNode }): ReactNode {
  return (
    <span className={styles.mark}>
      <Icon kind={kind} />
      <span className={styles.srOnly}>{SPOKEN[kind]} </span>
      {children}
    </span>
  );
}

export const Yes = ({ children }: { children: ReactNode }): ReactNode => (
  <Mark kind="yes">{children}</Mark>
);
export const Partly = ({ children }: { children: ReactNode }): ReactNode => (
  <Mark kind="partly">{children}</Mark>
);
export const No = ({ children }: { children: ReactNode }): ReactNode => (
  <Mark kind="no">{children}</Mark>
);

/** What the three marks mean, drawn the same way; the first line under a matrix. */
export function Legend(): ReactNode {
  return (
    <p className={styles.legend}>
      <span>
        <Icon kind="yes" /> yes
      </span>
      <span>
        <Icon kind="partly" /> with a condition
      </span>
      <span>
        <Icon kind="no" /> no
      </span>
    </p>
  );
}

/** A footnote mark that links to the `Note` with the same id. */
export function Ref({ n, to }: { n: number; to: string }): ReactNode {
  return (
    <sup className={styles.ref}>
      <a href={`#note-${to}`} aria-label={`note ${n}`}>
        {n}
      </a>
    </sup>
  );
}

/** The legend and the notes under a matrix. */
export function Notes({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.notes}>{children}</div>;
}

export function Note({ n, id, children }: { n: number; id: string; children: ReactNode }): ReactNode {
  return (
    <div id={`note-${id}`} className={styles.note}>
      <span className={styles.num}>{n}</span>
      <div className={styles.text}>{children}</div>
    </div>
  );
}
