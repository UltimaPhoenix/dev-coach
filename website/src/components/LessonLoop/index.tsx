// The docs home's demo: a terminal that plays the coaching loop — a task, the agent's reply, the
// lesson card devcoach adds, a one-key answer. Every line is laid out from the first frame
// (unrevealed ones are only hidden), so playback never shifts the page. The server-rendered
// frame is the last one: without JS, or with reduced motion, the whole loop is there at rest.
import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

type Kind = "prompt" | "tool" | "agent" | "band" | "title" | "text" | "ask" | "blank";
type Line = { at: number; kind: Kind; text: string; typed?: boolean };

const TYPE_MS = 38;
const LOOP_MS = 17_000;

const SCRIPT: Line[] = [
  { at: 0, kind: "prompt", text: "add a Redis cache in front of the product lookup", typed: true },
  { at: 2300, kind: "tool", text: "Read src/products/repo.ts" },
  { at: 2800, kind: "tool", text: "Update src/products/repo.ts (+38 −4)" },
  { at: 3400, kind: "tool", text: "Bash npm test · 42 passed" },
  {
    at: 4100,
    kind: "agent",
    text: "Done. Product lookups now read Redis first (TTL 60 s) and fall back to Postgres on a miss.",
  },
  { at: 5300, kind: "blank", text: "" },
  { at: 5300, kind: "band", text: "──────── 🎓 devcoach ────────" },
  {
    at: 5700,
    kind: "title",
    text: "Cache stampede — when every server hits the DB at the same moment · redis · Senior",
  },
  {
    at: 6300,
    kind: "text",
    text: "A hot key with a fixed 60 s TTL expires for everyone at once: every request misses in the same instant, and all of them query Postgres together.",
  },
  {
    at: 7000,
    kind: "text",
    text: "Add jitter to the TTL, or let one request rebuild the key while the others keep serving the old value.",
  },
  { at: 7600, kind: "band", text: "──────── redis_cache_stampede · senior ────────" },
  { at: 8300, kind: "blank", text: "" },
  {
    at: 8300,
    kind: "ask",
    text: "Did that land? ✅ knew it (y) · 💡 understood (u) · ❌ couldn't follow (n)",
  },
  { at: 10_300, kind: "prompt", text: "u", typed: true },
  { at: 11_100, kind: "tool", text: "devcoach · feedback saved: understood" },
  { at: 11_700, kind: "prompt", text: "" },
];
const LAST = SCRIPT[SCRIPT.length - 1].at;

export default function LessonLoop(): ReactNode {
  const [t, setT] = useState(LAST);
  const [canAnimate, setCanAnimate] = useState(false);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(LAST);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setCanAnimate(true);
    tRef.current = 0;
    setT(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const origin = performance.now() - tRef.current;
    const id = window.setInterval(() => {
      tRef.current = (performance.now() - origin) % LOOP_MS;
      setT(tRef.current);
    }, 40);
    return () => window.clearInterval(id);
  }, [playing]);

  const lastShown = SCRIPT.reduce((n, l, i) => (t >= l.at ? i : n), -1);

  return (
    <figure className={styles.term}>
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.barTitle} aria-hidden="true">
          claude — ~/shop-api
        </span>
        {canAnimate && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={!playing}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
      </div>
      <div className={styles.body} aria-hidden="true">
        {SCRIPT.map((line, i) => {
          const shown = t >= line.at;
          const typedLen = line.typed
            ? Math.min(line.text.length, Math.max(0, Math.floor((t - line.at) / TYPE_MS)))
            : line.text.length;
          const typing = shown && line.kind === "prompt" && (typedLen < line.text.length || i === lastShown);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed script, never reordered
              key={i}
              className={clsx(styles.line, styles[line.kind])}
              style={{ visibility: shown ? "visible" : "hidden" }}
            >
              {line.kind === "tool" && <span className={styles.bullet}>⏺ </span>}
              {line.text.slice(0, typedLen)}
              {typing && <span className={styles.cursor} />}
              {typedLen < line.text.length && (
                <span className={styles.ghost}>{line.text.slice(typedLen)}</span>
              )}
            </div>
          );
        })}
      </div>
      <figcaption className={styles.srOnly}>
        Example session: asked to add a Redis cache, the agent finishes the task; devcoach then adds a
        short lesson on cache stampedes, and the developer answers "understood" with one key.
      </figcaption>
    </figure>
  );
}
