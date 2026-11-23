// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { test } from "node:test";
import { countWords, docId, labelMinutes, measurePage, readingMinutes, readingSeconds } from "./readingTime.ts";

/** `n` words of prose. */
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
/** A fenced block of `n` lines. */
const block = (n: number, language = "bash") => `\`\`\`${language}\n${Array.from({ length: n }, (_, i) => `line ${i}`).join("\n")}\n\`\`\``;

test("prose is read at 200 words a minute", () => {
  assert.equal(readingMinutes(words(200)), 1);
  assert.equal(readingMinutes(words(500)), 2.5);
  assert.equal(readingMinutes(""), 0);
});

test("headings, list items and table cells are words like any other; a table's rule is not", () => {
  const page = measurePage(`# Sharing lessons

## Three ways

- one way
- another way

| Format | Best for |
|---|:--|
| Link | a chat |
`);
  assert.deepEqual(page, { words: 2 + 2 + 2 + 2 + 3 + 3, codeBlocks: [], figures: 0 });
});

test("a word starts with a letter or a digit: a path or a setting is one, punctuation and emoji are none", () => {
  assert.equal(countWords("Open ~/.devcoach/coaching.db, then set nudge_every to 10 — ✅ done."), 8);
  assert.equal(countWords("don't · it's"), 2);
});

test("code: 2 seconds a line up to 12 lines, half a second a line after that", () => {
  assert.equal(readingSeconds(measurePage(block(1))), 2);
  assert.equal(readingSeconds(measurePage(block(12))), 24);
  assert.equal(readingSeconds(measurePage(block(20))), 24 + 8 * 0.5);
  assert.deepEqual(measurePage(`${block(3)}\n\n${block(14, "json")}`).codeBlocks, [3, 14], "each block on its own");
});

test("a code block is not prose: its words, its tags and its imports stay lines", () => {
  const page = measurePage(`One line of text.

~~~tsx title="A component"
import Clip from "@site/src/components/Clip";

<details>
<Clip alt="not a figure here" />
~~~
`);
  assert.deepEqual(page, { words: 4, codeBlocks: [4], figures: 0 });
  assert.deepEqual(measurePage("```\none\n\n\n```").codeBlocks, [1], "a block's last blank lines are not shown");
});

test("an image or a figure is 6 seconds: Markdown images, <img>, components that draw", () => {
  const page = measurePage(`![The lessons page](./screenshots/lessons.png)

<img src="/img/logo.svg" alt="devcoach" />

<ThemedShot
  alt="The knowledge map, with a > in its description"
  light={require("../screenshots/knowledge-light.png").default}
  dark={require("../screenshots/knowledge-dark.png").default}
/>

<Terminal command="devcoach stats" output={cli.stats} />
`);
  assert.deepEqual(page, { words: 0, codeBlocks: [], figures: 4 });
  assert.equal(readingSeconds(page), 24);
  assert.equal(measurePage("<Yes>Automatic</Yes> <Partly /> <Card title=\"A card\" />").figures, 0, "a mark or a card draws no figure");
});

test("a Mermaid diagram is a figure, and the labels it shows are words", () => {
  const flowchart = measurePage(`\`\`\`mermaid
---
config:
  flowchart:
    rankSpacing: 24
---
flowchart TD
    A["You share a lesson:<br/>text, a link or a file"]:::primary
    A -->|"a link"| B(["The lesson page"])
\`\`\``);
  assert.deepEqual(flowchart, { words: 10 + 2 + 3, codeBlocks: [], figures: 1 });

  const sequence = measurePage(`\`\`\`mermaid
%%{init: {"sequence": {"width": 80}}}%%
sequenceDiagram
    participant A as Agent
    You->>A: your message
    Note over A: does the<br/>task
\`\`\``);
  assert.deepEqual(sequence, { words: 2 + 3, codeBlocks: [], figures: 1 });
});

test("front matter, imports, exports and comments are not text", () => {
  const page = measurePage(`---
title: Coaching in your agent
description: Where devcoach lessons appear in your agent.
---

import { Cards, Card } from "@site/src/components/Cards";
import cli from "@site/src/data/cli-output.json";

export const doctor = (() => {
  const lines = ["one two three", "four five six"];

  return lines.join("\\n");
})();

# Coaching in your agent

<!-- a note for whoever edits this page -->

## How often lessons come {/* #staying-unobtrusive */}

{/* References: the site lists these notes
    at the end of the page. */}
`);
  assert.deepEqual(page, { words: 8, codeBlocks: [], figures: 0 });
});

test("a tag is not text, what it wraps is; props are not counted", () => {
  const page = measurePage(`<Cards columns={2}>
  <Card label="On its own" title="Claude Code" to="/install/claude-code-plugin">
    Two hooks bring <b>a lesson</b> when one is due.
  </Card>
</Cards>

<Timeline label="Releases" caption={<>Release dates from the changelog.</>}>
<Stop version="2.1.0" title="Lesson sharing">One short line.</Stop>
</Timeline>
`);
  assert.equal(page.words, 9 + 3);
});

test("a link's target, a footnote mark, an admonition's marker and inline code's backticks are not words", () => {
  assert.equal(measurePage('See [Privacy & security](../reference/privacy.md#sharing-is-explicit "Privacy") for the rest.').words, 6);
  assert.equal(measurePage("A claim.[^kahneman]\n\n[^kahneman]: Kahneman, 2011.").words, 4);
  assert.equal(measurePage(":::tip[Not installed yet?]\nPick a method.\n:::").words, 6);
  assert.equal(measurePage("Run `devcoach lesson <id>` or fold it into `<details>`, then go on.").words, 12);
  assert.equal(measurePage("A literal \\{brace\\} and an {expression} here.").words, 6);
  assert.equal(measurePage("A stray ` mark.\n\n<details>\n<summary>Why</summary>\nFolded.\n</details>\n\nThen `code` again.").words, 3 + 1 + 3, "a code span ends with its paragraph");
});

test("the inside of a <details> is opened on demand: its summary counts, the rest does not", () => {
  const page = measurePage(`Before the fold.

<details>
<summary>What the summary looks like</summary>

Forty words nobody has to read.

${block(13, "text")}

![a capture](./capture.png)

</details>

After the fold.`);
  assert.deepEqual(page, { words: 3 + 5 + 3, codeBlocks: [], figures: 0 });
  assert.equal(measurePage("<details open>\n<summary>Shown</summary>\n\nAlready open here.\n\n</details>").words, 4, "<details open> is on show");
});

test("in a set of tabs only the tab shown first is read: the one marked default, else the first", () => {
  const tabs = (first: string, second: string) => `<Tabs groupId="route">
  <TabItem value="plugin" label="Plugin"${first}>

  Two words.

  ${block(2)}

  </TabItem>
  <TabItem value="cli" label="Command line"${second}>

  Three more words.

  <Clip alt="a clip" />

  </TabItem>
</Tabs>

One after.`;
  assert.deepEqual(measurePage(tabs("", "")), { words: 2 + 2, codeBlocks: [2], figures: 0 });
  assert.deepEqual(measurePage(tabs(" default", "")), { words: 2 + 2, codeBlocks: [2], figures: 0 });
  assert.deepEqual(measurePage(tabs("", " default")), { words: 3 + 2, codeBlocks: [], figures: 1 });
  assert.equal(measurePage("<WrapTabs>\n<TabItem value=\"a\">One.</TabItem>\n<TabItem value=\"b\">Two words.</TabItem>\n</WrapTabs>").words, 1);
});

test("a fold inside a tab that is not shown stays out, summary and all", () => {
  const page = measurePage(`<Tabs>
<TabItem value="a">Shown first.</TabItem>
<TabItem value="b">

<details>
<summary>A summary in the second tab</summary>
Folded.
</details>

</TabItem>
</Tabs>`);
  assert.equal(page.words, 2);
});

test("the label shows whole minutes, and never 0", () => {
  assert.equal(labelMinutes(7.4), 7);
  assert.equal(labelMinutes(7.5), 8);
  assert.equal(labelMinutes(0.2), 1);
});

test("a doc's id is its path under docs/ without the extension", () => {
  assert.equal(docId("usage/coaching.md"), "usage/coaching");
  assert.equal(docId("index.mdx"), "index");
  assert.equal(docId("install\\index.md"), "install/index");
});
