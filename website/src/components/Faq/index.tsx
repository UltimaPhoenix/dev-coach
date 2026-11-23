// The FAQ from ONE list. The page's question headings, its answers, the index at the top, the
// table of contents and the FAQPage JSON-LD (what search engines quote) are all rendered from the
// same array in docs/faq.mdx, so the structured data can never drift from the visible text.
//
// Usage in the MDX page:
//   export const faq = [{ id, title, items: [{ id, q, a, more: { label, to } }] }];
//   export const toc = faqToc(faq);          // Docusaurus keeps an explicit `toc` export as is
//   <FaqJsonLd groups={faq} />  <FaqIndex groups={faq} />  <FaqSections groups={faq} />
//
// An answer is plain text with four inline marks: `code`, **bold**, *italic* and [text](/path).
// The JSON-LD carries the same text with the marks removed: exactly what the reader sees.
import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import { Fragment, type ReactNode } from "react";
import styles from "./styles.module.css";

export interface FaqItem {
  /** The heading id: keep it stable, other pages and search results link to it. */
  id: string;
  q: string;
  /** Short sentences: the first answers the question in 20 words or fewer, none runs past 25. */
  a: string;
  /** The page that owns the topic. */
  more: { label: string; to: string };
}

export interface FaqGroup {
  id: string;
  title: string;
  items: FaqItem[];
}

interface Token {
  kind: "text" | "code" | "strong" | "em" | "link";
  text: string;
  href?: string;
}

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: source.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "strong", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "em", text: m[3] });
    else out.push({ kind: "link", text: m[4], href: m[5] });
    last = at + m[0].length;
  }
  if (last < source.length) out.push({ kind: "text", text: source.slice(last) });
  return out;
}

/** The answer as the reader sees it, without marks: what goes into the JSON-LD. */
export function plainText(source: string): string {
  return tokenize(source)
    .map((t) => t.text)
    .join("");
}

function Inline({ source }: { source: string }): ReactNode {
  return tokenize(source).map((t, i) => {
    const key = `${i}-${t.kind}`;
    switch (t.kind) {
      case "code":
        return <code key={key}>{t.text}</code>;
      case "strong":
        return <strong key={key}>{t.text}</strong>;
      case "em":
        return <em key={key}>{t.text}</em>;
      case "link":
        return (
          <Link key={key} to={t.href}>
            {t.text}
          </Link>
        );
      default:
        return t.text;
    }
  });
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The page's table of contents: one entry per group (level 2) and per question (level 3). */
export function faqToc(groups: FaqGroup[]): { value: string; id: string; level: number }[] {
  return groups.flatMap((g) => [
    { value: escapeHtml(g.title), id: g.id, level: 2 },
    ...g.items.map((item) => ({ value: escapeHtml(plainText(item.q)), id: item.id, level: 3 })),
  ]);
}

/** schema.org FAQPage: every question, with the answer text exactly as the page shows it. */
export function FaqJsonLd({ groups }: { groups: FaqGroup[] }): ReactNode {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) =>
      g.items.map((item) => ({
        "@type": "Question",
        name: plainText(item.q),
        acceptedAnswer: { "@type": "Answer", text: plainText(item.a) },
      })),
    ),
  };
  return (
    <Head>
      <script type="application/ld+json">{JSON.stringify(data).replace(/</g, "\\u003c")}</script>
    </Head>
  );
}

/** Every question at a glance, grouped, each one a link to its answer. */
export function FaqIndex({ groups }: { groups: FaqGroup[] }): ReactNode {
  return (
    <nav className={styles.index} aria-label="Questions on this page">
      {groups.map((g) => (
        <div key={g.id} className={styles.group}>
          <Link className={styles.groupTitle} to={`#${g.id}`}>
            {g.title}
          </Link>
          <ul className={styles.list}>
            {g.items.map((item) => (
              <li key={item.id}>
                <Link to={`#${item.id}`}>{plainText(item.q)}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The groups: an h2 per group, an h3 per question, its answer, then where to read more. No wrapper
 * elements, so the headings stay direct children of the page's `.markdown` and get its spacing.
 */
export function FaqSections({ groups }: { groups: FaqGroup[] }): ReactNode {
  return groups.map((g) => (
    <Fragment key={g.id}>
      <Heading as="h2" id={g.id}>
        {g.title}
      </Heading>
      {g.items.map((item) => (
        <Fragment key={item.id}>
          <Heading as="h3" id={item.id}>
            {plainText(item.q)}
          </Heading>
          <p className={styles.answer}>
            <Inline source={item.a} />
          </p>
          <p className={styles.more}>
            <Link to={item.more.to}>{item.more.label}</Link>
          </p>
        </Fragment>
      ))}
    </Fragment>
  ));
}
