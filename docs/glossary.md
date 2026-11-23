---
title: Glossary
sidebar_label: Glossary
description: "The words the devcoach docs use, each in a sentence or two: agent, hook, skill, lesson card, knowledge map, confidence, pace, cue, course, share code, and where to read more."
keywords: [devcoach glossary, devcoach terms, lesson cue, knowledge map, devcoach skill, MCP server, coaching notebook]
---

# Glossary

The words these docs use, each in a sentence or two. Every entry ends with a link to the page that
tells the whole story.

## The basics {/* #the-basics */}

### Agent {/* #agent */}

The AI coding program you give tasks to, such as Claude Code, Gemini CLI, Codex CLI, Claude Desktop
or Cursor. It starts devcoach, which runs next to it. Every agent on one computer shares the same
profile and lessons. [What each agent gets →](./install/index.md#what-each-agent-gets)

### MCP server {/* #mcp-server */}

MCP is the Model Context Protocol, the open standard an AI agent uses to call tools from other
programs. The devcoach MCP server runs on your computer and gives your agent 25 tools, 11 resources
and 1 prompt. [MCP server reference →](./reference/mcp-server.md)

### Plugin and extension {/* #plugin */}

devcoach packaged for one agent and installed by that agent, in place of `devcoach install`. The
Claude Code plugin bundles the MCP server, two hooks, the devcoach skill and five slash commands.
[Claude Desktop](./install/claude-desktop.md) and [Gemini CLI](./install/gemini-cli.md) each have an
extension, both in beta. [Claude Code plugin →](./install/claude-code-plugin.md)

### Hook {/* #hook */}

A command your agent runs by itself at a set moment of a turn. Two belong to devcoach: the prompt
hook runs when you send a message, the stop hook when your agent finishes. They check whether a
lesson is due, and devcoach wires them only into Claude Code, Gemini CLI (beta) and Codex CLI
(beta). Codex CLI runs them once you trust them. [One coached turn →](./how-it-works.md#coaching-loop)

### The devcoach skill {/* #skill */}

The rules your agent follows to teach you: which lesson to choose, how deep to go, how to run
onboarding, courses and sharing. Claude Code, Gemini CLI (beta) and Codex CLI (beta) load it, and an
agent that follows it is *the coach* in these docs. In other agents its rules reach the model only
through the `devcoach_instructions` prompt, if you attach it.
[What each agent gets →](./install/index.md#what-each-agent-gets)

## Lessons {/* #lessons */}

### Lesson {/* #lesson */}

One short explanation of something your last task touched and you don't know yet, pitched at your
level on that topic. Your agent writes it when one is due or when you ask, and devcoach saves it.
[Coaching in your agent →](./usage/coaching.md)

### Lesson card {/* #lesson-card */}

How a lesson looks in the chat, at the end of your agent's reply. It shows the lesson's title, topic
and level, its text and a senior tip, with one line under it for your answer.
[Your first lesson →](./usage/coaching.md#your-first-lesson)

### The three answers {/* #answers */}

What you reply on the line under a lesson card. One letter is enough:

- ✅ **knew it** (`y`): your confidence on the topic goes up one point, so its next lessons go
  deeper. In the agent, the coach records it only while the topic is rated below the lesson's level.
- 💡 **understood** (`u`): nothing changes. The level was right.
- ❌ **couldn't follow** (`n`): nothing changes for now. The lesson is kept as the seed of a
  step-by-step course, which the coach offers once.

Later, at a notebook checkpoint, the coach looks at your last ten answers and may move a topic one
point up or down. [The feedback loop →](./usage/coaching.md#the-feedback-loop)

## Your profile {/* #your-profile */}

### Profile {/* #profile */}

Your knowledge map as devcoach stores it: every topic with its confidence and its group. The docs
use both names for it. [Profile in the dashboard →](./usage/web-ui.md#knowledge-map-knowledge)

### Knowledge map {/* #knowledge-map */}

The technologies you use, each rated from 0 to 10. Lessons are pitched from it, and you can change
it whenever you like. [Onboarding →](./usage/coaching.md#onboarding)

### Topic {/* #topic */}

One technology or concept, such as `typescript` or `docker`. A topic in your knowledge map has a
confidence and can sit in a group, and every lesson is on one topic.
[Knowledge map commands →](./usage/cli.md#knowledge-map)

### Confidence and level {/* #confidence */}

Confidence is your rating on one topic, from 0 to 10. It sets the level of that topic's lessons:
junior from 0 to 3, mid from 4 to 6, senior from 7 to 9. At 10, only cutting-edge lessons come.
[How deep it goes →](./how-it-works.md#depth-calibration)

### Onboarding {/* #onboarding */}

Setting up your profile. Where lessons come on their own, devcoach offers it after your first task
and asks how: Automatic (recommended), Automatic (Deep), Guided or Import backup. In any agent you
can say *set up devcoach*. [Onboarding →](./usage/coaching.md#onboarding)

### Coaching notebook {/* #notebook */}

Your agent's notes on how you learn, kept in `~/.devcoach/learning-state.md`. It writes them at
onboarding and updates them at notebook checkpoints. The file is yours to edit.
[The coaching notebook →](./usage/coaching.md#the-coaching-notebook)

## When lessons come {/* #when-lessons-come */}

### Pace {/* #pace */}

How often lessons come. The pace is yours to set, and these are the defaults:

- One cue about every 10 interactions in a chat session (`nudge_every`).
- At most 2 lessons a day (`max_per_day`).
- At least 4 hours apart (`min_gap_minutes`, 240).

Every number is a setting. The last two are the daily limit and the gap: together, the rate limit.
[How often lessons come →](./usage/coaching.md#staying-unobtrusive)

### Interaction {/* #interaction */}

One reply your agent finishes. The hooks count them, per chat session by default, to know when the
next cue is due. In Claude Code and Codex CLI, plan-mode replies don't count.
[How pacing works →](./reference/configuration.md#rate-limits)

### Cue {/* #cue */}

A hook's signal to your agent that a lesson is due. Your agent answers with a lesson or, with
nothing worth teaching, declines. Lesson cues pause while a course is in progress.
[One coached turn →](./how-it-works.md#coaching-loop)

## Courses {/* #courses */}

### Course {/* #course */}

A step-by-step path through one topic, for a lesson you couldn't follow or whenever you ask. The
coach asks what you already know, writes the course as one HTML document in `~/.devcoach/courses/`
and teaches it one step per message. Courses run where the devcoach skill runs.
[Courses →](./usage/courses.md)

### Seed lesson {/* #seed-lesson */}

The lesson a course grows from. A lesson you answer ❌ is kept as a seed, and the coach offers its
course once. You can also start a course from any other lesson, or from a concept with no lesson.
[Other ways to start →](./usage/courses.md#other-ways-to-start)

### Step {/* #step */}

One part of a course, holding one idea with a worked example, a *Try it* box and a *Check yourself*
question. The coach plans three to seven steps and teaches one per message.
[From ❌ to a course →](./usage/courses.md#from--to-a-course)

## Sharing {/* #sharing */}

### Shared lesson {/* #shared-lesson */}

A lesson someone hands over as copyable text, a link or a `.devcoach.md` file. Once imported it sits
in your log, marked with its sender's name, and its topic counts as taught. It never counts against
your daily limit or the gap. [Sharing lessons →](./usage/sharing.md)

### Share code {/* #share-code */}

The one line that carries a whole shared lesson. It starts with `devcoach:lesson:1:`; the copyable
text ends with it and the link holds it after the `#`. Paste the whole text anywhere: every importer
finds the code. [Three ways to hand a lesson over →](./usage/sharing.md#three-ways-to-hand-a-lesson-over)

## Where things are {/* #where-things-are */}

### Web dashboard {/* #dashboard */}

Your lessons, knowledge map, courses and settings in your browser, where you can also change them.
`devcoach ui` opens it, and it listens on `127.0.0.1` only.
[Web dashboard →](./usage/web-ui.md)

### `~/.devcoach` {/* #data-folder */}

The folder your coaching data lives in: a SQLite database (`coaching.db`), the coaching notebook
(`learning-state.md`) and your course files (`courses/`). Every agent on the computer uses it.
[Where it lives →](./reference/data.md#data-location)

### `devcoach doctor` {/* #doctor */}

The command that checks your whole setup and changes nothing. It ends with a Verdict: would the next
turn bring a lesson, and why. Without a `devcoach` command, run `npx -y devcoach doctor`.
[How to read what it prints →](./troubleshooting.md#doctor)
