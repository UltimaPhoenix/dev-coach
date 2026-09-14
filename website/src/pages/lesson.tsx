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
import { useCallback, useEffect, useState } from "react";
import {
  decodeShareCode,
  extractShareCodeCandidates,
  renderShareMarkdownFile,
  SHARE_CODE_PREFIX,
  ShareCodeError,
  type SharedLesson,
  sharedLessonFilename,
} from "../lib/shareCode";
import styles from "./lesson.module.css";

const DEFAULT_PORT = 7860;
const PORT_KEY = "devcoach-port";
// Node's default max header size is 16 KB: longer codes can't ride a query string.
const MAX_LINK_CODE = 12_000;
const PING_TIMEOUT_MS = 1500;

type Status = "reading" | "empty" | "ready" | "error";
type Dashboard = "unknown" | "up" | "down";

function render(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false, breaks: true, gfm: true }) as string);
}

function readPort(): number {
  try {
    const v = Number(localStorage.getItem(PORT_KEY));
    return Number.isInteger(v) && v > 0 && v < 65536 ? v : DEFAULT_PORT;
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
  const [dashboard, setDashboard] = useState<Dashboard>("unknown");
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");

  // Decode whatever the fragment holds (and again whenever it changes).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
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
        if (cancelled) return;
        setCode(raw);
        setLesson(payload);
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
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

  useEffect(() => setPort(readPort()), []);

  // Best-effort "is a dashboard running?" — the button works regardless.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    setDashboard("unknown");
    fetch(`http://127.0.0.1:${port}/ping`, {
      mode: "cors",
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok?: boolean }) => !cancelled && setDashboard(j?.ok ? "up" : "down"))
      .catch(() => !cancelled && setDashboard("down"));
    return () => {
      cancelled = true;
    };
  }, [status, port]);

  const changePort = useCallback((value: string) => {
    const v = Number(value);
    if (!Number.isInteger(v) || v <= 0 || v >= 65536) return;
    setPort(v);
    try {
      localStorage.setItem(PORT_KEY, String(v));
    } catch {
      /* private mode */
    }
  }, []);

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
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

        {status === "ready" && lesson && (
          <>
            <p className={styles.eyebrow}>Someone shared a devcoach lesson with you</p>
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
                <p className={`${styles.status} ${dashboard === "up" ? styles.up : ""}`}>
                  {dashboard === "up" && "✓ Your devcoach dashboard is running — one click adds this lesson to your log."}
                  {dashboard === "down" && (
                    <>
                      No dashboard answered on 127.0.0.1:{port}. Start it with <code>devcoach ui</code> (or{" "}
                      <code>/devcoach:ui</code> in Claude Code), then click Import.
                    </>
                  )}
                  {dashboard === "unknown" && "Looking for your dashboard…"}
                </p>
                <div className={styles.buttons}>
                  {!tooLongForLink && (
                    <a className={`button button--primary button--block ${styles.mainButton}`} href={importUrl}>
                      ＋ Import into my devcoach
                    </a>
                  )}
                  <button
                    type="button"
                    className="button button--secondary button--block"
                    onClick={copyCode}
                  >
                    {copied ? "✓ Copied" : "Copy code"}
                  </button>
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
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(e) => changePort(e.target.value)}
                    aria-label="Dashboard port"
                  />
                </label>
                {tooLongForLink && (
                  <p className={styles.hint}>
                    This lesson is too long for a one-click link — copy the code and paste it into your
                    dashboard's <strong>＋ Import</strong> box, or tell your agent{" "}
                    <em>"import this devcoach lesson"</em> followed by the code.
                  </p>
                )}
                <p className={styles.hint}>
                  No devcoach yet? <Link to="/install">Install it</Link> in a minute — or paste the code into
                  your agent: <em>import this devcoach lesson:</em> <code>{SHARE_CODE_PREFIX}…</code>
                </p>
              </div>
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
