// Unit tests for the cross-project history scan, against a fake ~/.claude built in
// the per-file sandbox HOME (tests/setup.ts). Every path is resolved at call time.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { scanClaudeHistory } from "../src/core/claude-history";

const home = (): string => process.env.HOME as string;
const configPath = (): string => join(home(), ".claude.json");
const claudeDir = (): string => join(home(), ".claude");

function project(name: string, files: Record<string, string> = {}): string {
  const dir = join(home(), "projects", name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

function writeConfig(projects: Record<string, { exampleFiles?: string[] }>): void {
  writeFileSync(configPath(), JSON.stringify({ projects }));
}

function writeHistory(lines: Array<object | string>): void {
  mkdirSync(claudeDir(), { recursive: true });
  writeFileSync(
    join(claudeDir(), "history.jsonl"),
    lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n"),
  );
}

describe("scanClaudeHistory", () => {
  beforeEach(() => {
    mkdirSync(claudeDir(), { recursive: true });
  });

  it("merges stacks across projects, filters noise, and never leaks prompt text", () => {
    const webapp = project("webapp", {
      "package.json": JSON.stringify({ dependencies: { react: "^19" } }),
    });
    const iosapp = project("iosapp");
    mkdirSync(join(iosapp, "app", "Thing.xcodeproj"), { recursive: true }); // nested only
    const iosnotes = project("iosnotes"); // empty on disk — exampleFiles carry the signal
    const noise = mkdtempSync(join(tmpdir(), "dc-noise-")); // temp cwd OUTSIDE the sandbox HOME
    writeFileSync(join(noise, "go.mod"), "module noise");

    writeConfig({
      [webapp]: {},
      [iosapp]: {},
      [iosnotes]: { exampleFiles: ["Sources/Main.swift"] },
      [join(home(), "gone")]: {}, // no longer exists on disk
      [noise]: {},
    });
    writeHistory([
      { display: "SECRET-PROMPT-TEXT", project: webapp, timestamp: 1_750_000_000_000 },
      { project: webapp, timestamp: 1_750_000_100_000 },
      { project: webapp, timestamp: 1_750_000_200_000 },
      { project: iosapp, timestamp: 1_750_000_300_000 },
      "not json at all",
    ]);

    // Auto-memory index for webapp (escaped real project path, forward mapping).
    const escaped = webapp.replace(/[^a-zA-Z0-9]/g, "-");
    mkdirSync(join(claudeDir(), "projects", escaped, "memory"), { recursive: true });
    writeFileSync(
      join(claudeDir(), "projects", escaped, "memory", "MEMORY.md"),
      "# Memory Index\n- prefers strict TypeScript",
    );

    const scan = scanClaudeHistory();
    expect(scan.scanned_projects).toBe(3); // gone + noise filtered out
    expect(scan.detected_stack.javascript).toBe(6);
    expect(scan.detected_stack.react).toBe(6);
    expect(scan.detected_stack.swift).toBe(6); // nested *.xcodeproj beats exampleFiles' 5
    expect(scan.detected_stack.go).toBeUndefined(); // noise project excluded

    expect(scan.projects[0]?.name).toBe("webapp"); // most prompts first
    expect(scan.projects[0]?.prompt_count).toBe(3);
    expect(scan.projects[0]?.last_activity).toBe(new Date(1_750_000_200_000).toISOString());
    expect(scan.projects[0]?.topics).toContain("react");
    expect(scan.projects[0]?.memory).toContain("strict TypeScript");

    expect(JSON.stringify(scan)).not.toContain("SECRET-PROMPT-TEXT");
  });

  it("boosts topics seen across ≥3 projects by one, capped at 8", () => {
    const paths = ["alpha", "beta", "gamma"].map((n) =>
      project(n, { "go.mod": `module ${n}`, Dockerfile: "FROM scratch" }),
    );
    writeConfig(Object.fromEntries(paths.map((p) => [p, {}])));
    writeHistory([]);

    const scan = scanClaudeHistory();
    expect(scan.detected_stack.go).toBe(7); // 6 + spread boost
    expect(scan.detected_stack.docker).toBe(8); // 7 + boost, capped
  });

  it("caps the memory excerpt", () => {
    const noted = project("noted");
    writeConfig({ [noted]: {} });
    writeHistory([]);
    const escaped = noted.replace(/[^a-zA-Z0-9]/g, "-");
    mkdirSync(join(claudeDir(), "projects", escaped, "memory"), { recursive: true });
    writeFileSync(join(claudeDir(), "projects", escaped, "memory", "MEMORY.md"), "x".repeat(5000));

    const memory = scanClaudeHistory().projects[0]?.memory;
    expect(memory?.endsWith("…")).toBe(true);
    expect(memory?.length).toBeLessThanOrEqual(1201);
  });

  it("degrades to an empty scan on missing or corrupt ~/.claude.json", () => {
    writeFileSync(configPath(), "{ definitely not json");
    expect(scanClaudeHistory()).toEqual({ detected_stack: {}, projects: [], scanned_projects: 0 });
  });
});
