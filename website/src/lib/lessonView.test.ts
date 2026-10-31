// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  firstCategory,
  lastTip,
  needsTldr,
  SHARED_ANONYMOUSLY,
  senderName,
  senderPhrase,
  TIP_MARK,
} from "./lessonView.ts";

test("the sender is one phrase: 'shared by <name>', or 'shared anonymously' — never 'shared by anonymous'", () => {
  assert.equal(senderPhrase("Ada"), "shared by Ada");
  assert.equal(senderPhrase("  Ada Lovelace "), "shared by Ada Lovelace");
  for (const none of [null, undefined, "", "   "]) {
    assert.equal(senderName(none), null);
    assert.equal(senderPhrase(none), SHARED_ANONYMOUSLY);
    assert.doesNotMatch(senderPhrase(none), /shared by/);
  }
  assert.equal(SHARED_ANONYMOUSLY, "shared anonymously");
});

test("one category: the first non-empty one, or none", () => {
  assert.equal(firstCategory(["sqlite", "node"]), "sqlite");
  assert.equal(firstCategory(["", " ", "node"]), "node");
  assert.equal(firstCategory([]), null);
});

test("the TL;DR box is for legacy lessons only, as on the dashboard", () => {
  const summary = "SQLite has no lock queue: `busy_timeout` retries.";
  // A v2 body opens with its summary (formatting aside): no box.
  assert.equal(needsTldr(summary, "SQLite has no lock queue: busy_timeout **retries**.\n\nMore."), false);
  // A legacy body starts elsewhere: the box carries the summary.
  assert.equal(needsTldr(summary, "## Why\n\nWAL mode lets readers…"), true);
  // No body at all: the summary is the lesson.
  assert.equal(needsTldr(summary, null), true);
  assert.equal(needsTldr(summary, ""), true);
  // No summary: nothing to put in a box.
  assert.equal(needsTldr("", "Body."), false);
  assert.equal(needsTldr("  ", null), false);
});

test("the tip is the last paragraph that opens with the light bulb", () => {
  const p = (textContent: string | null) => ({ textContent });
  const paras = [p(`${TIP_MARK} an early aside`), p("prose"), p(`  ${TIP_MARK} *Senior tip:* the rule`), p("")];
  assert.equal(lastTip(paras), paras[2]);
  assert.equal(lastTip([p("no tip here"), p(null)]), undefined);
  assert.equal(lastTip([]), undefined);
  assert.equal(TIP_MARK, "💡");
});
