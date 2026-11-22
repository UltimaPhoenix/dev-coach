// A Mermaid diagram that is wider than a phone: it keeps its own size and scrolls sideways in its
// own box, so its text stays readable at 390 px instead of shrinking with the column. On a screen
// wide enough it sits centred like any other diagram.
//
//   import WideDiagram from "@site/src/components/WideDiagram";
//
//   <WideDiagram label="The database tables and how they relate">
//
//   ```mermaid
//   ---
//   config:
//     er:
//       useMaxWidth: false
//   ---
//   erDiagram
//     …
//   ```
//
//   </WideDiagram>
//
// - `label`: what the diagram shows; it names the scrolling region for screen readers.
// - Put the Mermaid fence inside with a blank line on each side, and give the diagram
//   `useMaxWidth: false` (under its type: `er`, `flowchart`, …) so Mermaid draws it at its own size.
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface Props {
  label: string;
  children: ReactNode;
}

export default function WideDiagram({ label, children }: Props): ReactNode {
  return (
    // Focusable so a keyboard can scroll it sideways.
    <div className={styles.box} tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
