// A short, silent, looping screen recording: a few seconds of the dashboard or a terminal doing
// one thing. It plays only while it is on screen; with "reduce motion" it never starts by itself
// (the poster shows, with a play button and the browser's own controls).
//
//   import Clip from "@site/src/components/Clip";
//
//   <Clip
//     alt="Filtering the lesson list by level"
//     mp4={require("../screenshots/lessons-filter.mp4").default}
//     webm={require("../screenshots/lessons-filter.webm").default}
//     poster={require("../screenshots/lessons-filter.png").default}
//     width={1280}
//     height={800}
//     caption="Type a few letters: the list narrows as you type."
//   />
//
// - `alt`: what the clip shows, for screen readers (the video's name) and when it cannot play.
// - `mp4` (H.264, plays everywhere) and optional `webm` (smaller, tried first); `poster`: the
//   first frame as an image, shown until it plays. Keep clips short (≤ 10 s) and without sound.
// - `width` / `height`: the recording's size in pixels; they reserve the space, so the page never
//   jumps while the clip loads. The clip scales to the column width.
// - `caption`: optional sentence under the frame.
// The frame matches ThemedShot's. A small button pauses and resumes it (keyboard reachable).
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

interface Props {
  alt: string;
  mp4: string;
  webm?: string;
  poster: string;
  width: number;
  height: number;
  caption?: ReactNode;
}

/** "auto": plays while on screen. "still": reduced motion, waits for the reader. */
type Mode = "unknown" | "auto" | "still";

export default function Clip({ alt, mp4, webm, poster, width, height, caption }: Props): ReactNode {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>("unknown");
  const [playing, setPlaying] = useState(false);
  // The reader paused it: scrolling back into view must not restart it.
  const userPaused = useRef(false);

  const play = useCallback(() => {
    // play() rejects when the browser refuses (power saving, a detached element): stay paused.
    video.current?.play().catch(() => {});
  }, []);

  // Reduced motion is read once on mount and followed if the reader changes it.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMode(query.matches ? "still" : "auto");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Turning reduced motion on while it plays stops it.
  useEffect(() => {
    if (mode === "still") video.current?.pause();
  }, [mode]);

  // Normal motion: play while at least half of it is on screen, pause when it leaves.
  useEffect(() => {
    const el = video.current;
    if (!el || mode !== "auto" || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) el.pause();
        else if (!userPaused.current) play();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, play]);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      userPaused.current = false;
      play();
    } else {
      userPaused.current = true;
      el.pause();
    }
  };

  const still = mode === "still";
  return (
    <figure className={styles.clip}>
      <div className={styles.frame}>
        <video
          ref={video}
          className={styles.video}
          width={width}
          height={height}
          style={{ aspectRatio: `${width} / ${height}` }}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          controls={still}
          aria-label={alt}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          {webm && <source src={webm} type="video/webm" />}
          <source src={mp4} type="video/mp4" />
          {alt}
        </video>
        {still && !playing && (
          <button
            type="button"
            className={styles.big}
            onClick={() => {
              userPaused.current = false;
              play();
            }}
            aria-label={`Play: ${alt}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 5.5v13l10.5-6.5Z" />
            </svg>
          </button>
        )}
        {mode === "auto" && (
          <button
            type="button"
            className={styles.toggle}
            onClick={toggle}
            aria-label={playing ? `Pause: ${alt}` : `Play: ${alt}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5Z" />}
            </svg>
          </button>
        )}
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
