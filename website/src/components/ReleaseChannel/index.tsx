// Content for one docs site only, decided from the site's `baseUrl` when the page is built, so the
// server-rendered page and the hydrated page always agree:
//
//   import { OnNext, OnStable } from "@site/src/components/ReleaseChannel";
//
//   <OnStable>
//
//   What a reader of the released docs needs (the release's install line).
//
//   </OnStable>
//   <OnNext>
//
//   What only the unreleased docs at /next/ should say (the canary's install line).
//
//   </OnNext>
//
// Keep blank lines inside the tags so MDX reads the children as markdown. Never put a heading
// inside: the table of contents would list it on both sites.
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import type { ReactNode } from "react";
import { type Channel, channelOf } from "./channel";

function useChannel(): Channel {
  return channelOf(useDocusaurusContext().siteConfig.baseUrl);
}

export function OnStable({ children }: { children: ReactNode }): ReactNode {
  return useChannel() === "stable" ? children : null;
}

export function OnNext({ children }: { children: ReactNode }): ReactNode {
  return useChannel() === "next" ? children : null;
}
