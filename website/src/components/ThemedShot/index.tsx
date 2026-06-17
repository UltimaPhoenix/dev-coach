import { useState, type ReactNode } from "react";
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

/**
 * A screenshot that follows the site's color mode by default, while still letting
 * the reader force Light/Dark for that one image — without touching the docs theme.
 *
 * Both images are rendered; which one shows is pure CSS keyed off `[data-theme]`
 * (the global Docusaurus mode) and the per-figure `data-override`. Keeping the
 * choice in CSS rather than `useColorMode()` avoids any SSR/hydration mismatch:
 * the server and first client render are identical, and a click only flips an attribute.
 */
export default function ThemedShot({ alt, light, dark }: Props): ReactNode {
  const [override, setOverride] = useState<Override>("auto");

  return (
    <figure className={styles.shot} data-override={override}>
      <div className={styles.toolbar} role="group" aria-label={`${alt} preview theme`}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDark}`}
          onClick={() => setOverride("dark")}
        >
          Dark
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnLight}`}
          onClick={() => setOverride("light")}
        >
          Light
        </button>
        {override !== "auto" && (
          <button type="button" className={styles.reset} onClick={() => setOverride("auto")}>
            Follow theme
          </button>
        )}
      </div>
      <img className={`${styles.img} ${styles.light}`} src={light} alt={alt} loading="lazy" />
      <img className={`${styles.img} ${styles.dark}`} src={dark} alt={alt} loading="lazy" />
    </figure>
  );
}
