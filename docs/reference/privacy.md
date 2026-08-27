---
title: Privacy & security
sidebar_label: Privacy & security
---

# Privacy & security

devcoach is **local-first and single-user by design**. Everything it does happens on the machine where your
agent runs.

## Everything stays on your machine

- All your data lives in **one SQLite file**: `~/.devcoach/coaching.db` (plus an optional
  `~/.devcoach/learning-state.md` notebook). Nothing else, nowhere else.
- devcoach makes **no network calls of its own** and sends **no telemetry**. Your knowledge map, lessons,
  feedback, and project/git context never leave your computer.
- It runs as a local **stdio** process started by your agent — there's no server to expose, no account, and
  no login.

## Why it can't be a hosted / remote connector

claude.ai web and other "remote MCP" connectors require a multi-tenant HTTP/OAuth server. devcoach
deliberately writes to your local home directory, so it **cannot** run as a remote connector — that
local-only constraint is the whole point. On claude.ai you can still use the
[skill copy](../install/claude-ai.md), which provides the coaching behaviour without any data storage.

## Backups are plain files

`devcoach backup` produces an **unencrypted** zip (settings, knowledge map, lessons, and the notebook).
Lessons can include snippets of your project context, so treat backups like any other sensitive working
file and store them somewhere you trust. See [Backup, export & import](../usage/cli.md#backup-export--import).

## What devcoach reads

During automatic onboarding devcoach reads a small set of **metadata** sources, locally and read-only,
to suggest topics — never the content of what you typed:

- the `~/.claude.json` projects map — project paths only;
- each project's manifests and lockfiles, via a depth-limited directory walk;
- `~/.claude/history.jsonl` — **only the `project` and `timestamp` fields** of each line, to rank
  projects by recent activity; the prompt text on those lines is never read;
- at most 1200 characters of each project's auto-memory `MEMORY.md`.

Only the 15 most recently active projects are scanned, and any failure degrades to an empty scan.
Git metadata — project, repository, branch, commit — is auto-detected from your working directory and
stored only in your local database, purely to give lessons useful context. devcoach itself makes no
network calls; the only subprocesses it runs are `git` (for that metadata) and, for the plugin /
extension bootstrap, a one-time `npm install` of the pinned package.

**Automatic (Deep) onboarding is the one explicit exception.** It's an opt-in tier you choose at setup
time, clearly labeled as such. If you pick it, the skill first calls `preview_deep_scan` — a
metadata-only pre-check that lists which projects fall inside the chosen date window and lets you
narrow it — and only then spawns a separate subagent that reads real conversation text from your local
Claude Code session history (`~/.claude/projects/<project>/*.jsonl`, at most the 5 most recent
sessions per project). That subagent returns only synthesized topics, groups, and notebook notes —
the raw transcripts never enter your main conversation. Nothing leaves your machine except as part of
your own conversation with the model, same as anything else in that session. Standard Automatic and
Guided onboarding never read this content — only Deep does, and only when you choose it.
