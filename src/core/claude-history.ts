// Cross-project tech-stack detection from the local Claude Code history.
// Reads only metadata: the ~/.claude.json projects map (paths + exampleFiles),
// per-project manifests via detectStack, history.jsonl activity (project +
// timestamp fields only — NEVER prompt text), and the per-project auto-memory
// index. Everything is best-effort: any failure degrades to an empty scan.
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { detectStack, mergeStacks } from "./detect";

/** Only the most recently active projects are scanned — stale stacks from
 * years-old projects should not shape the suggested profile. */
const MAX_RECENT_PROJECTS = 15;
const MAX_DEPTH = 2;
const MAX_DIRS_PER_PROJECT = 40;
const MAX_TOTAL_DIRS = 400;
const MEMORY_EXCERPT_CHARS = 1200;

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "venv",
  "__pycache__",
  "Pods",
  "DerivedData",
  "target",
  "tmp",
]);

/** exampleFiles (pre-computed by Claude Code) → topics the manifest walk may miss. */
const EXTENSION_TOPICS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".swift": "swift",
  ".java": "java",
  ".kt": "java",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".sql": "sql",
  ".tf": "terraform",
};

export interface ClaudeProjectSignal {
  name: string;
  path: string;
  topics: string[];
  prompt_count: number;
  last_activity: string | null;
  memory: string | null;
}

export interface ClaudeHistoryScan {
  detected_stack: Record<string, number>;
  projects: ClaudeProjectSignal[];
  scanned_projects: number;
}

const EMPTY_SCAN: ClaudeHistoryScan = { detected_stack: {}, projects: [], scanned_projects: 0 };

/**
 * Where the Claude Code data lives. `DEVCOACH_CLAUDE_DIR` is the devcoach-specific
 * sandbox override (tests/e2e — mirrors DEVCOACH_DIR in db.ts); `CLAUDE_CONFIG_DIR`
 * is Claude Code's own relocation (everything inside one dir). By default the config
 * json sits NEXT TO ~/.claude, not inside it.
 */
function resolvePaths(): { configPath: string; historyPath: string; projectsDir: string } {
  const override = process.env.DEVCOACH_CLAUDE_DIR ?? process.env.CLAUDE_CONFIG_DIR;
  const dir = override ?? join(homedir(), ".claude");
  return {
    configPath: override ? join(dir, ".claude.json") : join(homedir(), ".claude.json"),
    historyPath: join(dir, "history.jsonl"),
    projectsDir: join(dir, "projects"),
  };
}

function realpathSafe(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Throwaway cwds (system temp, e2e sandboxes) are noise — unless they live under
 * the (possibly sandboxed) HOME, which is how tests build fixtures.
 */
function isNoisePath(path: string): boolean {
  const real = realpathSafe(path);
  if (real.startsWith(realpathSafe(homedir()))) return false;
  return real.startsWith(realpathSafe(tmpdir())) || real.startsWith("/private/");
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Breadth-first manifest detection: detectStack per visited dir, bounded caps. */
function detectProjectStack(root: string, totalBudget: { left: number }): Record<string, number> {
  const stacks: Record<string, number>[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_DIRS_PER_PROJECT && totalBudget.left > 0) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    visited++;
    totalBudget.left--;
    stacks.push(detectStack(dir));
    if (depth >= MAX_DEPTH) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || IGNORED_DIRS.has(entry)) continue;
      const child = join(dir, entry);
      if (isDirectory(child)) queue.push({ dir: child, depth: depth + 1 });
    }
  }
  return mergeStacks(...stacks);
}

function topicsFromExampleFiles(exampleFiles: unknown): Record<string, number> {
  const stack: Record<string, number> = {};
  if (!Array.isArray(exampleFiles)) return stack;
  for (const file of exampleFiles) {
    if (typeof file !== "string") continue;
    const dot = file.lastIndexOf(".");
    const topic = dot >= 0 ? EXTENSION_TOPICS[file.slice(dot).toLowerCase()] : undefined;
    if (topic) stack[topic] = Math.max(stack[topic] ?? 0, 5);
  }
  return stack;
}

/** history.jsonl → per-project {count, last}. Reads ONLY project/timestamp fields. */
function readActivity(historyPath: string): Map<string, { count: number; last: number }> {
  const activity = new Map<string, { count: number; last: number }>();
  let raw: string;
  try {
    raw = readFileSync(historyPath, "utf8");
  } catch {
    return activity;
  }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line) as { project?: unknown; timestamp?: unknown };
      if (typeof entry.project !== "string") continue;
      const ts = typeof entry.timestamp === "number" ? entry.timestamp : 0;
      const prev = activity.get(entry.project) ?? { count: 0, last: 0 };
      activity.set(entry.project, { count: prev.count + 1, last: Math.max(prev.last, ts) });
    } catch {
      // skip garbage lines
    }
  }
  return activity;
}

/** The project's auto-memory index (memory/MEMORY.md), as a capped excerpt. */
function readMemoryExcerpt(projectsDir: string, projectPath: string): string | null {
  const escaped = projectPath.replace(/[^a-zA-Z0-9]/g, "-");
  const text = (() => {
    try {
      return readFileSync(join(projectsDir, escaped, "memory", "MEMORY.md"), "utf8").trim();
    } catch {
      return null;
    }
  })();
  if (!text) return null;
  return text.length > MEMORY_EXCERPT_CHARS ? `${text.slice(0, MEMORY_EXCERPT_CHARS)}…` : text;
}

/**
 * Scan the full Claude Code history for the user's real tech stack: every project
 * Claude Code has worked in (bounded to the most recently active), not just the cwd.
 */
export function scanClaudeHistory(): ClaudeHistoryScan {
  try {
    const { configPath, historyPath, projectsDir } = resolvePaths();
    let projectsMap: Record<string, { exampleFiles?: unknown }>;
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      projectsMap = config?.projects ?? {};
    } catch {
      return EMPTY_SCAN;
    }

    const activity = readActivity(historyPath);
    const candidates = Object.keys(projectsMap)
      .filter((p) => !isNoisePath(p) && isDirectory(p))
      .sort((a, b) => (activity.get(b)?.last ?? 0) - (activity.get(a)?.last ?? 0))
      .slice(0, MAX_RECENT_PROJECTS);

    const totalBudget = { left: MAX_TOTAL_DIRS };
    const perProject: Array<{ signal: ClaudeProjectSignal; stack: Record<string, number> }> = [];
    for (const path of candidates) {
      const stack = mergeStacks(
        detectProjectStack(path, totalBudget),
        topicsFromExampleFiles(projectsMap[path]?.exampleFiles),
      );
      const memory = readMemoryExcerpt(projectsDir, path);
      if (Object.keys(stack).length === 0 && memory === null) continue;
      const seen = activity.get(path);
      perProject.push({
        stack,
        signal: {
          name: basename(path),
          path,
          topics: Object.keys(stack).sort(),
          prompt_count: seen?.count ?? 0,
          last_activity: seen?.last ? new Date(seen.last).toISOString() : null,
          memory,
        },
      });
    }

    const detected_stack = mergeStacks(...perProject.map((p) => p.stack));
    // A topic seen across ≥3 projects is daily-driver territory: nudge it up (cap 8 —
    // presence is not mastery; the user confirms real confidence during onboarding).
    for (const [topic, confidence] of Object.entries(detected_stack)) {
      const spread = perProject.filter((p) => p.stack[topic] !== undefined).length;
      if (spread >= 3 && confidence < 8) detected_stack[topic] = confidence + 1;
    }

    return {
      detected_stack,
      projects: perProject
        .map((p) => p.signal)
        .sort((a, b) => b.prompt_count - a.prompt_count)
        .slice(0, 20),
      scanned_projects: candidates.length,
    };
  } catch {
    return EMPTY_SCAN;
  }
}
