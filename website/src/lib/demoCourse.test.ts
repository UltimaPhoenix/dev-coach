// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hasHighlighter } from "../../../src/core/highlighter.ts";
import { DEMO_COURSE_FILE, DEMO_COURSE_HEAD, loadDemoCourse } from "./demoCourse.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const demo = loadDemoCourse(repo);
const count = (text: string, part: string) => text.split(part).length - 1;

test("the policy is the first thing in the head, before any script can run", () => {
  const head = demo.html.match(/<head[^>]*>/i);
  assert.ok(head?.index !== undefined, "a <head>");
  const after = demo.html.slice(head.index + head[0].length);
  assert.ok(after.startsWith(`\n${DEMO_COURSE_HEAD}`), "the CSP <meta> right after <head>");
  assert.ok(demo.html.indexOf("<script") > head.index, "no script before the policy");
  assert.equal(count(demo.html, 'http-equiv="Content-Security-Policy"'), 1);
});

test("the frame bridge is appended once, and the highlighter is filled once where there is code", () => {
  const bridge = readFileSync(join(repo, "assets", "static", "course-frame.js"), "utf8");
  assert.equal(count(demo.html, bridge), 1);
  assert.ok(/<pre[^>]*>\s*<code/i.test(demo.html), "the demo course shows code");
  assert.ok(hasHighlighter(demo.html), "a filled highlighter block");
  assert.equal(count(demo.html, "hljs.highlightElement"), 1, "one copy of the library's call");
});

test("the tour's step list: every step, in order, each one a section of the document", () => {
  const { data } = demo;
  assert.equal(data.file, DEMO_COURSE_FILE);
  assert.ok(data.steps.length >= 3, "a few steps");
  assert.deepEqual(
    data.steps.map((step) => step.anchor),
    data.steps.map((_, i) => `step-${i + 1}`),
    "sorted by position",
  );
  for (const step of data.steps) {
    assert.match(demo.html, new RegExp(`<section id="${step.anchor}"`), step.anchor);
    assert.ok(step.title && step.kind, `${step.anchor} has a title and a kind`);
  }
});

test("a course the fixture does not hold fails the build with its name", () => {
  assert.throws(() => loadDemoCourse(repo, "no-such-course"), /no-such-course is not in the fixture/);
});
