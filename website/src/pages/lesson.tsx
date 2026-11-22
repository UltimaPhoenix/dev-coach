// The receiving end of a devcoach share link:
//   https://ultimaphoenix.github.io/dev-coach/lesson#devcoach:lesson:1:<code>
// The lesson travels in the URL fragment, which browsers never send to the server — this page
// decodes it locally (native DecompressionStream), renders it, and hands it to the visitor's
// own dashboard (127.0.0.1) with one click. Nothing is uploaded anywhere.
import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decodeShareCode,
  extractShareCodeCandidates,
  renderShareMarkdownFile,
  SHARE_CODE_PREFIX,
  ShareCodeError,
  type SharedLesson,
  sharedLessonFilename,
} from "../lib/shareCode";
import { type DashboardState, probeDashboard } from "../lib/dashboardProbe";
import styles from "./lesson.module.css";

const DEFAULT_PORT = 7860;
const PORT_KEY = "devcoach-port";
// Node's default max header size is 16 KB: longer codes can't ride a query string.
const MAX_LINK_CODE = 12_000;
const PING_TIMEOUT_MS = 1500;

type Status = "reading" | "empty" | "ready" | "error";

function render(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false, breaks: true, gfm: true }) as string);
}

/** A TCP port as typed: digits only, 1 to 65535. */
function parsePort(value: string): number | null {
  if (!/^\d{1,5}$/.test(value.trim())) return null;
  const v = Number(value);
  return v > 0 && v < 65536 ? v : null;
}

function readPort(): number {
  try {
    return parsePort(localStorage.getItem(PORT_KEY) ?? "") ?? DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

export default function LessonPage(): ReactNode {
  const [status, setStatus] = useState<Status>("reading");
  const [code, setCode] = useState("");
  const [lesson, setLesson] = useState<SharedLesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState(DEFAULT_PORT);
  // What the port field shows while it is being edited: it becomes the port (and is saved) on
  // Enter or when the field loses focus, and only when it is a valid port.
  const [portDraft, setPortDraft] = useState(String(DEFAULT_PORT));
  const [portFocused, setPortFocused] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardState>("checking");
  const [probeRun, setProbeRun] = useState(0);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");

  // Decode whatever the fragment holds (and again whenever it changes). Each decode has a number:
  // a slower, older one that finishes after a newer one is dropped.
  useEffect(() => {
    let cancelled = false;
    let latest = 0;
    const run = async () => {
      const id = ++latest;
      const stale = () => cancelled || id !== latest;
      let raw: string;
      try {
        raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
      } catch {
        // A malformed percent-escape in the fragment throws URIError — show the paste form, not a spinner.
        setCode("");
        setLesson(null);
        setError("This link is malformed — ask for it again, or paste the code below.");
        setStatus("error");
        return;
      }
      if (!raw) {
        setStatus("empty");
        setLesson(null);
        return;
      }
      setStatus("reading");
      try {
        const payload = await decodeShareCode(raw);
        if (stale()) return;
        setCode(raw);
        setLesson(payload);
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (stale()) return;
        setCode(raw);
        setLesson(null);
        setError(err instanceof ShareCodeError ? err.message : "This code could not be read.");
        setStatus("error");
      }
    };
    void run();
    window.addEventListener("hashchange", run);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", run);
    };
  }, []);

  useEffect(() => {
    const saved = readPort();
    setPort(saved);
    setPortDraft(String(saved));
  }, []);

  // Best-effort "is a dashboard running?" — the Import button works regardless. The probe knows
  // about Safari (cannot probe at all) and Chrome's local-network permission; see lib/dashboardProbe.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    setDashboard("checking");
    probeDashboard(port, AbortSignal.timeout(PING_TIMEOUT_MS), {
      userAgent: navigator.userAgent,
      permissions: navigator.permissions as unknown as
        | { query(d: { name: string }): Promise<{ state: string }> }
        | undefined,
      fetch: (input, init) => fetch(input, init),
      onPrompt: () => !cancelled && setDashboard("needs-permission"),
    }).then((state) => !cancelled && setDashboard(state));
    return () => {
      cancelled = true;
    };
  }, [status, port, probeRun]);
  const retryProbe = useCallback(() => setProbeRun((n) => n + 1), []);

  const draftPort = parsePort(portDraft);
  // Said once the reader leaves the field (or presses Enter), not on every keystroke.
  const portInvalid = draftPort === null && !portFocused;
  const commitPort = useCallback(() => {
    if (draftPort === null || draftPort === port) return;
    setPort(draftPort);
    try {
      localStorage.setItem(PORT_KEY, String(draftPort));
    } catch {
      /* private mode */
    }
  }, [draftPort, port]);

  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  }, [code]);

  const submitPaste = useCallback(async () => {
    const candidates = extractShareCodeCandidates(paste);
    let lastError = "Nothing in that text looks like a devcoach lesson code.";
    for (const candidate of candidates) {
      try {
        await decodeShareCode(candidate);
        window.location.hash = candidate;
        return;
      } catch (err) {
        lastError = err instanceof ShareCodeError ? err.message : lastError;
      }
    }
    setError(lastError);
    setStatus("error");
  }, [paste]);

  const downloadMarkdown = useCallback(() => {
    if (!lesson) return;
    const blob = new Blob([renderShareMarkdownFile(lesson)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sharedLessonFilename(lesson);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [lesson]);

  const importUrl = `http://127.0.0.1:${port}/lessons/import?code=${encodeURIComponent(code)}`;
  const tooLongForLink = code.length > MAX_LINK_CODE;

  return (
    <Layout title="A lesson shared with you" description="Someone shared a devcoach lesson with you.">
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Someone shared a devcoach lesson with you" />
        <meta
          property="og:description"
          content="Open the link to read the lesson and add it to your own devcoach in one click. The lesson never leaves your browser."
        />
      </Head>
      <main className={styles.wrap}>
        {status === "reading" && <p className={styles.eyebrow}>Reading the lesson…</p>}
        <noscript>
          <p className={styles.hint}>
            This page reads the lesson in your browser, which needs JavaScript. Without it, copy the whole
            link and run <code>devcoach import</code> with it in your clipboard, or paste it into your
            dashboard's <strong>＋ Import</strong> box.
          </p>
        </noscript>

        {status === "ready" && lesson && (
          <>
            <p className={styles.eyebrow}>
              {lesson.shared_by ? `${lesson.shared_by} shared` : "Someone shared"} a devcoach lesson with you
            </p>
            <div className={styles.layout}>
              <article className={styles.card}>
                <div className={styles.titleRow}>
                  <h1 className={styles.title}>{lesson.lesson.title}</h1>
                  <span className={`${styles.level} ${styles[lesson.lesson.level] ?? ""}`}>{lesson.lesson.level}</span>
                </div>
                <div className={styles.meta}>
                  <span>
                    🏷 <span className={styles.topic}>{lesson.lesson.topic_id}</span>
                  </span>
                  {lesson.lesson.categories.map((c) => (
                    <span key={c} className={styles.chip}>
                      {c}
                    </span>
                  ))}
                  <span>
                    🤝 shared by <strong>{lesson.shared_by ?? "anonymous"}</strong> · {lesson.shared_at.slice(0, 10)}
                  </span>
                </div>
                <div className={styles.tldr}>
                  <p className={styles.tldrLabel}>TL;DR</p>
                  {/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdown sanitized by DOMPurify */}
                  <div dangerouslySetInnerHTML={{ __html: render(lesson.lesson.summary) }} />
                </div>
                {lesson.lesson.body && (
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown sanitized by DOMPurify
                  <div className={`markdown ${styles.body}`} dangerouslySetInnerHTML={{ __html: render(lesson.lesson.body) }} />
                )}
                {lesson.lesson.task_context && (
                  <div className={styles.context}>
                    <strong>Context:</strong> {lesson.lesson.task_context}
                  </div>
                )}
              </article>

              <aside className={styles.aside}>
                <div className={styles.panel}>
                  <p className={styles.panelTitle}>Add it to your devcoach</p>
                  <p className={`${styles.status} ${dashboard === "up" ? styles.up : ""}`} role="status">
                    {dashboard === "checking" && "Looking for your dashboard…"}
                    {dashboard === "up" &&
                      "✓ Your devcoach dashboard is running — one click adds this lesson to your log."}
                    {dashboard === "down" && (
                      <>
                        No dashboard answered on 127.0.0.1:{port}. Start it with <code>devcoach ui</code> (or{" "}
                        <code>/devcoach:ui</code> in Claude Code), check the port, then{" "}
                        <button type="button" className={styles.retry} onClick={retryProbe}>
                          retry the check
                        </button>
                        . Import works as soon as it is up.
                      </>
                    )}
                    {dashboard === "needs-permission" &&
                      "Your browser is asking whether this page may reach your local network — allow it to enable the check. Import works either way."}
                    {dashboard === "blocked-permission" && (
                      <>
                        Your browser blocks this page from reaching local services, so it cannot see your
                        dashboard (Chrome: click the icon left of the address bar → <em>Local network access</em>{" "}
                        → Allow, then{" "}
                        <button type="button" className={styles.retry} onClick={retryProbe}>
                          retry
                        </button>
                        ). Import still works if the dashboard is running.
                      </>
                    )}
                    {dashboard === "unsupported" && (
                      <>
                        Safari doesn't let this page check whether your dashboard is running. If it is (
                        <code>devcoach ui</code>, or <code>/devcoach:ui</code> in Claude Code), Import works as
                        usual — otherwise use Copy code or Download .devcoach.md.
                      </>
                    )}
                  </p>
                  <div className={styles.buttons}>
                    {!tooLongForLink && (
                      <a className={`button button--primary button--block ${styles.mainButton}`} href={importUrl}>
                        ＋ Import into my devcoach
                      </a>
                    )}
                    <button type="button" className="button button--secondary button--block" onClick={copyCode}>
                      {copied ? "✓ Copied" : "Copy code"}
                    </button>
                    <span className="dc-sr-only" role="status">
                      {copied ? "Code copied" : ""}
                    </span>
                    <button
                      type="button"
                      className="button button--secondary button--block"
                      onClick={downloadMarkdown}
                      title="Download as a .devcoach.md file (importable by devcoach, renders on GitHub)"
                    >
                      ⬇ Download .devcoach.md
                    </button>
                  </div>
                  <label className={styles.portField}>
                    Dashboard port
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={portDraft}
                      onChange={(e) => {
                        setPortDraft(e.target.value);
                        setPortFocused(true);
                      }}
                      onFocus={() => setPortFocused(true)}
                      onBlur={() => {
                        setPortFocused(false);
                        commitPort();
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        setPortFocused(false);
                        commitPort();
                      }}
                      aria-invalid={portInvalid}
                      aria-describedby={portInvalid ? "dc-port-error" : undefined}
                    />
                  </label>
                  {portInvalid && (
                    <p id="dc-port-error" className={styles.portError}>
                      A port is a number from 1 to 65535. The check keeps using {port}.
                    </p>
                  )}
                  {tooLongForLink && (
                    <p className={styles.hint}>
                      This lesson is too long for a one-click link — copy the code and paste it into your
                      dashboard's <strong>＋ Import</strong> box, or tell your agent{" "}
                      <em>"import this devcoach lesson"</em> followed by the code.
                    </p>
                  )}
                  <p className={styles.hint}>
                    Or paste the code into your agent:{" "}
                    <em>import this devcoach lesson:</em> <code>{SHARE_CODE_PREFIX}…</code>
                  </p>
                  <p className={styles.hint}>
                    <Link to="/usage/sharing">What is this?</Link> — how devcoach lessons are shared, what
                    travels, and what never does.
                  </p>
                </div>
                {/* No dashboard answered (or the browser can't tell): this visitor may not have devcoach
                    at all — a shared lesson is how many people first meet it. It sits below the import panel:
                    someone who already has devcoach came here for Import. */}
                {dashboard !== "up" && dashboard !== "checking" && (
                  <div className={`${styles.panel} ${styles.newcomer}`}>
                    <p className={styles.panelTitle}>New to devcoach?</p>
                    <p className={styles.newcomerText}>
                      This lesson came from devcoach: when your AI agent finishes a task, it teaches you one
                      thing from it that you don't know yet. Free and 100% local.
                    </p>
                    <div className={styles.buttons}>
                      <Link className={`button button--primary button--block ${styles.mainButton}`} to="/install">
                        Install devcoach
                      </Link>
                      <Link className="button button--secondary button--block" to="/">
                        See how it works
                      </Link>
                    </div>
                    <p className={styles.hint}>Then come back: this link keeps the lesson, ready to import.</p>
                  </div>
                )}
              </aside>
            </div>
            <p className={styles.footer}>
              made with{" "}
              <Link to="/">
                <span className="devcoach-wm">
                  dev<span>coach</span>
                </span>
              </Link>{" "}
              · nothing was uploaded — the lesson lives in this link
            </p>
          </>
        )}

        {(status === "empty" || status === "error") && (
          <>
            <p className={styles.eyebrow}>Read a shared devcoach lesson</p>
            <div className={styles.card}>
              {status === "error" && <div className={styles.error}>{error}</div>}
              <p>
                A devcoach share link carries the whole lesson after the <code>#</code>. Paste the code, the link,
                or the whole shared text below to read it here — nothing is sent anywhere.
              </p>
              <textarea
                className={styles.paste}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="devcoach:lesson:1:…"
                aria-label="Shared lesson code"
              />
              <button type="button" className="button button--primary" onClick={() => void submitPaste()}>
                Read the lesson
              </button>
              <p className={styles.hint}>
                Have devcoach installed? Paste the same text into the dashboard's <strong>＋ Import</strong> box, run{" "}
                <code>devcoach import</code> with it in your clipboard, or tell your agent{" "}
                <em>"import this devcoach lesson"</em>.
              </p>
            </div>
          </>
        )}
      </main>
    </Layout>
  );
}
