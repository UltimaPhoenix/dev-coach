// Zod models for lessons, knowledge, settings, and profile.
// Keys stay snake_case to keep DB rows and MCP JSON byte-identical with the Python implementation.
import { z } from "zod";

// ── Domain enums ─────────────────────────────────────────────────────────────

export const LevelSchema = z.enum(["junior", "mid", "senior"]);
export type Level = z.infer<typeof LevelSchema>;

export const RepositoryPlatformSchema = z.enum(["github", "gitlab", "bitbucket", "local"]);
export type RepositoryPlatform = z.infer<typeof RepositoryPlatformSchema>;

export const FeedbackSchema = z.enum(["know", "dont_know"]);
export type Feedback = z.infer<typeof FeedbackSchema>;

/** Confidence accepted from tool inputs: clamped range 0-10. */
export const confidenceInputSchema = z.number().int().min(0).max(10);

// ── Timestamp helpers (parity with Lesson.parse_and_normalize_timestamp) ─────

/** Format a Date as `YYYY-MM-DDTHH:MM:SSZ` in UTC (no fractional seconds), matching Python strftime. */
export function formatIsoZ(dt: Date): string {
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Parse an ISO 8601 string/Date to a Date. Naive (timezone-less) input is treated as UTC,
 *  matching Python's `datetime.fromisoformat(...).replace(tzinfo=UTC)`. */
function parseToUtc(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("Invalid Date");
    return value;
  }
  let s = value.trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) {
    s = s.includes("T") || s.includes(" ") ? `${s.replace(" ", "T")}Z` : `${s}T00:00:00Z`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) {
    throw new TypeError(`Cannot parse timestamp ${JSON.stringify(value)} — expected ISO 8601`);
  }
  return dt;
}

/** Normalize any ISO 8601 string/Date → UTC, clamp to now, return `YYYY-MM-DDTHH:MM:SSZ`. */
export function normalizeTimestamp(value: string | Date): string {
  let dt = parseToUtc(value);
  const now = new Date();
  if (dt.getTime() > now.getTime()) dt = now;
  return formatIsoZ(dt);
}

const timestampSchema = z.union([z.string(), z.date()]).transform((v, ctx) => {
  try {
    return normalizeTimestamp(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});

/** Optional string field that coerces `undefined` → `null`, so JSON output mirrors Python `None`. */
const nullableStr = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

// ── Models ───────────────────────────────────────────────────────────────────

export const LessonSchema = z.object({
  id: z.string(),
  timestamp: timestampSchema,
  topic_id: z.string(),
  categories: z.array(z.string()),
  title: z.string(),
  level: LevelSchema,
  summary: z.string(),
  body: nullableStr,
  task_context: nullableStr,
  project: nullableStr,
  repository: nullableStr,
  branch: nullableStr,
  commit_hash: nullableStr,
  folder: nullableStr,
  repository_platform: RepositoryPlatformSchema.nullish().transform((v) => v ?? null),
  starred: z.boolean().default(false),
  feedback: FeedbackSchema.nullish().transform((v) => v ?? null),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const KnowledgeEntrySchema = z.object({
  topic: z.string(),
  confidence: z.number().int(),
});
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

export const KnowledgeGroupSchema = z.object({
  name: z.string(),
  topics: z.array(z.string()),
});
export type KnowledgeGroup = z.infer<typeof KnowledgeGroupSchema>;

export const ProfileSchema = z.object({
  knowledge: z.array(KnowledgeEntrySchema),
  groups: z.array(KnowledgeGroupSchema),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UiThemeSchema = z.enum(["system", "dark", "light"]);
export type UiTheme = z.infer<typeof UiThemeSchema>;

export const SettingsSchema = z.object({
  max_per_day: z.number().int().default(2),
  min_gap_minutes: z.number().int().default(240),
  ui_theme: UiThemeSchema.default("system"),
});
export type Settings = z.infer<typeof SettingsSchema>;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string | null;
}

/** Validate/normalize a raw object into a Lesson (applies timestamp normalization + null coercion). */
export function parseLesson(input: unknown): Lesson {
  return LessonSchema.parse(input);
}
