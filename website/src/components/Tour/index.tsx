// The docs home's "See it": four tabs, each one screen of devcoach with one sentence — the lesson
// card where you work (in the terminal and in the desktop app), the lessons log, the knowledge
// map, and a course. The Courses tab can run the real demo course in place: the document the
// site emits at /demo/course.html (docusaurus.config.ts), framed and driven the way the
// dashboard does it (assets/static/course-viewer.js).
import Link from "@docusaurus/Link";
import { useColorMode } from "@docusaurus/theme-common";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { usePluginData } from "@docusaurus/useGlobalData";
import ThemedImage from "@theme/ThemedImage";
import clsx from "clsx";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DemoCourse as DemoCourseData } from "../../../docusaurus.config";
import { Zoomable } from "../ThemedShot";
import styles from "./styles.module.css";

export interface Shot {
  light: string;
  dark: string;
}
interface Props {
  /** Resolved screenshot URLs (pass via require(...).default from the MDX page). */
  shots: { lessons: Shot; map: Shot; course: Shot };
}

const TABS = [
  { id: "agent", title: "In your agent", blurb: "The lesson card, where you already work" },
  { id: "lessons", title: "Lessons", blurb: "Every lesson kept, with where it happened" },
  { id: "map", title: "Knowledge map", blurb: "What devcoach thinks you know, topic by topic" },
  { id: "courses", title: "Courses", blurb: "A lesson you couldn't follow, step by step" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const LESSON = {
  reply: "Done. fetchUsers now returns the users it could load and lists the ones that failed.",
  title: "Promise.allSettled vs Promise.all — don't let one failure sink the batch",
  meta: "TypeScript · Mid",
  before: [
    "Promise.all rejects the moment any promise rejects, and you lose the results of the ones that already succeeded. For independent work (fan-out fetches, batch writes) that's usually the wrong default.",
    "Promise.allSettled always resolves, giving you a status for every promise:",
  ],
  code: 'const results = await Promise.allSettled(ids.map(fetchUser));\nconst ok = results.filter(r => r.status === "fulfilled").map(r => r.value);',
  after:
    "Use Promise.all when the tasks are genuinely all-or-nothing; reach for allSettled when partial success is meaningful and you want to report failures.",
  tip: "for work that should cancel its siblings on failure, a shared AbortController gives you all-or-nothing with prompt cancellation.",
  band: "🎓 devcoach",
  foot: "typescript · mid",
  ask: "Did that land? ✅ knew it (y) · 💡 understood (u) · ❌ couldn't follow (n)",
};

/** One of the card's rules: the line drawing is decoration, only its words are read. */
function Band({ className, text }: { className: string; text: string }): ReactNode {
  return (
    <p className={className}>
      <span aria-hidden="true">──────── </span>
      {text}
      <span aria-hidden="true"> ────────</span>
    </p>
  );
}

function TerminalLesson(): ReactNode {
  return (
    <div className={clsx(styles.frame, styles.term)}>
      <div className={styles.bar}>Claude Code · terminal</div>
      <div className={styles.termBody}>
        <p className={styles.termReply}>
          <span className={styles.termDot}>⏺ </span>
          {LESSON.reply}
        </p>
        <div className={styles.termCard}>
          <Band className={styles.termBand} text={LESSON.band} />
          <p>
            <strong>{LESSON.title}</strong> · {LESSON.meta}
          </p>
          {LESSON.before.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {/* Focusable: on a phone the line scrolls sideways, and a keyboard must reach it. */}
          <pre className={styles.termCode} tabIndex={0}>
            {LESSON.code}
          </pre>
          <p>{LESSON.after}</p>
          <p>
            💡 <em>Senior tip:</em> {LESSON.tip}
          </p>
          <Band className={styles.termBand} text={LESSON.foot} />
        </div>
        <p className={styles.termAsk}>{LESSON.ask}</p>
        <p className={styles.termPrompt}>
          <span>› </span>u
        </p>
      </div>
    </div>
  );
}

function DesktopLesson(): ReactNode {
  return (
    <div className={clsx(styles.frame, styles.app)}>
      <div className={styles.bar}>Claude Code · desktop app</div>
      <div className={styles.appBody}>
        <p className={styles.appReply}>{LESSON.reply}</p>
        <Band className={styles.appBand} text={LESSON.band} />
        <p>
          <strong>{LESSON.title}</strong> · {LESSON.meta}
        </p>
        {LESSON.before.map((text) => (
          <p key={text}>{text}</p>
        ))}
        <pre className={styles.appCode} tabIndex={0}>
          {LESSON.code}
        </pre>
        <p>{LESSON.after}</p>
        <p>
          💡 <em>Senior tip:</em> {LESSON.tip}
        </p>
        <Band className={styles.appBand} text={LESSON.foot} />
        <p>{LESSON.ask}</p>
      </div>
      <div className={styles.appInput}>
        <span>u</span>
      </div>
    </div>
  );
}

/** The lesson card in both hosts, with a switch. The guides reuse it (`caption={false}`). */
export function LessonHosts({ caption = true }: { caption?: boolean }): ReactNode {
  const [host, setHost] = useState<"terminal" | "desktop">("terminal");
  return (
    <>
      <div className={styles.hosts} role="group" aria-label="Where the lesson is shown">
        <button type="button" aria-pressed={host === "terminal"} onClick={() => setHost("terminal")}>
          Terminal
        </button>
        <button type="button" aria-pressed={host === "desktop"} onClick={() => setHost("desktop")}>
          Desktop app
        </button>
      </div>
      {host === "terminal" ? <TerminalLesson /> : <DesktopLesson />}
      {caption && (
        <p className={styles.caption}>
          <span>
            The same card in the terminal and in the desktop app. It appears only when a lesson is due, and
            you set how often. Answer with one key, or just keep working.
          </span>
          <Link to="/usage/coaching#your-first-lesson">Your first lesson →</Link>
        </p>
      )}
    </>
  );
}

/**
 * A dashboard capture in its labelled frame, opening at full size on a click or tap (the guides'
 * zoom). `crop` is how much of the capture shows, as its height over its width (default 16:10):
 * the image scales with the frame, so one number ends the window on the same row at every width.
 */
function Capture({ shot, label, alt, crop }: { shot: Shot; label: string; alt: string; crop?: number }): ReactNode {
  return (
    <div
      className={clsx(styles.frame, styles.capture)}
      style={crop ? ({ "--crop": crop } as CSSProperties) : undefined}
    >
      <div className={styles.bar}>{label}</div>
      <Zoomable alt={alt} light={shot.light} dark={shot.dark}>
        <ThemedImage className={styles.shot} sources={shot} alt={alt} loading="lazy" />
      </Zoomable>
    </div>
  );
}

const HANDSHAKE_MS = 5000;

/** The demo course: its capture, and a button that runs the real document in place. */
export function DemoCourse({ shot }: { shot: Shot }): ReactNode {
  const course = usePluginData("devcoach-demo-course") as DemoCourseData;
  const src = useBaseUrl(course.file);
  const { colorMode } = useColorMode();
  const frame = useRef<HTMLIFrameElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const stepList = useRef<HTMLOListElement>(null);
  const [state, setState] = useState<"still" | "running" | "failed">("still");
  // The frame has loaded / the document has answered (its first report is the handshake).
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(480);
  const [anchor, setAnchor] = useState<string | null>(null);
  const theme = useRef(colorMode);

  // The frame's origin is opaque (sandbox without allow-same-origin): "*" is the only target that
  // reaches it, and the payload is one word.
  const sendTheme = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "devcoach:theme", theme: theme.current }, "*");
  }, []);
  // The site's toggle changes colorMode: tell the running course.
  useEffect(() => {
    theme.current = colorMode;
    sendTheme();
  }, [colorMode, sendTheme]);

  // Focus follows the control that went away: Run hands it to the first step of the list, Close
  // (or a course that did not start) hands it back to Run. Leaving resets the run, so the next
  // one starts on the document's first step.
  const previous = useRef(state);
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (state === "running" && was !== "running") {
      stepList.current?.querySelector("button")?.focus();
    } else if (state !== "running" && was === "running") {
      setAnchor(null);
      setLoaded(false);
      setReady(false);
      setHeight(480);
      runButton.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    if (state !== "running") return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; height?: unknown; anchor?: unknown } | null;
      // The sandboxed frame posts from the opaque origin, which serialises as "null".
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      if (data?.type !== "devcoach:course") return;
      setReady(true);
      const h = Number(data.height);
      if (Number.isFinite(h)) setHeight(Math.min(50_000, Math.max(320, Math.ceil(h))));
      // No anchor: the document shows its first step (no fragment yet).
      setAnchor(typeof data.anchor === "string" ? data.anchor : null);
      // Every report is answered with the theme: the first one is the handshake.
      sendTheme();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state, sendTheme]);

  // The handshake is timed from the frame's load, not from the click: on a slow link the
  // download alone can take longer than the wait, and the bridge answers as soon as it runs.
  useEffect(() => {
    if (state !== "running" || !loaded || ready) return;
    const timer = window.setTimeout(() => setState("failed"), HANDSHAKE_MS);
    return () => window.clearTimeout(timer);
  }, [state, loaded, ready]);

  // A new step starts at its top: bring the frame back into view when it has scrolled above.
  useEffect(() => {
    const el = frame.current;
    if (!anchor || !el || el.getBoundingClientRect().top >= 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [anchor]);

  const go = (step: string) => {
    try {
      // Only `href` is settable on a cross-origin Location; same URL + new fragment is a fragment
      // navigation inside the frame (hashchange, no reload).
      if (frame.current?.contentWindow) frame.current.contentWindow.location.href = `${src}#${step}`;
      setAnchor(step);
    } catch {
      /* the frame is gone or mid-navigation: its next report sets the step */
    }
  };
  const current = anchor ?? course.steps[0]?.anchor;

  if (state !== "running") {
    return (
      <>
        <Capture
          shot={shot}
          label="devcoach ui · Courses"
          alt="A course page in the dashboard: five steps on the left, one step open with an explanation, a load chart and a multiple-choice check"
        />
        <p className={styles.caption}>
          <span>
            A lesson you couldn't follow is kept as the seed of a course: one step at a time, with charts and
            checks. This one is real, and it runs here.
          </span>
          <button ref={runButton} type="button" className="button button--primary button--sm" onClick={() => setState("running")}>
            ▶ Run this course
          </button>
        </p>
        {state === "failed" && (
          <p className={styles.note} role="status">
            The course did not start in this browser. The screenshot shows the same page.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <div className={clsx(styles.frame, styles.course)}>
        <div className={styles.bar}>
          <span>{course.title} · the demo course, running in a sandboxed frame</span>
        </div>
        <div className={styles.courseGrid}>
          {/* Buttons, not links: the document is meant to be read framed (a link could open it on
              its own, outside the sandbox). */}
          <ol ref={stepList} className={styles.steps} aria-label="Course steps">
            {course.steps.map((step, i) => (
              <li key={step.anchor}>
                <button
                  type="button"
                  aria-current={step.anchor === current ? "step" : undefined}
                  onClick={() => go(step.anchor)}
                >
                  <b>
                    {i + 1}. {step.title}
                  </b>
                  <span>{step.kind}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className={styles.docArea}>
            <p className={clsx(styles.loading, ready && "dc-sr-only")} role="status">
              {ready ? "" : "Loading the course…"}
            </p>
            <iframe
              ref={frame}
              className={styles.doc}
              src={src}
              title={`${course.title} (demo course)`}
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              scrolling="no"
              style={{ height }}
              onLoad={() => setLoaded(true)}
            />
          </div>
        </div>
      </div>
      <p className={styles.caption}>
        <span>
          This is the course document itself, the one file your agent writes for you. In the dashboard your
          progress is saved step by step.
        </span>
        <span className={styles.captionActions}>
          <Link to="/usage/courses">Courses →</Link>
          <button type="button" className="button button--secondary button--sm" onClick={() => setState("still")}>
            Close
          </button>
        </span>
      </p>
    </>
  );
}

export default function Tour({ shots }: Props): ReactNode {
  const id = useId();
  const [active, setActive] = useState<TabId>("agent");
  const [vertical, setVertical] = useState(false);
  const tabs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const ids = (tab: TabId) => ({
    tab: `${id}-tab-${tab}`,
    title: `${id}-title-${tab}`,
    blurb: `${id}-blurb-${tab}`,
    panel: `${id}-panel-${tab}`,
  });

  // One column of tabs from 997px (the stylesheet's breakpoint), a 2 × 2 grid under it.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 997px)");
    const apply = () => setVertical(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = TABS[(to + TABS.length) % TABS.length].id;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const panel = (tab: TabId) => ({
    role: "tabpanel",
    id: ids(tab).panel,
    "aria-labelledby": ids(tab).title,
    hidden: active !== tab,
  });

  return (
    <section className={clsx(styles.tour, "dc-wide")} data-dc-tour="">
      {/* Without JavaScript the tabs and buttons do nothing: show every screen, one after another. */}
      <noscript>
        <style>{`[data-dc-tour] [role="tabpanel"][hidden]{display:block}[data-dc-tour] [role="tablist"],[data-dc-tour] [role="group"],[data-dc-tour] .button{display:none}`}</style>
      </noscript>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="devcoach, screen by screen"
        aria-orientation={vertical ? "vertical" : "horizontal"}
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={ids(tab.id).tab}
            className={styles.tab}
            aria-selected={active === tab.id}
            aria-controls={ids(tab.id).panel}
            aria-labelledby={ids(tab.id).title}
            aria-describedby={ids(tab.id).blurb}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <b id={ids(tab.id).title}>{tab.title}</b>
            <span id={ids(tab.id).blurb}>{tab.blurb}</span>
          </button>
        ))}
      </div>
      <div className={styles.panels}>
        <div {...panel("agent")}>
          <LessonHosts />
        </div>
        <div {...panel("lessons")}>
          <Capture
            shot={shots.lessons}
            label="devcoach ui · Lessons"
            alt="The Lessons page of the dashboard: a searchable table of lessons with their level, categories and feedback"
          />
          <p className={styles.caption}>
            <span>
              Every lesson is kept: search, filter by level or feedback, star the ones to revisit, share one with
              a teammate.
            </span>
            <Link to="/usage/web-ui">Web dashboard →</Link>
          </p>
        </div>
        <div {...panel("map")}>
          <Capture
            shot={shots.map}
            crop={0.58}
            label="devcoach ui · Knowledge map"
            alt="The Knowledge Map page of the dashboard: topics grouped by area, each with a confidence bar from 0 to 10"
          />
          <p className={styles.caption}>
            <span>
              Built from your recent projects in one pass. Each lesson is pitched at your level on its topic;
              adjust any score.
            </span>
            <Link to="/usage/coaching#onboarding">How onboarding works →</Link>
          </p>
        </div>
        <div {...panel("courses")}>
          <DemoCourse shot={shots.course} />
        </div>
      </div>
    </section>
  );
}
