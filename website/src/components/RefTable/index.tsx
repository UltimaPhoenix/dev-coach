// A reference table that reads as a list: the name on the left, the description on the right.
// In a three-column table the third cell (an annotation) shows as a small tag under the name.
// Every RefTable on a page has the same name column, so its tables line up; on a phone each row
// stacks (name and tag, then the description) instead of scrolling sideways.
//
// Wrap a markdown table, with a blank line on each side. The tag's colour follows its markdown:
// plain text is neutral, *emphasis* is the calm "read-only" look, **strong** the "destructive" one.
// `wideName` widens the name column for long names such as resource URIs.
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export default function RefTable({
  children,
  wideName = false,
}: {
  children: ReactNode;
  wideName?: boolean;
}): ReactNode {
  return <div className={clsx(styles.ref, wideName && styles.wideName)}>{children}</div>;
}

/** The same tag outside a table, for a legend: `kind` picks the look of a table's third cell. */
export function Tag({
  kind = "plain",
  children,
}: {
  kind?: "plain" | "calm" | "warn";
  children: ReactNode;
}): ReactNode {
  return <span className={clsx(styles.tag, styles[kind])}>{children}</span>;
}
