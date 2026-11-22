// A table that turns into one block per row on a phone, so no column ends up off-screen.
// Wrap a plain HTML table written in MDX:
//
//   <StackTable>
//     <table>
//       <thead><tr><th>Source</th><th>What is read</th></tr></thead>
//       <tbody>
//         <tr><th colSpan={2} scope="rowgroup">A group</th></tr>
//         <tr><th scope="row">A source</th><td data-label="What is read">…</td></tr>
//       </tbody>
//     </table>
//   </StackTable>
//
// On a wide screen it is an ordinary full-width table. Below 700 px each row becomes a card: the
// row's `th` is its heading, and every `td` shows its `data-label` above its text. A `th` with
// `scope="rowgroup"` becomes a small heading between the cards. Avoid rowSpan: a stacked row only
// shows its own cells.
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function StackTable({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.stack}>{children}</div>;
}
