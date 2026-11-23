// The page budgets: how long a docs page of each kind may take to read. The time is measured from
// the page's source by readingTime.ts, the number a guide shows under its title. A page that grows
// past its ceiling fails here, before it ships, with what to do about it.
//
// The ceilings are in BUDGETS below, in minutes. Each one sits a little above the longest page of
// its kind on the day it was set (Sharing lessons, the Claude Desktop install, the install
// chooser): room to grow a little, not to double. A reference or lookup page (Configuration, the
// MCP server reference, the CLI, Troubleshooting, the FAQ) has no budget: it is searched, not read
// from top to bottom. The home page's text lives in its components (Hero, Tour): its budget only
// sees what index.mdx itself says.
// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { READING_TIME_PAGES, docId, readingMinutes } from "./readingTime.ts";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs");

/** The pages a section or the site opens on: they send the reader on, so they stay short. */
const LANDING_PAGES = ["index", "install/index", "usage/index", "reference/index", "help"];

interface Budget {
  /** How the failure names the page. */
  kind: string;
  /** Minutes, by readingTime.ts. */
  ceiling: number;
  covers: (id: string) => boolean;
}

const BUDGETS: Budget[] = [
  { kind: "a guide or an essay", ceiling: 13, covers: (id) => READING_TIME_PAGES.includes(id) },
  { kind: "an install page", ceiling: 9, covers: (id) => id.startsWith("install/") && id !== "install/index" },
  { kind: "a landing page", ceiling: 4, covers: (id) => LANDING_PAGES.includes(id) },
];

/** Every docs page: its file under docs/ and its source, by doc id. */
const pages = new Map(
  readdirSync(docs, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.mdx?$/.test(file) && !/\.local\.mdx?$/.test(file))
    .map((file) => [docId(file), { file: file.replace(/\\/g, "/"), source: readFileSync(join(docs, file), "utf8") }]),
);

/** The pages of a budget that are over it: "docs/usage/sharing.md takes 14.0 minutes to read." */
function overBudget(budget: Budget, sources: { file: string; source: string }[]): string[] {
  return sources
    .map(({ file, source }) => ({ file, minutes: readingMinutes(source) }))
    .filter(({ minutes }) => minutes > budget.ceiling)
    .map(({ file, minutes }) => `docs/${file} takes ${minutes.toFixed(1)} minutes to read.`);
}

/** What the failure says: which pages, the ceiling, and what to do about it. */
function advice(budget: Budget, over: string[]): string {
  return [
    "",
    ...over,
    `The budget for ${budget.kind} is ${budget.ceiling} minutes.`,
    "Make the page shorter: move what is looked up (a table of options, a file format, a list of errors) to a reference page and link to it, fold what few readers need into <details>, or split the page in two.",
    "If the page has to be this long, raise the ceiling in website/src/lib/readingBudget.test.ts and say why in the pull request.",
    "",
  ].join("\n");
}

for (const budget of BUDGETS) {
  test(`${budget.kind} takes ${budget.ceiling} minutes or less to read`, () => {
    const covered = [...pages].filter(([id]) => budget.covers(id)).map(([, page]) => page);
    assert.ok(covered.length > 0, "the budget covers at least one page");
    const over = overBudget(budget, covered);
    assert.ok(over.length === 0, advice(budget, over));
  });
}

test("a page over its budget is named with its time, the ceiling and what to do", () => {
  const [guides] = BUDGETS;
  const page = (words: number) => ({ file: "usage/sharing.md", source: `# Sharing lessons\n\n${Array.from({ length: words }, () => "word").join(" ")}\n` });
  assert.deepEqual(overBudget(guides, [page(2500)]), [], "12.5 minutes: within 13");
  const over = overBudget(guides, [page(2500), page(2800)]);
  assert.deepEqual(over, ["docs/usage/sharing.md takes 14.0 minutes to read."]);
  const message = advice(guides, over);
  assert.match(message, /^The budget for a guide or an essay is 13 minutes\.$/m);
  assert.match(message, /^Make the page shorter: /m);
  assert.match(message, /raise the ceiling in website\/src\/lib\/readingBudget\.test\.ts/);
});

test("the pages named here and in READING_TIME_PAGES exist, and no page has two budgets", () => {
  for (const id of [...READING_TIME_PAGES, ...LANDING_PAGES]) assert.ok(pages.has(id), `docs/${id}.md(x) is gone: rename it in the list too`);
  for (const id of pages.keys()) {
    const kinds = BUDGETS.filter((budget) => budget.covers(id)).map((budget) => budget.kind);
    assert.ok(kinds.length <= 1, `${id} is ${kinds.join(" and ")}`);
  }
});

test("a page that shows its reading time writes its own title: the line sits under that H1", () => {
  for (const id of READING_TIME_PAGES) {
    const source = pages.get(id)?.source ?? "";
    assert.match(source, /^# \S/m, `docs/${id}: no "# Title" line in the page, so "N min read" has no title to sit under`);
  }
});
