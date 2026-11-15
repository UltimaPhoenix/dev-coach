// The docs home's "See it": four tabs, each one screen of devcoach with one sentence — the lesson
// card where you work (in the terminal and in the desktop app), the lessons log, the knowledge
// map, and a course. The Courses tab can run the real demo course in place: the document the
// site emits at /demo/course.html (docusaurus.config.ts), framed and driven the way the
// dashboard does it (assets/static/course-viewer.js).
import Link from "@docusaurus/Link";
import { useColorMode } from "@docusaurus/theme-common";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { usePluginData } from "@docusaurus/useGlobalData";
import clsx from "clsx";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoCourse as DemoCourseData } from "../../../docusaurus.config";
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
  band: "──────── 🎓 devcoach ────────",
  foot: "──────── typescript · mid ────────",
  ask: "Did that land? ✅ knew it (y) · 💡 understood (u) · ❌ couldn't follow (n)",
};

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
          <p className={styles.termBand}>{LESSON.band}</p>
          <p>
            <strong>{LESSON.title}</strong> · {LESSON.meta}
          </p>
          {LESSON.before.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <pre className={styles.termCode}>{LESSON.code}</pre>
          <p>{LESSON.after}</p>
          <p>
            💡 <em>Senior tip:</em> {LESSON.tip}
          </p>
          <p className={styles.termBand}>{LESSON.foot}</p>
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
        <h3 className={styles.appBand}>{LESSON.band}</h3>
        <p>
          <strong>{LESSON.title}</strong> · {LESSON.meta}
        </p>
        {LESSON.before.map((text) => (
          <p key={text}>{text}</p>
        ))}
        <pre className={styles.appCode}>{LESSON.code}</pre>
        <p>{LESSON.after}</p>
        <p>
          💡 <em>Senior tip:</em> {LESSON.tip}
        </p>
        <h3 className={styles.appBand}>{LESSON.foot}</h3>
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
            The same card wherever your agent runs. It appears only when a lesson is due, and you set how
            often. Answer with one key, or just keep working.
          </span>
          <Link to="/usage/coaching#your-first-lesson">Your first lesson →</Link>
        </p>
      )}
    </>
  );
}

function Capture({ shot, label, alt }: { shot: Shot; label: string; alt: string }): ReactNode {
  return (
    <div className={styles.frame}>
      <div className={styles.bar}>{label}</div>
      {/* Both themes are rendered; CSS keyed off [data-theme] shows one (no hydration mismatch). */}
      <img className={clsx(styles.shot, styles.light)} src={shot.light} alt={alt} loading="lazy" />
      <img className={clsx(styles.shot, styles.dark)} src={shot.dark} alt={alt} loading="lazy" />
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
  const [state, setState] = useState<"still" | "running" | "failed">("still");
  const [height, setHeight] = useState(480);
  const [anchor, setAnchor] = useState<string | null>(null);
  const theme = useRef(colorMode);
  theme.current = colorMode;

  // The frame's origin is opaque (sandbox without allow-same-origin): "*" is the only target that
  // reaches it, and the payload is one word.
  const sendTheme = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "devcoach:theme", theme: theme.current }, "*");
  }, []);
  // The site's toggle changes colorMode: tell the running course.
  useEffect(sendTheme, [colorMode, sendTheme]);

  useEffect(() => {
    if (state !== "running") return;
    let answered = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; height?: unknown; anchor?: unknown } | null;
      if (event.source !== frame.current?.contentWindow || data?.type !== "devcoach:course") return;
      answered = true;
      const h = Number(data.height);
      if (Number.isFinite(h)) setHeight(Math.min(50_000, Math.max(320, Math.ceil(h))));
      if (typeof data.anchor === "string") setAnchor(data.anchor);
      // Every report is answered with the theme: the first one is the handshake.
      sendTheme();
    };
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => !answered && setState("failed"), HANDSHAKE_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [state, sendTheme]);

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
          <button type="button" className="button button--primary button--sm" onClick={() => setState("running")}>
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
          <ol className={styles.steps} aria-label="Course steps">
            {course.steps.map((step, i) => (
              <li key={step.anchor}>
                <a
                  href={`${src}#${step.anchor}`}
                  aria-current={step.anchor === current ? "step" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    go(step.anchor);
                  }}
                >
                  <b>
                    {i + 1}. {step.title}
                  </b>
                  <span>{step.kind}</span>
                </a>
              </li>
            ))}
          </ol>
          <iframe
            ref={frame}
            className={styles.doc}
            src={src}
            title={`${course.title} (demo course)`}
            sandbox="allow-scripts allow-forms"
            style={{ height }}
          />
        </div>
      </div>
      <p className={styles.caption}>
        <span>
          This is the course document itself, the one file devcoach writes for you. In the dashboard your progress
          is saved step by step.
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
  const [active, setActive] = useState<TabId>("agent");
  const tabs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length].id;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className={clsx(styles.tour, "dc-wide")}>
      <div className={styles.tabs} role="tablist" aria-label="devcoach, screen by screen">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`tour-tab-${tab.id}`}
            className={styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`tour-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <b>{tab.title}</b>
            <span>{tab.blurb}</span>
          </button>
        ))}
      </div>
      <div className={styles.panels}>
        <div role="tabpanel" id="tour-panel-agent" aria-labelledby="tour-tab-agent" hidden={active !== "agent"}>
          <LessonHosts />
        </div>
        <div role="tabpanel" id="tour-panel-lessons" aria-labelledby="tour-tab-lessons" hidden={active !== "lessons"}>
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
        <div role="tabpanel" id="tour-panel-map" aria-labelledby="tour-tab-map" hidden={active !== "map"}>
          <Capture
            shot={shots.map}
            label="devcoach ui · Knowledge map"
            alt="The Knowledge Map page of the dashboard: topics grouped by area, each with a confidence bar from 0 to 10"
          />
          <p className={styles.caption}>
            <span>
              Built from your project history in one pass. Lessons skip what you already know; adjust any score.
            </span>
            <Link to="/usage/coaching#onboarding">How onboarding works →</Link>
          </p>
        </div>
        <div role="tabpanel" id="tour-panel-courses" aria-labelledby="tour-tab-courses" hidden={active !== "courses"}>
          <DemoCourse shot={shots.course} />
        </div>
      </div>
    </section>
  );
}
