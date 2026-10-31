// What the share page shows of a shared lesson, following the dashboard's reading layout: one
// category, `topic · level` with the level as a plain word, one phrase for the sender, the TL;DR
// only for legacy lessons, and the 💡 tip last. Pure helpers, so `npm test` covers them.

/** The phrase for a lesson shared without a name. Never "shared by anonymous". */
export const SHARED_ANONYMOUSLY = "shared anonymously";

/** The sender's name to print, or null when there is none (missing, empty or blank). */
export function senderName(sharedBy: string | null | undefined): string | null {
  const name = sharedBy?.trim();
  return name || null;
}

/** "shared by Ada", or "shared anonymously" without a name. */
export function senderPhrase(sharedBy: string | null | undefined): string {
  const name = senderName(sharedBy);
  return name ? `shared by ${name}` : SHARED_ANONYMOUSLY;
}

/** The one category the card shows: the first non-empty one. The others still travel in the code. */
export function firstCategory(categories: readonly string[]): string | null {
  return categories.find((c) => c.trim() !== "") ?? null;
}

/** Markdown reduced to the words it reads as: no emphasis or code marks, one space, lower case. */
function plainWords(md: string): string {
  return md
    .replace(/[`*_~#>\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The TL;DR box is for legacy lessons. A v2 body opens with its summary, so the box would say the
 * first paragraph twice; a lesson without a summary has nothing to put in it. Same rule as the
 * dashboard's lesson page.
 */
export function needsTldr(summary: string, body: string | null | undefined): boolean {
  const s = plainWords(summary);
  return s !== "" && !plainWords(body ?? "").startsWith(s);
}

/** The light bulb that opens the tip (U+1F4A1). */
export const TIP_MARK = "\u{1F4A1}";

/** The tip: the last paragraph that opens with the light bulb, if any. */
export function lastTip<T extends { textContent: string | null }>(
  paragraphs: ArrayLike<T>,
): T | undefined {
  return Array.from(paragraphs)
    .reverse()
    .find((p) => (p.textContent ?? "").trim().startsWith(TIP_MARK));
}
