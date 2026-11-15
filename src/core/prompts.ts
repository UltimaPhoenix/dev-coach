// Lesson display formatting and level-based prompt templates.
import type { Lesson } from "./models";

/** The fields the card needs — a full Lesson or a shared-lesson payload both qualify. */
export type LessonCard = Pick<
  Lesson,
  "title" | "categories" | "level" | "topic_id" | "summary" | "body"
>;

/** The label that opens every card: inline code, so Claude Code paints it in its accent colour. */
export const CARD_LABEL = "`🎓 devcoach`";

/** The card's first line: the label, the topic and the level. */
export function cardHeader(topic: string, level: string): string {
  return `${CARD_LABEL} · ${topic} · ${level}`;
}

/**
 * Every line behind the quote marker. A blank line becomes a bare `>`, so the rail never breaks
 * between paragraphs; fenced code keeps working inside the quote (verified in Claude Code and in
 * the GFM renderers: syntax colours, the copy button).
 */
function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

/**
 * Format a Lesson as the chat card: ONE blockquote, so a rail runs along the whole lesson and
 * sets it apart from the agent's reply — the header (`🎓 devcoach` · topic · level), the bold
 * title, then the body (or the summary). The feedback line is not part of it: it goes under the
 * card, outside the quote. Must stay in sync with the card format in assets/SKILL.md.
 */
export function formatLessonForDisplay(lesson: LessonCard): string {
  const body = (lesson.body?.trim() || lesson.summary).replace(/\r\n?/g, "\n");
  return quote(
    [cardHeader(lesson.topic_id, lesson.level), "", `**${lesson.title}**`, "", body].join("\n"),
  );
}

const QUOTED = /^ {0,3}> ?/;
const QUOTED_HEADER = /^ {0,3}>\s*`?🎓 devcoach/;
const HEADER = /^\s*`?🎓 devcoach/;
// The bands of the card before 2.8 (`### ──────── 🎓 devcoach ────────`), in case a model copies one.
const BAND = /^\s*#{0,6}\s*─{3,}.*─{3,}\s*$/;
const FEEDBACK = /^\s*Did that land\?/;

/**
 * The lesson as it is stored: the body without the chat card around it. A model writes the card
 * in the chat and sometimes passes the same text to `log_lesson` — the `> ` markers, the
 * `🎓 devcoach` header, the bold title, the feedback line. None of it belongs in the database, on
 * the dashboard or in a share, so it comes off here. The quote is removed only from a card (every
 * line quoted, or a quoted header first): a body that quotes one passage of its own keeps it.
 * Returns the input unchanged when nothing but chrome would remain.
 */
export function stripCardChrome(body: string, title?: string): string {
  let lines = body.replace(/\r\n?/g, "\n").split("\n");
  const firstText = lines.find((l) => l.trim()) ?? "";
  const nonBlank = lines.filter((l) => l.trim());
  if (QUOTED_HEADER.test(firstText) || (nonBlank.length && nonBlank.every((l) => QUOTED.test(l)))) {
    lines = lines.map((l) => l.replace(QUOTED, ""));
  }
  const wanted = title?.trim().toLowerCase();
  const isTitle = (l: string) => {
    const m = /^\s*\*\*(.+?)\*\*(\s*·.*)?\s*$/.exec(l);
    return Boolean(m?.[1] && wanted && m[1].trim().toLowerCase() === wanted);
  };
  const first = () => lines[0] ?? "";
  const last = () => lines.at(-1) ?? "";
  const isChromeAtStart = (l: string) => HEADER.test(l) || BAND.test(l) || isTitle(l);
  const isChromeAtEnd = (l: string) => FEEDBACK.test(l) || BAND.test(l);
  while (lines.length && (!first().trim() || isChromeAtStart(first()))) lines.shift();
  while (lines.length && (!last().trim() || isChromeAtEnd(last()))) lines.pop();
  const clean = lines.join("\n").trim();
  return clean || body.trim();
}

/** Select a prompt template based on confidence (0-3 junior, 4-6 mid, 7-9 senior, 10 mastered → ""). */
export function buildPromptForLevel(topic: string, context: string, confidence: number): string {
  if (confidence <= 3) {
    return (
      `Explain '${topic}' for a beginner. Use a simple analogy. ` +
      `Avoid jargon. Show a minimal code example if helpful. ` +
      `Connect the explanation to: ${context}`
    );
  }
  if (confidence <= 6) {
    return (
      `Explain the 'why' behind '${topic}' for an intermediate developer. ` +
      `Mention two or three alternative approaches and their tradeoffs. ` +
      `Connect the explanation to: ${context}`
    );
  }
  if (confidence <= 9) {
    return (
      `Give a senior-level perspective on '${topic}'. ` +
      `Focus on edge cases, production tradeoffs, and historical context. ` +
      `Assume the reader already knows the basics. ` +
      `Connect the explanation to: ${context}`
    );
  }
  return "";
}
