// "The validation gap": a conceptual sketch for the Why page, not a chart of data. Over months of
// AI-assisted work, what you ship keeps rising; what you could check on your own sags without
// practice (dashed) and holds when you keep learning (solid). Inline SVG drawn with the site's
// tokens, so it follows the light and dark themes. Two layouts of the same drawing: labels beside
// the line ends when the figure is wide, stacked labels when it is narrow (a phone), so the text
// stays readable at either size. Only one is displayed; the other is `display: none`.
//
//   <ValidationGap />
import type { ReactNode } from "react";
import styles from "./styles.module.css";

const ALT =
  "Conceptual sketch. The horizontal axis is months of AI-assisted work. All three lines start at the same point. " +
  "What you ship rises steeply. What you could check on your own rises a little when you keep learning, " +
  "and sags when you never practise, so the gap between what you ship and what you can check widens much faster without practice.";

interface Line {
  /** The cubic Bézier from the shared starting point to the line's end. */
  d: string;
  end: [number, number];
  /** Label lines; the first `strong` of them name the line, the rest give the condition. */
  label: string[];
  strong?: number;
  labelY: number;
}

interface Layout {
  width: number;
  height: number;
  start: [number, number];
  axis: { x0: number; x1: number; y: number };
  labelX: number;
  lineHeight: number;
  ship: Line;
  learning: Line;
  idle: Line;
}

// Wide: labels in a column to the right of the line ends, one line each plus a condition.
const WIDE: Layout = {
  width: 680,
  height: 312,
  start: [28, 196],
  axis: { x0: 28, x1: 420, y: 278 },
  labelX: 438,
  lineHeight: 18,
  ship: { d: "M28,196 C170,193 312,124 420,44", end: [420, 44], label: ["What you ship"], labelY: 49 },
  learning: {
    d: "M28,196 C160,193 300,170 420,158",
    end: [420, 158],
    label: ["What you could check on your own,", "learning a little, continuously"],
    labelY: 163,
  },
  idle: {
    d: "M28,196 C130,197 270,226 420,234",
    end: [420, 234],
    label: ["What you could check on your own,", "without practice"],
    labelY: 239,
  },
};

// Narrow: a shorter plot and labels of a few words per line, for a phone's width.
const NARROW: Layout = {
  width: 360,
  height: 352,
  start: [16, 214],
  axis: { x0: 16, x1: 212, y: 314 },
  labelX: 224,
  lineHeight: 16,
  ship: { d: "M16,214 C104,211 178,128 212,44", end: [212, 44], label: ["What you ship"], labelY: 49 },
  learning: {
    d: "M16,214 C96,211 160,188 212,176",
    end: [212, 176],
    label: ["What you could", "check on your own,", "learning steadily"],
    strong: 2,
    labelY: 181,
  },
  idle: {
    d: "M16,214 C80,215 150,246 212,256",
    end: [212, 256],
    label: ["What you could", "check on your own,", "without practice"],
    strong: 2,
    labelY: 261,
  },
};

function Label({ x, line, lineHeight, className }: { x: number; line: Line; lineHeight: number; className: string }): ReactNode {
  return (
    <text className={className} x={x} y={line.labelY}>
      {line.label.map((text, i) => (
        <tspan key={text} x={x} dy={i === 0 ? 0 : lineHeight} className={i < (line.strong ?? 1) ? undefined : styles.condition}>
          {text}
        </tspan>
      ))}
    </text>
  );
}

function Sketch({ layout, className }: { layout: Layout; className: string }): ReactNode {
  const { width, height, start, axis, labelX, lineHeight, ship, learning, idle } = layout;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ALT}>
      {/* x-axis with an arrowhead, and its label under the arrow */}
      <path className={styles.axis} d={`M${axis.x0},${axis.y} H${axis.x1}`} />
      <path className={styles.axis} d={`M${axis.x1 - 7},${axis.y - 5} L${axis.x1},${axis.y} L${axis.x1 - 7},${axis.y + 5}`} />
      <text className={styles.axisLabel} x={axis.x1} y={axis.y + 24} textAnchor="end">
        months of AI-assisted work
      </text>

      <path className={styles.idle} d={idle.d} />
      <path className={styles.learning} d={learning.d} />
      <path className={styles.ship} d={ship.d} />

      <circle className={styles.startDot} cx={start[0]} cy={start[1]} r={4.5} />
      <circle className={styles.idleDot} cx={idle.end[0]} cy={idle.end[1]} r={4.5} />
      <circle className={styles.learningDot} cx={learning.end[0]} cy={learning.end[1]} r={4.5} />
      <circle className={styles.shipDot} cx={ship.end[0]} cy={ship.end[1]} r={5} />

      <Label x={labelX} line={ship} lineHeight={lineHeight} className={styles.shipLabel} />
      <Label x={labelX} line={learning} lineHeight={lineHeight} className={styles.label} />
      <Label x={labelX} line={idle} lineHeight={lineHeight} className={styles.label} />
    </svg>
  );
}

export default function ValidationGap(): ReactNode {
  return (
    <figure className={styles.figure}>
      <Sketch layout={WIDE} className={styles.wide} />
      <Sketch layout={NARROW} className={styles.narrow} />
      <figcaption className={styles.caption}>
        <strong>The validation gap</strong>: the distance between what you ship and what you could check on your own.
        Conceptual sketch, not measured data.
      </figcaption>
    </figure>
  );
}
