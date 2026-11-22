// A tall screenshot shown from its top: the first part of the picture is visible and a button shows
// the rest in place (and folds it again). The dashboard's Settings page is four screens of capture,
// mostly the notebook; at full height it would push the text it illustrates far down the guide.
//
//   import Peek from "@site/src/components/Peek";
//
//   <Peek show={0.37} label="Show the coaching notebook">
//     <ThemedShot alt="…" light={…} dark={…} />
//   </Peek>
//
// - `show`: the share of the picture's height that stays visible when folded, from 0 to 1.
// - `label`: the button's text; say what the rest shows.
// The fold is measured on the picture itself (the first visible image inside), so whatever sits
// above it (ThemedShot's theme buttons) and the picture's proportions are taken as they are. Until
// that measurement, on the server and without JavaScript, nothing is folded: the whole picture shows
// and there is no button. A picture whose hidden part would be a sliver is not folded either.
import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./styles.module.css";

interface Props {
  children: ReactNode;
  /** Share of the picture's height shown while folded, from 0 to 1. */
  show: number;
  /** The button's text; say what the rest shows when it is not obvious. */
  label?: string;
}

/** Folding must hide at least this much of the picture to be worth a button. */
const MIN_HIDDEN_PX = 80;

export default function Peek({ children, show, label = "Show the whole screen" }: Props): ReactNode {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The fold, in pixels from the top of the box; null: not measured, or not worth folding.
  const [fold, setFold] = useState<number | null>(null);
  const share = Math.min(1, Math.max(0, show));

  useEffect(() => {
    const box = content.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // ThemedShot keeps one image per theme and hides the other: measure the one on screen.
      const picture = [...box.querySelectorAll("img")].find(
        (img) => img.getClientRects().length > 0 && img.offsetHeight > 0,
      );
      if (!picture) return setFold(null);
      const top = picture.getBoundingClientRect().top - box.getBoundingClientRect().top;
      const at = Math.round(top + picture.offsetHeight * share);
      setFold(box.scrollHeight - at >= MIN_HIDDEN_PX ? at : null);
    };
    // The box resizes with the column; its children when a lazy image loads or the theme changes.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [share]);

  const folds = fold !== null;
  const folded = folds && !open;

  const toggle = () => {
    setOpen(!open);
    // Folding a tall capture moves the button up the page: keep it on screen for whoever pressed it.
    if (open) requestAnimationFrame(() => button.current?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <div className={clsx(styles.peek, folded && styles.folded)}>
      <div
        id={id}
        ref={content}
        className={styles.content}
        style={folded ? { maxHeight: fold } : undefined}
      >
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
