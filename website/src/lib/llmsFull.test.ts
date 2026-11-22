// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sidebars from "../../sidebars.ts";
import { docRoute, llmsIntro, mdxToMarkdown, pageTitle, sidebarDocIds } from "./llmsFull.ts";

const SITE = "https://ultimaphoenix.github.io/dev-coach/";
const website = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const docsDir = join(website, "..", "docs");
const md = (source: string, file = "usage/coaching.md") => mdxToMarkdown(source, file, SITE);

/** Lines outside fenced code, with `inline code` removed. */
const prose = (text: string) => {
  let fence = false;
  return text
    .split("\n")
    .filter((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      return !fence && !/^\s*(```|~~~)/.test(line);
    })
    .map((line) => line.replace(/`[^`]*`/g, ""))
    .join("\n");
};

const docFiles = (() => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.mdx?$/.test(entry.name) && !/\.local\.mdx?$/.test(entry.name)) {
        files.push(relative(docsDir, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(docsDir);
  return files.sort();
})();

test("a card becomes its title in bold and its text; the grid around it goes", () => {
  const out = md(`<Cards columns={2}>
  <Card title="Claude Code" label="Automatic lessons" to="/install/claude-code-plugin">
    Two hooks bring a lesson when one is due.
  </Card>
  <Card title="Claude Desktop" />
</Cards>`);
  assert.equal(out, "**Claude Code**\n\nTwo hooks bring a lesson when one is due.\n\n**Claude Desktop**");
});

test("a wrapper's label becomes a bold line, a chat keeps who says what and the option picked", () => {
  const out = md(`<Tabs>
<TabItem value="mac" label="macOS">
Run it.
</TabItem>
</Tabs>

<Chat label="After your first task">
  <Say who="coach">How should I set up your profile?</Say>
  <Choices options={["Automatic (recommended)", "Guided"]} picked="Automatic (recommended)" />
</Chat>`);
  assert.match(out, /^\*\*macOS\*\*\n\nRun it\./);
  assert.match(out, /\*\*After your first task\*\*/);
  assert.match(out, /\*\*devcoach:\*\* How should I set up your profile\?/);
  assert.match(out, /\*\*you:\*\* \*\*Automatic \(recommended\)\*\* \(picked\) · Guided/);
});

test("code is copied as it is, tags and all, and a list item keeps its code block", () => {
  const out = md(
    "Use `--date-from <YYYY-MM-DD>` here.\n\n```tsx\n<Card title=\"x\" />\nimport a from \"b\";\n```\n\n1. Run:\n\n   ```bash\n   devcoach doctor\n   ```",
  );
  assert.match(out, /`--date-from <YYYY-MM-DD>`/);
  assert.match(out, /```tsx\n<Card title="x" \/>\nimport a from "b";\n```/);
  assert.match(out, /1\. Run:\n\n {3}```bash\n {3}devcoach doctor\n {3}```/);
});

test("imports, exports, comments, <Head> blocks and images are dropped, and the H1", () => {
  const out = md(`import { Card } from "@site/src/components/Cards";

# The title

{/* a note for authors, don't ship it */}

export const faq = [
  // the reader's questions
  { q: "What's this?", a: "A [link](/why) and a } brace" },
];

<Head>
  <script type="application/ld+json">{"{}"}</script>
</Head>

![The dashboard](../screenshots/lessons-dark.png)

What stays.`);
  assert.equal(out, "What stays.");
});

test("links to pages, anchors and site paths become full URLs; other links stay", () => {
  const out = md(
    "[a](../reference/privacy.md#sharing-is-explicit) [b](./courses.md) [c](#onboarding) [d](/install) " +
      "[e](./reference/license) [f](https://github.com/UltimaPhoenix/dev-coach) [g](../screenshots/x.zip)",
  );
  assert.equal(
    out,
    `[a](${SITE}reference/privacy#sharing-is-explicit) [b](${SITE}usage/courses) [c](${SITE}usage/coaching#onboarding) ` +
      `[d](${SITE}install) [e](${SITE}usage/reference/license) [f](https://github.com/UltimaPhoenix/dev-coach) ` +
      "[g](../screenshots/x.zip)",
  );
  assert.equal(md("[x](./claude-code-plugin.md)", "install/index.md"), `[x](${SITE}install/claude-code-plugin)`);
});

test("a JSX attribute string has no escapes, and JSX text in a prop may hold an apostrophe", () => {
  const out = md(`<FileTree
  root="%LOCALAPPDATA%\\devcoach\\"
  items={[{ name: "bin\\\\", note: <>the extension's copy</> }]}
/>

After the tree.`);
  assert.equal(out, "After the tree.");
});

test("every docs page converts with no component tag, import or relative page link left", () => {
  for (const file of docFiles) {
    const out = prose(mdxToMarkdown(readFileSync(join(docsDir, file), "utf8"), file, SITE));
    assert.doesNotMatch(out, /<\/?[A-Z]/, `${file}: a component tag`);
    assert.doesNotMatch(out, /^(import|export)\s/m, `${file}: an import or export`);
    assert.doesNotMatch(out, /\]\((?!https?:|mailto:)[^)]*\.mdx?[)#]/, `${file}: a relative .md link`);
  }
});

test("the sidebar lists every docs page once, so llms-full.txt and previous / next miss none", () => {
  const ids = sidebarDocIds(sidebars.docs as unknown[]);
  assert.deepEqual([...ids].sort(), docFiles.map((f) => f.replace(/\.mdx?$/, "")).sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], "index");
  assert.equal(docRoute("install/index.md"), "install");
  assert.equal(docRoute("index.mdx"), "");
  assert.equal(pageTitle("---\ntitle: FAQ\n---\n# Other", "faq.mdx"), "FAQ");
});

test("llms.txt has a summary for the home section, in the words the docs agreed on", () => {
  const llms = readFileSync(join(website, "static", "llms.txt"), "utf8");
  const intro = llmsIntro(llms);
  assert.ok(intro.length > 400, "a summary of a few paragraphs");
  assert.doesNotMatch(intro, /^## /m);
  for (const phrase of [/one[- ]click/i, /single SQLite/i, /one SQLite file/i, /after (each|every) task/i, /\(Beta\)/]) {
    assert.doesNotMatch(llms, phrase);
  }
});
