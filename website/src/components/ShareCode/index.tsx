// A share link taken apart: each part labelled with what it is and what it is for. Built from
// src/core/share.ts, where a link is `SHARE_PAGE_URL + "#" + code` and the code is
// `devcoach:lesson:<SHARE_VERSION>:` + base64url(raw DEFLATE(JSON of the payload)). The payload
// shown is the start of a real code (`devcoach share --last` on the demo data), cut with "…".
//
//   import ShareCode from "@site/src/components/ShareCode";
//
//   <ShareCode />
//
// The parts are told apart by number, not only by colour: each one carries a numbered badge that
// matches its line in the legend. The line wraps anywhere, so it never widens a phone's page.
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface Part {
  text: string;
  /** "link": only a link has this part. "code": part of the code itself. */
  kind: "link" | "code";
  title: ReactNode;
  note: ReactNode;
}

const PARTS: Part[] = [
  {
    text: "https://ultimaphoenix.github.io/dev-coach/lesson",
    kind: "link",
    title: "The share page",
    note: "On the docs site. Only a link has this part: the copied text ends with the code alone.",
  },
  {
    text: "#",
    kind: "link",
    title: "The fragment mark",
    note: "Your browser keeps everything after it and never sends it to the site. The page decodes the lesson in your browser.",
  },
  {
    text: "devcoach:lesson:",
    kind: "code",
    title: "What this is",
    note: "Lets devcoach find the code anywhere in a pasted message, a card or a link.",
  },
  {
    text: "1",
    kind: "code",
    title: "The format version",
    note: "A code with a higher number comes from a newer devcoach: yours then asks you to update.",
  },
  {
    text: "fVfbjuPGEf2VgvwQSpEIaTaOEy7GwDgX…",
    kind: "code",
    title: "The lesson",
    note: (
      <>
        Its JSON (below), compressed (raw DEFLATE) and written in base64url: letters, digits, <code>-</code>{" "}
        and <code>_</code> only, so it is safe in a URL.
      </>
    ),
  },
];

function Badge({ n }: { n: number }): ReactNode {
  return (
    <span className={styles.badge} aria-hidden="true">
      {n}
    </span>
  );
}

export default function ShareCode(): ReactNode {
  return (
    <figure className={styles.figure}>
      <div className={styles.box}>
        <p className={styles.strip}>
          {PARTS.map((part, i) => (
            // One group per part, kept on one line with its badge; only the long page address wraps inside.
            <span key={part.text} className={styles.group}>
              <span className={clsx(part.kind === "link" ? styles.link : styles.code, i === 0 && styles.wraps)}>
                {part.text}
              </span>
              <Badge n={i + 1} />
              {/* The code's own separator after the version: part of the code, not a part to explain. */}
              {i === 3 && <span className={styles.sep}>:</span>}
            </span>
          ))}
        </p>
        {/* role="list": Safari drops list semantics from a list styled without bullets. */}
        <ol className={styles.legend} role="list">
          {PARTS.map((part, i) => (
            <li key={part.text}>
              <Badge n={i + 1} />
              <span>
                <strong>{part.title}.</strong> {part.note}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className={styles.caption}>
        A share link, taken apart. Parts 3 to 5 are the code: one line, the same one that ends the copied
        text, about 1 500 to 2 500 characters for the demo lessons.
      </figcaption>
    </figure>
  );
}
