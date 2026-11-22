import { useColorMode } from "@docusaurus/theme-common";
import useIsBrowser from "@docusaurus/useIsBrowser";
import ThemedImage from "@theme/ThemedImage";
import clsx from "clsx";
import { type ReactNode, useRef, useState } from "react";
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
 * Following the theme is Docusaurus' own ThemedImage (both images server-rendered, CSS keyed off
 * `[data-theme]` shows one, so the first render matches the server's). A forced theme is one
 * plain image. Dark and Light are toggle buttons pressed for the image on screen; "Follow theme"
 * appears only while a theme is forced, and pressing it hands focus to the button now pressed.
 */
export default function ThemedShot({ alt, light, dark }: Props): ReactNode {
  const [override, setOverride] = useState<Override>("auto");
  const { colorMode } = useColorMode();
  const isBrowser = useIsBrowser();
  const buttons = useRef<Record<"light" | "dark", HTMLButtonElement | null>>({ light: null, dark: null });
  // Before hydration the site theme is not known to React: no button claims to be pressed (CSS
  // still highlights the one that matches [data-theme]).
  const shown = override !== "auto" ? override : isBrowser ? colorMode : undefined;

  const follow = () => {
    setOverride("auto");
    buttons.current[colorMode]?.focus();
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
      {override === "auto" ? (
        <ThemedImage className={styles.img} sources={{ light, dark }} alt={alt} loading="lazy" />
      ) : (
        <img className={styles.img} src={override === "light" ? light : dark} alt={alt} />
      )}
    </figure>
  );
}
