// The answer queue (ruling 4 of the UI plan): the list's "Unanswered N · answer the newest →" and
// the lesson page's "Next unanswered →". Its own file, so the database holds only what each
// step seeds (tests/setup.ts gives every file a fresh HOME).
import { describe, expect, it } from "vitest";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";
import { createApp } from "../src/web/app";

const app = createApp();
const get = async (path: string) =>
  (await app.fetch(new Request(`http://localhost${path}`))).text();
const answer = (id: string, feedback: string) =>
  app.fetch(
    new Request(`http://localhost/lessons/${id}/feedback`, {
      method: "POST",
      body: new URLSearchParams({ feedback, next: `/lessons/${id}` }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
  );
const seed = (id: string, timestamp: string, extra: Record<string, unknown> = {}) =>
  db.withConnection((c) =>
    db.insertLesson(
      c,
      parseLesson({
        id,
        timestamp,
        topic_id: "queue",
        categories: ["queue"],
        title: `Lesson ${id}`,
        level: "mid",
        summary: "s",
        ...extra,
      }),
    ),
  );
const QUEUE = "answer the newest →";
const queueHref = (page: string) =>
  page.match(/<a href="([^"]+)"[^>]*>answer the newest →<\/a>/)?.[1] ?? null;
const nextHref = (page: string) =>
  page.match(/<a href="([^"]+)"[^>]*>Next unanswered →<\/a>/)?.[1] ?? null;

describe("the answer queue", () => {
  it("counts own lessons only, and steps aside under an answer filter", async () => {
    seed("theirs", "2026-10-30T09:00:00Z", { imported: true, shared_by: "Ada" });
    expect(await get("/lessons")).not.toContain(QUEUE); // the only unanswered lesson is shared

    seed("mine", "2026-10-29T09:00:00Z");
    const list = await get("/lessons");
    expect(list).toContain(
      'Unanswered <span class="tabular-nums text-gray-700 dark:text-gray-200">1</span>',
    );
    expect(queueHref(list)).toBe("/lessons/mine");
    expect(await get("/lessons?feedback=none")).not.toContain(QUEUE);
    expect(await get("/lessons?feedback=know")).not.toContain(QUEUE);
    // the other filters leave it alone: the queue is the whole log's
    expect(queueHref(await get("/lessons?search=theirs"))).toBe("/lessons/mine");
  });

  it("walks the unanswered own lessons newest first, through the lesson page", async () => {
    seed("q-old", "2026-10-01T09:00:00Z");
    seed("q-mid", "2026-10-15T09:00:00Z");
    seed("q-new", "2026-10-31T08:00:00Z");
    seed("q-done", "2026-10-31T09:00:00Z", { feedback: "know" }); // newest, already answered
    expect(queueHref(await get("/lessons"))).toBe("/lessons/q-new");
    expect(await get("/lessons")).toContain(
      'tabular-nums text-gray-700 dark:text-gray-200">4</span>',
    );

    // an unanswered page asks the question; the way on comes with the answer
    expect(nextHref(await get("/lessons/q-new"))).toBeNull();
    expect((await answer("q-new", "know")).status).toBe(303);
    expect(nextHref(await get("/lessons/q-new"))).toBe("/lessons/mine");
    await answer("mine", "understood");
    expect(nextHref(await get("/lessons/mine"))).toBe("/lessons/q-mid");
    // answered out of order: the next is still the newest that waits
    await answer("q-old", "dont_know");
    expect(nextHref(await get("/lessons/q-old"))).toBe("/lessons/q-mid");
    await answer("q-mid", "know");
    const last = await get("/lessons/q-mid");
    expect(last).toContain("Already knew it");
    expect(nextHref(last)).toBeNull(); // the shared lesson never joins the queue
    expect(await get("/lessons")).not.toContain(QUEUE);

    // clearing an answer puts the lesson back in line
    await answer("q-new", "clear");
    expect(queueHref(await get("/lessons"))).toBe("/lessons/q-new");
    expect(nextHref(await get("/lessons/q-mid"))).toBe("/lessons/q-new");
  });

  it("degrades to an empty queue when the lessons cannot be read", () => {
    const conn = db.getConnection(":memory:"); // no schema: every query fails
    expect(db.countUnanswered(conn)).toBe(0);
    expect(db.getNextUnanswered(conn)).toBeNull();
    conn.close();
  });
});
