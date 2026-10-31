// Lesson display formatting, the skill-less card instructions, and level-based prompt templates.
import type { Lesson } from "./models";

/** The fields the card needs — a full Lesson or a shared-lesson payload both qualify. */
export type LessonCard = Pick<
  Lesson,
  "title" | "categories" | "level" | "topic_id" | "summary" | "body"
>;

// Visual width of a band's "<dashes> title <dashes>" region (excludes the "### " heading marker).
const BAND_WIDTH = 34;

/** A card band: a `###` heading of `─` dashes around a centred title, 34 code points wide. */
export function band(title: string): string {
  // Count Unicode code points (not UTF-16 units) to match Python len() for emoji/non-BMP titles.
  const titleLen = [...title].length;
  const pad = Math.max(BAND_WIDTH - titleLen - 2, 2); // 2 = the spaces flanking the title
  const left = Math.floor(pad / 2);
  return `### ${"─".repeat(left)} ${title} ${"─".repeat(pad - left)}`;
}

/** The line written directly beneath a delivered card's closing band (assets/SKILL.md). */
export const FEEDBACK_LINE =
  "Did that land? ✅ knew it (y) · 💡 understood (u) · ❌ couldn't follow (n)";

// The template's closing band, as assets/SKILL.md writes it: 11 dashes a side, like the top band.
const TEMPLATE_CLOSING_BAND = `### ${"─".repeat(11)} [topic] · [level] ${"─".repeat(11)}`;

/**
 * The lesson flow for a model that cannot load the devcoach skill — the hook cue's fallback.
 * It restates the skill's "Lesson format" in one paragraph, so it is the only other place
 * allowed to instruct: tests pin it to the skill and to the cue. It ends with the feedback
 * line, so the card a fallback writes asks the same question as the skill's.
 */
export const CARD_FALLBACK =
  "call get_briefing (one call: profile, taught topics, notebook); pick ONE untaught profile " +
  "topic at or above the user's confidence band; call log_lesson silently, with body = 2–4 " +
  "short paragraphs, at most 160 words including the tip: the first sentence names what the " +
  "user just did (never a file path), then the wrong assumption the code embodied and the " +
  "mechanism that replaces it, an optional fenced contrast of at most 8 lines, and a " +
  "`💡 *Senior tip:*` line last — clean markdown without bands or a title line; THEN write the " +
  "card as the FINAL message of the turn: plain markdown (no '>' blockquote) between two band " +
  `headings \`${band("🎓 devcoach")}\` and \`${TEMPLATE_CLOSING_BAND}\`, with ` +
  "`**[Title]** · [Category] · [Level]` (one category), the body you passed, and the tip last " +
  "— saving is not showing; the card in the final message is the only thing the user sees. " +
  `Directly beneath the closing band, add the line: ${FEEDBACK_LINE}`;

/**
 * Format a Lesson as the chat card: a titled top band, `**Title** · Category · Level` with the
 * FIRST category only (the others stay stored — a title line with every category wraps at 80
 * columns), the body (or summary) as plain markdown — never `> ` blockquoted, which breaks on
 * multi-paragraph bodies and fenced code — and a bottom band echoing topic · level.
 * Must stay in sync with the card format in assets/SKILL.md "Lesson format".
 */
export function formatLessonForDisplay(lesson: LessonCard): string {
  const levelLabel = lesson.level.charAt(0).toUpperCase() + lesson.level.slice(1);
  const titleLine = [`**${lesson.title}**`, lesson.categories[0], levelLabel]
    .filter(Boolean)
    .join(" · ");
  return [
    band("🎓 devcoach"),
    titleLine,
    "",
    lesson.body?.trim() || lesson.summary,
    "",
    band(`${lesson.topic_id} · ${lesson.level}`),
  ].join("\n");
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
