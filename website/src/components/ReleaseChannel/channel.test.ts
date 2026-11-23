// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { test } from "node:test";
import { channelOf } from "./channel.ts";

test("the released docs are stable, the /next/ build is next", () => {
  assert.equal(channelOf("/dev-coach/"), "stable");
  assert.equal(channelOf("/dev-coach/next/"), "next");
  assert.equal(channelOf("/"), "stable");
});

test("only a final /next/ segment counts", () => {
  assert.equal(channelOf("/next-steps/"), "stable");
  assert.equal(channelOf("/dev-coach/nextjs/"), "stable");
});
