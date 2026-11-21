// A tall screenshot, shown from its top: on a wide screen the first screen of the capture is
// visible and a button shows the rest in place (and folds it again). The dashboard's lesson and
// settings pages are two or three screens long; left at full height they push the text they
// illustrate far down the guide. On a phone the capture is small enough to show whole, so nothing
// is folded there, and a capture that already fits gets no button.
import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./styles.module.css";

interface Props {
  children: ReactNode;
  /** The button's text; say what the rest shows when it is not obvious. */
  label?: string;
}

export default function Peek({ children, label = "Show the whole screen" }: Props): ReactNode {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Until measured (server render, first paint) assume the capture is taller than the fold.
  const [folds, setFolds] = useState(true);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const box = content.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    // Only a folded box can tell whether its content overflows; an open one keeps its button.
    const measure = () => {
      if (!openRef.current) setFolds(box.scrollHeight > box.clientHeight + 1);
    };
    // The box resizes with the viewport; its children when a lazy image loads or a tab shows it.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    setOpen(!open);
    // Folding a tall capture moves the button up the page: keep it on screen for whoever pressed it.
    if (open) requestAnimationFrame(() => button.current?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <div className={clsx(styles.peek, open && styles.open)}>
      <div id={id} ref={content} className={styles.content}>
        {children}
      </div>
      {folds && (
        <div className={styles.more}>
          <button
            ref={button}
            type="button"
            className="button button--secondary button--sm"
            aria-expanded={open}
            aria-controls={id}
            onClick={toggle}
          >
            {open ? "Show less" : label} <span aria-hidden="true">{open ? "↑" : "↓"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
