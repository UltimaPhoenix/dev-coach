// A release timeline: what shipped and when, then what comes next. It is an ordered list of plain
// text, so it reads the same without styles or with a screen reader. Horizontal when its own box is
// wide enough, vertical below that (phones, narrow windows). Dates are written out here, without the
// browser's locale, so the server render and the client render agree.
//
//   <Timeline label="…" caption={<>…</>}>
//   <Stop version="2.1.0" date="2026-09-14" title="Lesson sharing" to="/usage/sharing">One short line.</Stop>
//   <Stop version="2.8.0" when="Next" status="next" title="Windows">…</Stop>
//   <Stop when="Exploring" status="exploring" title="Ideas" to="#exploring">…</Stop>
//   </Timeline>
import Link from "@docusaurus/Link";
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function Timeline({ label, caption, children }: { label: string; caption?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <figure className={styles.timeline}>
      <ol className={styles.list} aria-label={label}>
        {children}
      </ol>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}

type Status = "shipped" | "next" | "exploring";

interface StopProps {
  title: string;
  /** A released or announced version, e.g. "2.1.0". */
  version?: string;
  /** The release date, ISO `YYYY-MM-DD`. */
  date?: string;
  /** A word in place of a date for what has not shipped: "Next", "Exploring". */
  when?: string;
  /** shipped (filled dot, solid rail) · next (hollow dot) · exploring (dashed). */
  status?: Status;
  /** An internal doc path or a `#anchor` on the page; the title becomes the link. */
  to?: string;
  children?: ReactNode;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function Stop({ title, version, date, when, status = "shipped", to, children }: StopProps): ReactNode {
  return (
    <li className={clsx(styles.stop, styles[status])}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.meta}>
        {version && <span className={styles.version}>{version}</span>}
        {date && <time dateTime={date}>{formatDate(date)}</time>}
        {when && <span>{when}</span>}
      </span>
      {to ? (
        <Link className={clsx(styles.title, styles.link, to.startsWith("#") && styles.down)} to={to}>
          {title}
        </Link>
      ) : (
        <span className={styles.title}>{title}</span>
      )}
      {children && <span className={styles.text}>{children}</span>}
    </li>
  );
}
