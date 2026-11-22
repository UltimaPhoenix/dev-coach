// A 0 to 10 scale, for confidence levels: eleven ticks, coloured bands with their name and range
// printed, and optional marks for points worth pointing at. The tones are the dashboard's
// confidence-bar colours (red below 4, yellow 4 to 6, green from 7), darkened in the light theme
// so text and bars keep their contrast.
//
//   import Scale from "@site/src/components/Scale";
//
//   <Scale
//     bands={[
//       { from: 0, to: 3, label: "learning", tone: "low" },
//       { from: 4, to: 6, label: "intermediate", tone: "mid" },
//       { from: 7, to: 10, label: "strong", tone: "high" },
//     ]}
//     marks={[{ at: 5, label: "a new topic starts here" }]}
//     caption="Confidence per topic, from 0 to 10."
//   />
//
// - `bands`: whole numbers from 0 to 10, `from` ≤ `to`; `tone` is "low", "mid" or "high". Bands may
//   leave gaps (shown as an empty track) but should not overlap.
// - `marks`: optional; `at` a whole number from 0 to 10, `label` a few words. One row per mark.
// - `caption`: optional sentence under the scale; without one the figure is named "Scale from 0 to 10".
// Screen readers get the same content as a list (the drawing itself is hidden from them).
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import styles from "./styles.module.css";

export interface ScaleBand {
  from: number;
  to: number;
  label: string;
  tone: "low" | "mid" | "high";
}
export interface ScaleMark {
  at: number;
  label: string;
}

interface Props {
  bands: ScaleBand[];
  marks?: ScaleMark[];
  caption?: ReactNode;
}

const MIN = 0;
const MAX = 10;
const TICKS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const range = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

export default function Scale({ bands, marks = [], caption }: Props): ReactNode {
  const shown = bands
    .map((band) => ({ ...band, from: clamp(Math.min(band.from, band.to)), to: clamp(Math.max(band.from, band.to)) }))
    .sort((a, b) => a.from - b.from);
  return (
    <figure className={styles.scale} aria-label={caption ? undefined : "Scale from 0 to 10"}>
      <div className={styles.box}>
        <div className={styles.drawing} aria-hidden="true">
          <div className={styles.bands}>
            {shown.map((band) => (
              <div
                key={`${band.from}-${band.label}`}
                className={clsx(styles.band, styles[band.tone])}
                style={{ gridColumn: `${band.from + 1} / ${band.to + 2}` }}
              >
                <span className={styles.label}>{band.label}</span>
                <span className={styles.range}>{range(band.from, band.to)}</span>
                <span className={styles.bar} />
              </div>
            ))}
          </div>
          <div className={styles.ticks}>
            {TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          {marks.map((mark) => {
            const at = clamp(mark.at);
            return (
              <div
                key={`${at}-${mark.label}`}
                className={clsx(styles.mark, at > (MIN + MAX) / 2 && styles.markEnd)}
                style={{ "--at": (at + 0.5) / TICKS.length } as CSSProperties}
              >
                <span className={styles.markText}>
                  <b>{at}</b> {mark.label}
                </span>
              </div>
            );
          })}
        </div>
        <ul className={styles.srOnly}>
          {shown.map((band) => (
            <li key={`${band.from}-${band.label}`}>
              {band.from === band.to ? `${band.from}` : `${band.from} to ${band.to}`}: {band.label}
            </li>
          ))}
          {marks.map((mark) => (
            <li key={`${mark.at}-${mark.label}`}>
              {clamp(mark.at)}: {mark.label}
            </li>
          ))}
        </ul>
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
