// devcoach's pacing defaults, typed once for the docs: DEFAULT_SETTINGS in src/core/db.ts
// (max_per_day, min_gap_minutes, nudge_every). defaults.test.ts reads that file and fails when
// the two disagree, so a changed default cannot leave the figure behind.
export const PACING_DEFAULTS = {
  maxPerDay: 2,
  minGapMinutes: 240,
  nudgeEvery: 10,
} as const;
