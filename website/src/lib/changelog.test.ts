// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { entryKey, parseChangelog, whenShipped } from "./changelog.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const BEFORE = `# Changelog

## [Unreleased]

### Added
- **Windows, in one line.** \`irm … | iex\` installs devcoach.
- **Scoop.** A bucket.

### Fixed
- **A fix nobody points at.** Text.

## [2.7.0] — 2026-10-06

### Added
- **\`/devcoach:setup\`**: a guided setup.

### Changed
- **Something changed.** Not an "Added" entry.

## [1.0.0] – [1.0.3] — 2026-08-27 → 2026-09-03

Release notes live elsewhere.

## [0.3.66] — unreleased

### Added
- **Never released.** Text.
`;

// The same file after the maintainer cut the release: only the section's heading changed.
const AFTER = BEFORE.replace("## [Unreleased]", "## [Unreleased]\n\n## [2.8.0] — 2026-11-30");

test("an entry under Unreleased is next, with no version to show", () => {
  assert.deepEqual(whenShipped(parseChangelog(BEFORE), "Windows, in one line"), { status: "next" });
});

test("once its section is a release, the same entry carries that version and date", () => {
  assert.deepEqual(whenShipped(parseChangelog(AFTER), "Windows, in one line"), {
    status: "shipped",
    version: "2.8.0",
    date: "2026-11-30",
  });
});

test("a page may give the beginning of a title; markup and the closing dot do not count", () => {
  const changelog = parseChangelog(BEFORE);
  assert.equal(entryKey("**`/devcoach:setup`**:"), "/devcoach:setup");
  assert.deepEqual(whenShipped(changelog, "/devcoach:setup"), { status: "shipped", version: "2.7.0", date: "2026-10-06" });
  assert.deepEqual(whenShipped(changelog, "Windows"), { status: "next" });
  assert.equal(whenShipped(changelog, "Win"), null, "half a word is not a match");
});

test("only what a release added counts as shipped; undated sections name no release", () => {
  const changelog = parseChangelog(BEFORE);
  assert.equal(whenShipped(changelog, "Something changed"), null);
  assert.equal(whenShipped(changelog, "Never released"), null);
  assert.equal(whenShipped(changelog, "No such entry"), null);
});

test("every changelog entry a docs page points at exists in CHANGELOG.md", () => {
  const changelog = parseChangelog(readFileSync(join(repo, "CHANGELOG.md"), "utf8"));
  const docs = join(repo, "docs");
  const pages = readdirSync(docs, { recursive: true, encoding: "utf8" }).filter((file) => /\.mdx?$/.test(file));
  const pointers: string[] = [];
  for (const page of pages) {
    for (const [, entry] of readFileSync(join(docs, page), "utf8").matchAll(/<Stop\b[^>]*\bentry="([^"]+)"/g)) {
      pointers.push(`${page}: ${entry}`);
      assert.notEqual(whenShipped(changelog, entry), null, `${page} points at "${entry}", which CHANGELOG.md does not have`);
    }
  }
  assert.ok(pointers.length > 0, "the roadmap points at least at one changelog entry");
});
