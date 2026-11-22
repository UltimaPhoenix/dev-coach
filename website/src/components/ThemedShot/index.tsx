import { useColorMode } from "@docusaurus/theme-common";
import useIsBrowser from "@docusaurus/useIsBrowser";
import ThemedImage from "@theme/ThemedImage";
import clsx from "clsx";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import styles from "./styles.module.css";

type Override = "auto" | "light" | "dark";

interface Props {
  /** Accessible description of the screenshot. */
  alt: string;
  /** Resolved URL of the light-theme screenshot (pass via require(...).default). */
  light: string;
  /** Resolved URL of the dark-theme screenshot (pass via require(...).default). */
  dark: string;
}

/** scripts/screenshots.mjs captures at twice the pixel density: half the width is the page's own size. */
const CAPTURE_DENSITY = 2;

/**
 * A screenshot that follows the site's color mode by default, while still letting
 * the reader force Light/Dark for that one image — without touching the docs theme.
 *
 * Following the theme is Docusaurus' own ThemedImage (both images server-rendered, CSS keyed off
 * `[data-theme]` shows one, so the first render matches the server's). A forced theme is one
 * plain image. Dark and Light are toggle buttons pressed for the image on screen; "Follow theme"
 * appears only while a theme is forced, and pressing it hands focus to the button now pressed.
 *
 * Activating the image opens it at full size (the dashboard's own size) in a modal <dialog>, in
 * the theme on screen: Escape or Close shuts it and focus returns to the image, the page behind
 * stays put, and a large capture scrolls inside it. The opener is a button laid over the image
 * after hydration only, so without JavaScript the image stays a plain image.
 */
export default function ThemedShot({ alt, light, dark }: Props): ReactNode {
  const [override, setOverride] = useState<Override>("auto");
  const { colorMode } = useColorMode();
  const isBrowser = useIsBrowser();
  const buttons = useRef<Record<"light" | "dark", HTMLButtonElement | null>>({ light: null, dark: null });
  const media = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [zoom, setZoom] = useState<{ src: string; width?: number } | null>(null);
  // Before hydration the site theme is not known to React: no button claims to be pressed (CSS
  // still highlights the one that matches [data-theme]).
  const shown = override !== "auto" ? override : isBrowser ? colorMode : undefined;

  const follow = () => {
    setOverride("auto");
    buttons.current[colorMode]?.focus();
  };

  const openZoom = () => {
    const src = (shown ?? colorMode) === "light" ? light : dark;
    // The image on screen is loaded: its pixel width gives the full size before the copy loads.
    const onScreen = [...(media.current?.querySelectorAll("img") ?? [])].find(
      (img) => img.getClientRects().length > 0,
    );
    const natural = onScreen?.naturalWidth;
    setZoom({ src, width: natural ? natural / CAPTURE_DENSITY : undefined });
  };

  // Open as a modal (the rest of the page goes inert) and hold the page still behind it.
  useEffect(() => {
    const el = dialog.current;
    if (!zoom || !el) return;
    if (!el.open) el.showModal();
    const page = document.documentElement;
    const before = page.style.overflow;
    page.style.overflow = "hidden";
    return () => {
      page.style.overflow = before;
    };
  }, [zoom]);

  // However it closed (Escape, Close, a click beside the image): forget it, focus the image again.
  const onClosed = () => {
    setZoom(null);
    opener.current?.focus();
  };

  return (
    <figure className={styles.shot} data-override={override}>
      <div className={styles.toolbar} role="group" aria-label="Screenshot theme">
        {(["dark", "light"] as const).map((mode) => (
          <button
            key={mode}
            ref={(el) => {
              buttons.current[mode] = el;
            }}
            type="button"
            className={clsx(styles.btn, mode === "dark" ? styles.btnDark : styles.btnLight)}
            aria-pressed={shown === mode}
            onClick={() => setOverride(mode)}
          >
            {mode === "dark" ? "Dark" : "Light"}
          </button>
        ))}
        {override !== "auto" && (
          <button type="button" className={styles.reset} onClick={follow}>
            Follow theme
          </button>
        )}
      </div>
      <div ref={media} className={styles.media}>
        {override === "auto" ? (
          <ThemedImage className={styles.img} sources={{ light, dark }} alt={alt} loading="lazy" />
        ) : (
          <img className={styles.img} src={override === "light" ? light : dark} alt={alt} />
        )}
        {isBrowser && (
          <button
            ref={opener}
            type="button"
            className={styles.zoomOpen}
            aria-haspopup="dialog"
            aria-label={`Enlarge: ${alt}`}
            onClick={openZoom}
          >
            <span className={styles.zoomHint} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M10.5 4a6.5 6.5 0 0 1 5.18 10.43l4.45 4.44-1.26 1.26-4.44-4.45A6.5 6.5 0 1 1 10.5 4Zm0 1.8a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm.9 1.9v2.1h2.1v1.8h-2.1v2.1H9.6v-2.1H7.5V9.8h2.1V7.7Z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      {isBrowser && (
        <dialog
          ref={dialog}
          className={styles.zoom}
          aria-labelledby={titleId}
          onClose={onClosed}
          onClick={(event) => {
            // The dialog fills the window: a click beside the image (not on it, not on the bar) closes it.
            const target = event.target as HTMLElement;
            if (target === event.currentTarget || target.dataset.zoomBody !== undefined) {
              dialog.current?.close();
            }
          }}
        >
          <div className={styles.zoomBar}>
            <span id={titleId} className={styles.zoomTitle}>
              {alt}
            </span>
            {/* The first control in the dialog: showModal() focuses it. */}
            <button type="button" className={styles.zoomClose} onClick={() => dialog.current?.close()}>
              Close
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m6.4 5.1 5.6 5.6 5.6-5.6 1.3 1.3-5.6 5.6 5.6 5.6-1.3 1.3-5.6-5.6-5.6 5.6-1.3-1.3 5.6-5.6-5.6-5.6Z" />
              </svg>
            </button>
          </div>
          {/* Focusable, so the keyboard can scroll a capture larger than the window. */}
          <div
            className={styles.zoomBody}
            data-zoom-body=""
            role="region"
            aria-label="The screenshot at full size"
            tabIndex={0}
          >
            {zoom && (
              <img
                className={styles.zoomImg}
                src={zoom.src}
                alt={alt}
                style={zoom.width ? { width: zoom.width } : undefined}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (!zoom.width) img.style.width = `${img.naturalWidth / CAPTURE_DENSITY}px`;
                }}
              />
            )}
          </div>
        </dialog>
      )}
    </figure>
  );
}
