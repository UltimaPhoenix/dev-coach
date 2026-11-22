// Which docs site a page is built for. The released docs (`baseUrl` /dev-coach/) are published
// with each release; the unreleased docs (DOCS_NEXT=1, `baseUrl` /dev-coach/next/) follow `develop`
// and are the only ones read before a release.
export type Channel = "stable" | "next";

export function channelOf(baseUrl: string): Channel {
  return /\/next\/$/.test(baseUrl) ? "next" : "stable";
}
