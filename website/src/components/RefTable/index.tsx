// A reference table (name · description · tag) that stays readable on a phone. Infima already lets a
// markdown table scroll inside its own box; without a floor, the browser first squeezes the
// description column down to its longest word, a few words a line. Wrap the markdown table, with a
// blank line on each side, and name the column that holds the description.
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export default function RefTable({ children, wide = 2 }: { children: ReactNode; wide?: 2 | 3 }): ReactNode {
  return <div className={styles[`wide${wide}`]}>{children}</div>;
}
