// "N min read" under the title of a guide or an essay. This wraps the theme's MDX heading
// (`docusaurus swizzle @docusaurus/theme-classic MDXComponents/Heading --wrap`, which the theme
// marks safe): every heading renders as before, and a page's H1 is followed by the line when the
// page has a reading time. Which pages have one, and how the minutes are measured from the page's
// source, is in src/lib/readingTime.ts; the `devcoach-reading-time` plugin (docusaurus.config.ts)
// hands them over. The line sits under the `# Title` the page writes itself: a page whose title
// comes from its front matter alone has no such heading (readingBudget.test.ts checks the list).
import { useActiveDocContext } from "@docusaurus/plugin-content-docs/client";
import type { WrapperProps } from "@docusaurus/types";
import { usePluginData } from "@docusaurus/useGlobalData";
import type { ReadingTimes } from "@site/src/lib/readingTime";
import type HeadingType from "@theme/MDXComponents/Heading";
import Heading from "@theme-original/MDXComponents/Heading";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

type Props = WrapperProps<typeof HeadingType>;

/** The line itself; nothing on a page without a reading time, or outside the docs. */
function ReadingTime(): ReactNode {
  const times = usePluginData("devcoach-reading-time") as ReadingTimes;
  const { activeDoc } = useActiveDocContext(undefined);
  const minutes = activeDoc ? times[activeDoc.id] : undefined;
  return minutes ? <p className={styles.readingTime}>{`${minutes} min read`}</p> : null;
}

export default function HeadingWrapper(props: Props): ReactNode {
  return (
    <>
      <Heading {...props} />
      {props.as === "h1" && <ReadingTime />}
    </>
  );
}
