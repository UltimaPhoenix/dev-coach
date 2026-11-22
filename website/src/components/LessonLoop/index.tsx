// The docs home's demo: a terminal that plays the coaching loop — a task, the agent's reply, the
// lesson card devcoach adds, a one-key answer. Every line is laid out from the first frame
// (unrevealed ones are only hidden), so playback never shifts the page. The server-rendered
// frame is the last one: without JS, or with reduced motion, the whole loop is there at rest.
// With JS and motion allowed the terminal starts EMPTY and fills in: the stylesheet keeps the
// server-rendered card out of sight until this component takes over (`data-live`), so the
// finished card never flashes before the first keystroke. It plays only while it is on screen
// and the tab is visible, and renders only when a line or a typed letter changes.
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

const lastShownAt = (t: number) => SCRIPT.reduce((n, l, i) => (t >= l.at ? i : n), -1);
const typedAt = (line: Line, t: number) =>
  line.typed ? Math.min(line.text.length, Math.max(0, Math.floor((t - line.at) / TYPE_MS))) : line.text.length;
/** What the screen shows at `t`: the last line revealed and how much of each typed line. */
const frameKey = (t: number) => `${lastShownAt(t)}:${SCRIPT.map((l) => (l.typed ? typedAt(l, t) : "")).join(",")}`;

export default function LessonLoop(): ReactNode {
  const [t, setT] = useState(LAST);
  const [canAnimate, setCanAnimate] = useState(false);
  const [playing, setPlaying] = useState(false);
  // False in the server-rendered markup; true once this component decides what to show.
  const [live, setLive] = useState(false);
  // The reader can't see it (scrolled away, another tab): it waits, wherever it was.
  const [onScreen, setOnScreen] = useState(true);
  const tRef = useRef(LAST);
  const figure = useRef<HTMLElement>(null);

  // On mount: with motion allowed, start from the empty prompt; with reduced motion, the whole
  // loop at rest. Followed if the reader changes the setting while the page is open.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (from: number | null) => {
      const still = query.matches;
      setCanAnimate(!still);
      setPlaying(!still);
      const at = still ? LAST : from;
      if (at !== null) {
        tRef.current = at;
        setT(at);
      }
    };
    apply(0);
    setLive(true);
    const onChange = () => apply(null);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = figure.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let visible = true;
    let intersecting = true;
    const update = () => setOnScreen(visible && intersecting);
    // "On screen" stops a fifth short of the bottom edge: on a phone the terminal peeks in under
    // the first screen, and playing there would have it half done by the time it is scrolled to.
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        update();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      update();
    };
    observer.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing || !onScreen) return;
    const origin = performance.now() - tRef.current;
    let shown = frameKey(tRef.current);
    const id = window.setInterval(() => {
      tRef.current = (performance.now() - origin) % LOOP_MS;
      const key = frameKey(tRef.current);
      if (key === shown) return;
      shown = key;
      setT(tRef.current);
    }, 40);
    return () => window.clearInterval(id);
  }, [playing, onScreen]);

  const lastShown = lastShownAt(t);

  return (
    <figure ref={figure} className={styles.term} data-live={live ? "" : undefined}>
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
            aria-label={playing ? "Pause the demo" : "Play the demo"}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
      </div>
      <div className={styles.body} aria-hidden="true">
        {SCRIPT.map((line, i) => {
          const shown = t >= line.at;
          const typedLen = typedAt(line, t);
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
              {typedLen < line.text.length && <span className={styles.ghost}>{line.text.slice(typedLen)}</span>}
            </div>
          );
        })}
      </div>
      <figcaption className="dc-sr-only">
        Example session: asked to add a Redis cache, the agent finishes the task; devcoach then adds a
        short lesson on cache stampedes, and the developer answers "understood" with one key.
      </figcaption>
    </figure>
  );
}
