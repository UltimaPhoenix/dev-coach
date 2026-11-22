// One working day of devcoach's pacing, for the coaching guide: where the lessons can fall and
// what keeps them apart. The numbers are props and default to the product's own defaults
// (./defaults.ts, checked against DEFAULT_SETTINGS in src/core/db.ts by defaults.test.ts); the
// times of day are an example. The drawing is laid out from those numbers, so it cannot say
// something the caption does not.
//
//   import PacingDay from "@site/src/components/PacingDay";
//
//   <PacingDay />                                   the defaults
//   <PacingDay maxPerDay={3} minGapMinutes={120} />  another pace
import clsx from "clsx";
import type { ReactNode } from "react";
import { PACING_DEFAULTS } from "./defaults";
import styles from "./styles.module.css";

interface Props {
  /** `max_per_day`: the most lessons in any 24 hours. */
  maxPerDay?: number;
  /** `min_gap_minutes`: the least time between two lessons. */
  minGapMinutes?: number;
  /** `nudge_every`: replies of your agent, in one chat, between two lesson cues. */
  nudgeEvery?: number;
}

const DAY_START = 8 * 60;
const DAY_END = 18 * 60;
const FIRST_LESSON = 10 * 60; // the example: the day's first lesson lands at 10:00

const clock = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
const duration = (minutes: number): string =>
  minutes % 60 === 0 ? `${minutes / 60} h` : minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;

export default function PacingDay({
  maxPerDay = PACING_DEFAULTS.maxPerDay,
  minGapMinutes = PACING_DEFAULTS.minGapMinutes,
  nudgeEvery = PACING_DEFAULTS.nudgeEvery,
}: Props): ReactNode {
  // Each lesson as early as the gap allows after the one before, as many as fit in the example day.
  const lessons = Array.from({ length: Math.max(1, maxPerDay) }, (_, i) => FIRST_LESSON + i * minGapMinutes).filter(
    (at, i) => i === 0 || at < DAY_END,
  );
  const last = lessons[lessons.length - 1];
  const gap = duration(minGapMinutes);
  // All of the day's lessons fit: the next one waits until the first is a day old.
  const next = lessons.length === maxPerDay ? `${clock(lessons[0])} tomorrow` : clock(last + minGapMinutes);
  const isDefault =
    maxPerDay === PACING_DEFAULTS.maxPerDay &&
    minGapMinutes === PACING_DEFAULTS.minGapMinutes &&
    nudgeEvery === PACING_DEFAULTS.nudgeEvery;
  // The day in segments: before the first lesson, one gap per pair of lessons, the rest of the day.
  const segments = [
    { from: DAY_START, to: lessons[0], kind: "before", lesson: 0, note: "" },
    ...lessons.slice(1).map((to, i) => ({
      from: lessons[i],
      to,
      kind: "gap",
      lesson: i + 1,
      note: `at least ${gap} apart`,
    })),
    {
      from: last,
      to: DAY_END,
      kind: "after",
      lesson: lessons.length,
      note: `next one from ${next}`,
    },
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
      <p className="dc-sr-only">
        An example day: the first lesson lands at {clock(lessons[0])}
        {lessons.length > 1 && `, the next one no earlier than ${clock(lessons[1])}`}, and after lesson{" "}
        {lessons.length} none until {next}.
      </p>
      <figcaption className={styles.caption}>
        <strong>{isDefault ? "Defaults" : "This pace"}:</strong> one lesson cue about every {nudgeEvery} replies of your agent in a chat, at most{" "}
        {maxPerDay} lessons in any 24 hours, at least {gap} apart. Every number is a setting. The times are an example.
      </figcaption>
    </figure>
  );
}
