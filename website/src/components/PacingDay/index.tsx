// One working day with devcoach's default pacing, for the coaching guide: where the lessons can
// fall and what keeps them apart. The three numbers are the product defaults (DEFAULT_SETTINGS in
// src/core/db.ts); the times of day are an example. The drawing is laid out from those numbers,
// so it cannot say something the caption does not.
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

const MAX_PER_DAY = 2;
const MIN_GAP_MINUTES = 240;
const NUDGE_EVERY = 10;

const DAY_START = 8 * 60;
const DAY_END = 18 * 60;
const FIRST_LESSON = 10 * 60; // the example: the day's first lesson lands at 10:00

const clock = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

export default function PacingDay(): ReactNode {
  // Each lesson as early as the gap allows after the one before.
  const lessons = Array.from({ length: MAX_PER_DAY }, (_, i) => FIRST_LESSON + i * MIN_GAP_MINUTES);
  const last = lessons[lessons.length - 1];
  const gapHours = MIN_GAP_MINUTES / 60;
  // The day in segments: before the first lesson, one gap per pair of lessons, the rest of the day.
  const segments = [
    { from: DAY_START, to: lessons[0], kind: "before", lesson: 0, note: "" },
    ...lessons.slice(1).map((to, i) => ({
      from: lessons[i],
      to,
      kind: "gap",
      lesson: i + 1,
      note: `at least ${gapHours} h apart`,
    })),
    { from: last, to: DAY_END, kind: "after", lesson: lessons.length, note: "quiet until tomorrow" },
  ];
  const columns = segments.map((s) => `minmax(0, ${s.to - s.from}fr)`).join(" ");

  return (
    <figure className={styles.day}>
      <div className={styles.plot} style={{ gridTemplateColumns: columns }} aria-hidden="true">
        {segments.map((s) => (
          <span key={`label-${s.from}`} className={styles.label}>
            {s.lesson > 0 && `lesson ${s.lesson}`}
          </span>
        ))}
        {segments.map((s) => (
          <span key={`track-${s.from}`} className={clsx(styles.track, styles[s.kind], s.lesson > 0 && styles.lesson)} />
        ))}
        {segments.map((s) => (
          <span key={`note-${s.from}`} className={clsx(styles.note, styles[`${s.kind}Note`])}>
            {s.note}
          </span>
        ))}
        {segments.map((s, i) => (
          <span key={`time-${s.from}`} className={styles.time}>
            <span>{clock(s.from)}</span>
            {i === segments.length - 1 && <span>{clock(s.to)}</span>}
          </span>
        ))}
      </div>
      <p className={styles.srOnly}>
        An example day: the first lesson lands at {clock(lessons[0])}, the next one no earlier than{" "}
        {clock(lessons[1] ?? last)}, and then no more lessons until tomorrow.
      </p>
      <figcaption className={styles.caption}>
        <strong>Defaults:</strong> at most {MAX_PER_DAY} lessons a day, at least {gapHours} h apart, and one cue
        every ~{NUDGE_EVERY} interactions in a chat session. Every number is a setting. The times are an example.
      </figcaption>
    </figure>
  );
}
