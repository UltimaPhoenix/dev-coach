// "Two speeds": a figure for the Why page. Kahneman's slow and fast thinking as two columns, three
// situations as rows: who does each kind of thinking, and whether the slow one still gives your
// fast judgment practice (the arrow between them: solid, dashed for none, thinner for some).
// Conceptual, like the validation-gap sketch above it on the page.
//
// A grid of divs with table roles rather than a <table>, which the theme styles as a data table.
// Every row is its own grid with the same columns, so the cells line up. Wide: situation | slow |
// arrow | fast. Narrow (a phone): the situation sits on its own line above its cells and the arrow
// loses its visible words, which stay for screen readers.
//
//   <TwoSpeeds />
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface Row {
  situation: string;
  /** Who does the slow thinking; `you` marks the reader's own part. */
  slow: { who: string; you?: boolean }[];
  /** How much practice reaches the reader's fast judgment. */
  practice: "full" | "none" | "some";
  practiceText: string;
  fastNote: string;
}

const ROWS: Row[] = [
  {
    situation: "On your own",
    slow: [{ who: "You", you: true }],
    practice: "full",
    practiceText: "your practice",
    fastNote: "Trained by the slow work you do.",
  },
  {
    situation: "With an agent",
    slow: [{ who: "The agent" }],
    practice: "none",
    practiceText: "no practice",
    fastNote: "Running on what you learned before.",
  },
  {
    situation: "With an agent and devcoach",
    slow: [{ who: "The agent" }, { who: "You, lesson by lesson", you: true }],
    practice: "some",
    practiceText: "some practice",
    fastNote: "Trained again, a little at a time.",
  },
];

function Arrow({ text, className }: { text: string; className?: string }): ReactNode {
  return (
    <>
      <span className={styles.arrowText}>{text}</span>
      <span className={clsx(styles.arrow, className)} aria-hidden="true" />
    </>
  );
}

export default function TwoSpeeds(): ReactNode {
  return (
    <figure className={styles.figure}>
      <div
        className={styles.table}
        role="table"
        aria-label="Who does the slow thinking and who does the fast thinking: on your own, with an agent, and with an agent and devcoach"
      >
        <div className={clsx(styles.row, styles.headRow)} role="row">
          <div className={styles.situation} role="columnheader">
            <span className="dc-sr-only">Situation</span>
          </div>
          <div className={styles.head} role="columnheader">
            <strong>Slow thinking</strong>
            <span>Deliberate, takes effort. Working out why.</span>
          </div>
          <div className={styles.link} role="columnheader">
            <Arrow text="with practice, becomes" />
          </div>
          <div className={styles.head} role="columnheader">
            <strong>Fast thinking</strong>
            <span>Automatic, at a glance. “This looks off.”</span>
          </div>
        </div>
        {ROWS.map((row) => (
          <div className={styles.row} role="row" key={row.situation}>
            <div className={styles.situation} role="rowheader">
              {row.situation}
            </div>
            <div className={styles.cell} role="cell">
              {row.slow.map(({ who, you }) => (
                <span key={who} className={clsx(styles.chip, you && styles.you)}>
                  {who}
                </span>
              ))}
            </div>
            <div className={styles.link} role="cell">
              <Arrow text={row.practiceText} className={styles[row.practice]} />
            </div>
            <div className={styles.cell} role="cell">
              <span className={clsx(styles.chip, styles.you)}>You</span>
              <span className={styles.note}>{row.fastNote}</span>
            </div>
          </div>
        ))}
      </div>
      <figcaption className={styles.caption}>
        <strong>Two speeds</strong>: slow thinking is where fast judgment comes from, and an agent takes over the slow
        part. Conceptual, not measured data.
      </figcaption>
    </figure>
  );
}
