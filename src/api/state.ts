// The coaching state as the model reads it — the payloads behind `devcoach api get_profile`,
// `get_briefing` and `get_onboarding`. One builder per read, shared by the hooks' diagnostics
// and the CLI. Builders never throw: a failure comes back as `{ error }`, so a caller can
// degrade instead of crashing.
import { existsSync, readFileSync, statSync } from "node:fs";
import { scanClaudeHistory } from "../core/claude-history";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { detectStack, mergeStacks } from "../core/detect";
import { detectGitContext } from "../core/git";

export type Payload = Record<string, unknown>;

export function profilePayload(): Payload {
  try {
    return db.withConnection((c) => ({ ...coach.getProfile(c), compat: db.compatOf(c) }));
  } catch (err) {
    return { error: String(err) };
  }
}

export function briefingPayload(): Payload {
  try {
    let notebook = "";
    try {
      if (existsSync(db.LEARNING_STATE_PATH))
        notebook = readFileSync(db.LEARNING_STATE_PATH, "utf8");
    } catch {
      // notebook unreadable — deliver the rest of the briefing without it
    }
    const data = db.withConnection((c) => {
      const knowledgeReady = db.isOnboardingComplete(c).knowledge_ready;
      const notebookReady = notebook.length > 0;
      const rate = coach.checkRateLimit(c);
      const rateLimit: Record<string, unknown> = {
        allowed: rate.allowed,
        total_lessons: db.countFilteredLessons(c),
      };
      if (rate.reason != null) rateLimit.reason = rate.reason;
      return {
        onboarding: {
          knowledge_ready: knowledgeReady,
          notebook_ready: notebookReady,
          needs_onboarding: !(knowledgeReady && notebookReady),
        },
        rate_limit: rateLimit,
        taught_topics: coach.listTaughtTopics(c),
        profile: coach.getProfile(c),
        // Non-null when this devcoach is older than the file: reads work, writes will fail.
        compat: db.compatOf(c),
      };
    });
    return { ...data, notebook, notebook_path: db.LEARNING_STATE_PATH };
  } catch (err) {
    return { error: String(err) };
  }
}

/**
 * What to do with an onboarding payload, said by the payload itself. The Stop hook's cue has
 * the model run `get_onboarding` and does not load the skill, so a rule that lives only in
 * references/onboarding.md never reaches that path: a real session on a machine with no Claude
 * Code history showed the model refusing to build a profile from an empty scan and asking the
 * user again, forever. The rule travels here instead — the hook stays untouched.
 */
export function onboardingNextStep(
  knowledgeReady: boolean,
  notebookReady: boolean,
  hasDetectedStack: boolean,
): string | null {
  if (knowledgeReady && notebookReady) return null;
  if (knowledgeReady) {
    return "The profile exists; only the notebook is missing. Compose it and write it to notebook_path — do not rebuild the topics.";
  }
  const automatic = hasDetectedStack
    ? "Automatic = build the topic map yourself, in one pass, from detected_stack enriched with default_topics."
    : "No Claude Code history was found on this machine (detected_stack is empty). That does NOT block Automatic: use default_topics exactly as returned as the starting map — it is devcoach's general developer baseline, not a guess of yours — and tell the user it is a starting point that corrects itself as they work. Do not stop, do not ask again, do not switch to Guided unless they ask.";
  return (
    "Let the user choose how to set up (lead with Automatic, never pick for them). " +
    `${automatic} ` +
    "Then save with `devcoach api complete_onboarding` and write the notebook to notebook_path, in the same turn. " +
    "The devcoach skill's references/onboarding.md has the full flow when the skill is available."
  );
}

export function onboardingPayload(): Payload {
  try {
    const { status, compat } = db.withConnection((c) => ({
      status: db.isOnboardingComplete(c),
      compat: db.compatOf(c),
    }));
    const knowledgeReady = status.knowledge_ready;
    const notebookReady =
      existsSync(db.LEARNING_STATE_PATH) && statSync(db.LEARNING_STATE_PATH).size > 0;
    const git = detectGitContext();
    const scan = scanClaudeHistory();
    const detected = mergeStacks(detectStack(git.folder ?? process.cwd()), scan.detected_stack);
    return {
      compat,
      knowledge_ready: knowledgeReady,
      notebook_ready: notebookReady,
      needs_onboarding: !(knowledgeReady && notebookReady),
      detected_stack: detected,
      detected_projects: scan.projects,
      scanned_projects: scan.scanned_projects,
      default_topics: db.DEFAULT_PROFILE,
      context_ready: git.branch !== null,
      notebook_path: db.LEARNING_STATE_PATH,
      next_step: onboardingNextStep(
        knowledgeReady,
        notebookReady,
        Object.keys(detected).length > 0,
      ),
    };
  } catch (err) {
    return { error: String(err) };
  }
}
