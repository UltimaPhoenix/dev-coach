// Lesson display formatting and level-based prompt templates.
import type { Lesson } from "./models";

// Visual width of a band's "<dashes> title <dashes>" region (excludes the "### " heading marker).
const BAND_WIDTH = 34;

function band(title: string): string {
  // Count Unicode code points (not UTF-16 units) to match Python len() for emoji/non-BMP titles.
  const titleLen = [...title].length;
  const pad = Math.max(BAND_WIDTH - titleLen - 2, 2); // 2 = the spaces flanking the title
  const left = Math.floor(pad / 2);
  return `### ${"─".repeat(left)} ${title} ${"─".repeat(pad - left)}`;
}

/**
 * Format a Lesson as the chat card: a titled top band, `**Title** · Category · Level`,
 * the body (or summary) as plain markdown — never `> ` blockquoted, which breaks on
 * multi-paragraph bodies and fenced code — and a bottom band echoing topic · level.
 * Must stay in sync with the card format described in assets/SKILL.md §4.
 */
export function formatLessonForDisplay(lesson: Lesson): string {
  const levelLabel = lesson.level.charAt(0).toUpperCase() + lesson.level.slice(1);
  const categoryStr = lesson.categories.join(" · ");
  return [
    band("🎓 devcoach"),
    `**${lesson.title}** · ${categoryStr} · ${levelLabel}`,
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
