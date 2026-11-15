// A grid of small cards for the guides: a choice between a few things, a summary of three facts,
// a map of where to go next. With `to`/`href` the whole card is one link. Same look as the home's
// three steps, so the docs read as one site.
import Link from "@docusaurus/Link";
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function Cards({ children, columns }: { children: ReactNode; columns?: 2 | 3 | 4 }): ReactNode {
  return <div className={clsx(styles.cards, columns && styles[`cols${columns}`])}>{children}</div>;
}

interface CardProps {
  title: string;
  /** A short tag above the title: a status, a platform, a step number. */
  label?: string;
  /** An internal doc path; the whole card becomes the link. */
  to?: string;
  /** An external URL; the whole card becomes the link. */
  href?: string;
  children?: ReactNode;
}

export function Card({ title, label, to, href, children }: CardProps): ReactNode {
  const body = (
    <>
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.title}>{title}</span>
      {children && <span className={styles.body}>{children}</span>}
    </>
  );
  if (to || href) {
    return (
      <Link className={clsx(styles.card, styles.link)} to={to} href={href}>
        {body}
      </Link>
    );
  }
  return <div className={styles.card}>{body}</div>;
}
