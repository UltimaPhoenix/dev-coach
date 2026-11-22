// What the docs read from CHANGELOG.md, so that no page has to name the release a feature arrives
// in. A page points at a changelog entry (the bold lead of a bullet, e.g. "Windows, in one line");
// while that entry sits under "Unreleased" it is "next", and once the section is renamed to a
// version at release time it carries that version and its date. Nothing in the docs changes.
//
// Pure functions: the site config parses the file once (Node.js) and hands the result to the pages
// as plugin data; the plain-text export (llmsFull.ts) uses the same result.

export interface Release {
  version: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

export interface Changelog {
  /** Entries under "Unreleased", normalised (see `entryKey`). */
  unreleased: string[];
  /** Released entries under "Added", normalised, with the release they shipped in. */
  added: Record<string, Release>;
}

/** When a changelog entry shipped: in a release, or not yet. */
export type Shipped = { status: "shipped"; version: string; date: string } | { status: "next" };

/** One spelling for an entry's title: no markup, no closing punctuation, one case. */
export function entryKey(title: string): string {
  return title
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:,;]+$/, "")
    .toLowerCase();
}

const SECTION = /^## \[(Unreleased|\d+\.\d+\.\d+)\](.*)$/;
const DATE = /\d{4}-\d{2}-\d{2}/;
/** A top-level bullet that opens with a bold title: `- **Title.** text`. */
const ENTRY = /^- \*\*(.+?)\*\*/;

export function parseChangelog(markdown: string): Changelog {
  const changelog: Changelog = { unreleased: [], added: {} };
  let release: Release | "unreleased" | null = null;
  let group = "";
  for (const line of markdown.split("\n")) {
    const section = line.match(SECTION);
    if (section) {
      const date = section[2].match(DATE)?.[0];
      // A numbered section with no date (an old "[x] — unreleased") names no release.
      release = section[1] === "Unreleased" ? "unreleased" : date ? { version: section[1], date } : null;
      group = "";
      continue;
    }
    if (line.startsWith("## ")) {
      release = null;
      continue;
    }
    if (line.startsWith("### ")) {
      group = line.slice(4).trim();
      continue;
    }
    const title = line.match(ENTRY)?.[1];
    if (!title || !release) continue;
    const key = entryKey(title);
    if (release === "unreleased") changelog.unreleased.push(key);
    else if (group === "Added" && !(key in changelog.added)) changelog.added[key] = release;
  }
  return changelog;
}

/** Does a changelog title match what a page asked for? The page may give only its beginning. */
const matches = (title: string, wanted: string) => title === wanted || title.startsWith(`${wanted} `) || title.startsWith(`${wanted},`);

/**
 * When the entry a page points at shipped. `null` when the changelog has no such entry: the caller
 * decides what to show, and the site's tests fail so the page gets fixed before a release.
 */
export function whenShipped(changelog: Changelog, entry: string): Shipped | null {
  const wanted = entryKey(entry);
  if (changelog.unreleased.some((title) => matches(title, wanted))) return { status: "next" };
  const found = Object.keys(changelog.added).find((title) => matches(title, wanted));
  return found ? { status: "shipped", ...changelog.added[found] } : null;
}
