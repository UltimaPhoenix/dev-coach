// The few tools one job uses, in order: numbered boxes joined by arrows, side by side where the
// column is wide enough and stacked on a phone, with an optional "or" line for the alternative.
// A step names a tool (shown as code) or, for something no tool does, a plain title.
//   <ToolFlow label="…" steps={[{ tool: "get_briefing", note: "…" }, { title: "The card", note: "…" },
//     { tool: "submit_feedback", when: "Next turn", note: "…" }]} or={{ tool: "skip_lesson", note: "…" }} />
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface Step {
  /** A tool name, shown as code. */
  tool?: string;
  /** A plain title, for a step that is not a tool call. */
  title?: string;
  /** A short label above the name, e.g. "Next turn". */
  when?: string;
  note: string;
}

export default function ToolFlow({
  label,
  steps,
  or,
}: {
  label?: string;
  steps: Step[];
  or?: { tool: string; note: string };
}): ReactNode {
  return (
    <figure className={styles.flow}>
      {label && <figcaption className={styles.label}>{label}</figcaption>}
      <ol className={styles.steps}>
        {steps.map((s) => (
          <li key={s.tool ?? s.title} className={styles.step}>
            {s.when && <span className={styles.when}>{s.when}</span>}
            <span className={styles.name}>{s.tool ? <code>{s.tool}</code> : s.title}</span>
            <span className={styles.note}>{s.note}</span>
          </li>
        ))}
      </ol>
      {or && (
        <p className={styles.or}>
          <span className={styles.orWord}>or</span> <code>{or.tool}</code>{" "}
          <span className={styles.note}>{or.note}</span>
        </p>
      )}
    </figure>
  );
}
