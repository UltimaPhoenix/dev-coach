// Docusaurus tabs whose row wraps onto a second line when it does not fit, instead of scrolling
// sideways: on a phone a row of five or more labels hides its last tabs past the edge, with no
// sign that they are there. Every prop goes to Docusaurus's own Tabs; only the tab row changes.
//
//   import WrapTabs from "@site/src/components/WrapTabs";
//   import TabItem from "@theme/TabItem";
//
//   <WrapTabs>
//   <TabItem value="cursor" label="Cursor" default>…</TabItem>
//   <TabItem value="zed" label="Zed">…</TabItem>
//   </WrapTabs>
import Tabs, { type Props } from "@theme/Tabs";
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export default function WrapTabs({ className, ...props }: Props): ReactNode {
  return <Tabs {...props} className={clsx(styles.wrap, className)} />;
}
