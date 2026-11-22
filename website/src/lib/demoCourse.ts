// Build-time only (docusaurus.config.ts's demo-course plugin): the demo course of the screenshot
// fixture, prepared the way the dashboard serves a course (src/web/app.ts): its policy in the
// head, the frame bridge, and the highlighter where the document shows code. Node built-ins only,
// so `npm test` runs it without an install (demoCourse.test.ts).
import * as fs from "node:fs";
import * as path from "node:path";
import { hasCode, hasHighlighter, highlighterBlock } from "../../../src/core/highlighter.ts";
import { readZipEntry } from "./zipEntry.ts";

export const DEMO_COURSE_ID = "from-a-cache-miss-to-a-stampede";
export const DEMO_COURSE_FILE = "demo/course.html";
/** The dashboard's Content-Security-Policy header, as a <meta> (GitHub Pages sends no headers of ours). */
export const DEMO_COURSE_HEAD =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
  "script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; " +
  "font-src data:; form-action 'none'; base-uri 'none'\">\n" +
  '<meta name="robots" content="noindex">';

interface FixtureCourses {
  courses: { id: string; title: string }[];
  steps: { course_id: string; position: number; title: string; kind: string; anchor: string }[];
}
/** What the tour needs to draw the step list next to the frame (plugin global data). */
export interface DemoCourse {
  title: string;
  file: string;
  steps: { anchor: string; title: string; kind: string }[];
}

export function loadDemoCourse(repoDir: string, id = DEMO_COURSE_ID): { data: DemoCourse; html: string } {
  const zip = fs.readFileSync(path.join(repoDir, "scripts", "screenshots", "fixture.zip"));
  const entry = (name: string): string => {
    const bytes = readZipEntry(zip, name);
    if (!bytes) throw new Error(`Demo course: ${name} is missing from scripts/screenshots/fixture.zip`);
    return bytes.toString("utf8");
  };
  const meta = JSON.parse(entry("courses.json")) as FixtureCourses;
  const course = meta.courses.find((c) => c.id === id);
  if (!course) throw new Error(`Demo course: ${id} is not in the fixture's courses.json`);
  const steps = meta.steps
    .filter((step) => step.course_id === id)
    .sort((a, b) => a.position - b.position)
    .map(({ anchor, title, kind }) => ({ anchor, title, kind }));
  const text = entry(`courses/${id}/index.html`);
  const head = /<head[^>]*>/i;
  if (!head.test(text)) throw new Error("Demo course: the document has no <head> to carry its policy");
  const bridge = fs.readFileSync(path.join(repoDir, "assets", "static", "course-frame.js"), "utf8");
  const highlighter = !hasHighlighter(text) && hasCode(text) ? `\n${highlighterBlock() ?? ""}` : "";
  const html =
    text.replace(head, (tag) => `${tag}\n${DEMO_COURSE_HEAD}`) + `\n<script>${bridge}</script>\n` + highlighter;
  return { data: { title: course.title, file: DEMO_COURSE_FILE, steps }, html };
}
