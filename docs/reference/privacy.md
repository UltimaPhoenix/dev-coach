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

During automatic onboarding devcoach reads project files locally (manifests, lockfiles) to suggest topics.
Git metadata — project, repository, branch, commit — is auto-detected from your working directory and
stored only in your local database, purely to give lessons useful context.
