// A release timeline: what shipped and when, then what comes next. It is an ordered list of plain
// text, so it reads the same without styles or with a screen reader. Horizontal when its own box is
// wide enough, vertical below that (phones, narrow windows). Dates are written out here, without the
// browser's locale, so the server render and the client render agree.
//
//   <Timeline label="…" caption={<>…</>}>
//   <Stop version="2.1.0" date="2026-09-14" title="Lesson sharing" to="/usage/sharing">One short line.</Stop>
//   <Stop entry="Windows, in one line" title="Windows">…</Stop>
//   <Stop when="Exploring" status="exploring" title="Ideas" to="#exploring">…</Stop>
//   </Timeline>
//
// A stop for something not released yet names its changelog entry (`entry`) instead of a version:
// it reads "next" while the entry is under "Unreleased", and takes the release's version and date
// by itself once that section is renamed at release time (src/lib/changelog.ts).
import Link from "@docusaurus/Link";
import { usePluginData } from "@docusaurus/useGlobalData";
import clsx from "clsx";
import type { ReactNode } from "react";
import { type Changelog, whenShipped } from "../../lib/changelog";
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
  /** A released version, e.g. "2.1.0". Never an unreleased one: use `entry` for that. */
  version?: string;
  /**
   * The changelog entry this stop stands for (the bold lead of its bullet, or its beginning).
   * Version, date and status then come from CHANGELOG.md.
   */
  entry?: string;
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

export function Stop(props: StopProps): ReactNode {
  const changelog = usePluginData("devcoach-changelog") as Changelog;
  const { title, to, children } = props;
  let { version, date, when, status = "shipped" } = props;
  if (props.entry) {
    // An entry the changelog no longer has reads as not released; the site's tests name it.
    const shipped = whenShipped(changelog, props.entry) ?? { status: "next" as const };
    status = shipped.status;
    version = shipped.status === "shipped" ? shipped.version : undefined;
    date = shipped.status === "shipped" ? shipped.date : undefined;
    when = shipped.status === "shipped" ? undefined : "next";
  }
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
