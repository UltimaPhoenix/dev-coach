// A grid of small cards for the guides: a choice between a few things, a summary of three facts,
// a map of where to go next. With `to`/`href` the whole card is one link, named by its title alone
// (the body is its description), so a screen reader's list of links stays short. Same look as the
// home's three steps, so the docs read as one site.
import Link from "@docusaurus/Link";
import IconExternalLink from "@theme/Icon/ExternalLink";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useId } from "react";
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
  /** An external URL; the whole card becomes the link, and opens in a new tab. */
  href?: string;
  children?: ReactNode;
}

export function Card({ title, label, to, href, children }: CardProps): ReactNode {
  const id = useId();
  const link = Boolean(to || href);
  const body = (
    <>
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.title} id={`${id}-title`}>
        {title}
        {to && !href && (
          <span className={styles.arrow} aria-hidden="true">
            {" →"}
          </span>
        )}
        {/* Docusaurus opens an external link in a new tab; its icon is labelled "(opens in new tab)". */}
        {href && <IconExternalLink width={12} height={12} />}
      </span>
      {children && (
        <div className={styles.body} id={link ? `${id}-body` : undefined}>
          {children}
        </div>
      )}
    </>
  );
  if (link) {
    return (
      <Link
        className={clsx(styles.card, styles.link)}
        to={to}
        href={href}
        aria-labelledby={`${id}-title`}
        aria-describedby={children ? `${id}-body` : undefined}
      >
        {body}
      </Link>
    );
  }
  return <div className={styles.card}>{body}</div>;
}
