// What the 404 page says (ejected with ../index.tsx): what happened in one line, the four pages
// people come for, and a way to report the link that brought them here. It sets the tab's title
// itself: inside the docs (every missing address here) nothing else renders the page's metadata.
import Link from "@docusaurus/Link";
import { PageMetadata } from "@docusaurus/theme-common";
import { Card, Cards } from "@site/src/components/Cards";
import Heading from "@theme/Heading";
import type { Props } from "@theme/NotFound/Content";
import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import styles from "./styles.module.css";

/** A bug report with the missing address filled in (the repository's issue form, by its field ids). */
function reportUrl(address: string): string {
  const fields = new URLSearchParams({
    template: "bug_report.yml",
    title: `[Bug]: broken docs link${address ? ` to ${address}` : ""}`,
    "what-happened": `A link led to ${address || "a docs page"}, which says "Page not found".\n\nThe link was on: `,
  });
  return `https://github.com/UltimaPhoenix/dev-coach/issues/new?${fields}`;
}

export default function NotFoundContent({ className }: Props): ReactNode {
  // The address is known only in the browser: the same 404.html answers every missing page. Its
  // query and hash stay out of the report (a mistyped share link would carry a lesson there).
  const [address, setAddress] = useState("");
  useEffect(() => setAddress(window.location.origin + window.location.pathname), []);
  return (
    <main className={clsx("container margin-vert--xl", className)}>
      <PageMetadata title="Page not found" description="There is no page at this address of the devcoach docs." />
      <div className="row">
        <div className="col col--8 col--offset-2">
          <p className={styles.eyebrow}>404</p>
          <Heading as="h1">Page not found</Heading>
          <p className={styles.lead}>This page moved, or it never existed.</p>
          <Cards columns={2}>
            <Card title="Home" to="/">
              What devcoach does, and what a lesson looks like.
            </Card>
            <Card title="Install" to="/install">
              Pick the method for your agent.
            </Card>
            <Card title="Coaching in your agent" to="/usage/coaching">
              Your first lesson, and the three answers under it.
            </Card>
            <Card title="Troubleshooting" to="/troubleshooting">
              When devcoach does not start, does not coach, or shows an error.
            </Card>
          </Cards>
          <p className={styles.report}>
            Followed a link to get here? <Link href={reportUrl(address)}>Report the broken link</Link> on
            GitHub, and say where you found it.
          </p>
        </div>
      </div>
    </main>
  );
}
