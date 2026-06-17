# devcoach

[![npm](https://img.shields.io/npm/v/devcoach?logo=npm)](https://www.npmjs.com/package/devcoach)
[![CI](https://github.com/UltimaPhoenix/dev-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/UltimaPhoenix/dev-coach/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

**Progressive technical coaching that lives inside your AI agent.** devcoach connects to Claude Code, Claude Desktop, Cursor, Windsurf, and other MCP-compatible tools. After every task you complete, it delivers a short targeted lesson calibrated to what you already know — no generic tutorials, no repeated topics, nothing to open.

Everything runs **locally**. No data leaves your machine. One SQLite file at `~/.devcoach/coaching.db`.

> Built on the official [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), Node's embedded `node:sqlite`, [Hono](https://hono.dev) (web dashboard), and [Commander](https://github.com/tj/commander.js) (CLI). Requires **Node.js ≥ 24**.

---

## How it works

```mermaid
flowchart TD
    A([Task completed]) --> B[Check rate limit]
    B -->|denied| Z([Silent])
    B -->|allowed| D

    subgraph loop["coaching loop"]
        D[Select topic & depth]
        E[Compose & deliver]
        G[log_lesson]
    end

    D -->|nothing| Z
    D -->|found| E
    E --> G
    G --> F([Done])
    G -.->|prompts| U(["You: ✅ ❌ ⏭"])
```

→ [Full decision flow: session startup · lesson selection · depth calibration](docs/how-it-works.md)

---

## Get started in 2 steps

### Step 1 — Install

| Method | Command | Requirements |
|--------|---------|--------------|
| **npx** (no install) | _(used directly in the MCP config below)_ | Node.js ≥ 24 |
| **npm** (global) | `npm install -g devcoach` | Node.js ≥ 24 |
| **Desktop Extension** (`.mcpb`) | one-click — see below | Claude Desktop (bundles its own Node) |

The recommended path is **npx** — no global install, always the latest version, used directly in your agent's MCP config.

<details>
<summary><strong>Claude Desktop one-click extension</strong> (<code>.mcpb</code>)</summary>

Claude Desktop installs devcoach from a single bundle — no Node or terminal needed (it runs on Desktop's
bundled runtime). Build the bundle and install it:

```bash
npm run mcpb        # → dist-mcpb/devcoach-<version>.mcpb
# Claude Desktop → Settings → Extensions → Install Extension… → pick the .mcpb
```

`npm run mcpb:sign` self-signs it (installs as an *unverified publisher*; a real code-signing cert is
needed for a verified signature). Prebuilt `.mcpb` releases and a Desktop directory listing are planned.

</details>

### Step 2 — Connect to your AI agent

```bash
npx -y devcoach install
```

This registers devcoach as an MCP server and sets up automatic lesson delivery. Restart your agent after running.

<details>
<summary><strong>Connect to other agents</strong> (Cursor, Windsurf, Cline, Continue, Zed…)</summary>

Add this to your agent's MCP config file:

```json
{
  "mcpServers": {
    "devcoach": {
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

| Agent | Config file |
|-------|-------------|
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Cline** (VS Code) | VS Code Settings → `cline.mcpServers` |
| **Continue.dev** | `~/.continue/config.json` → `mcpServers` |
| **Zed** | `.zed/settings.json` → `context_servers` |

> Stop hooks (automatic lesson delivery after each task) are Claude Code-specific. Other agents have full access to all MCP tools and resources — coaching can be triggered manually or by prompting your agent.

</details>

<details>
<summary><strong>Manual setup</strong> (if <code>devcoach install</code> is not available)</summary>

#### Claude Code

**Option A — via the `claude mcp` CLI (recommended):**

```bash
claude mcp add devcoach npx -- -y devcoach mcp

# all projects (user scope)
claude mcp add --scope user devcoach npx -- -y devcoach mcp
```

**Option B — edit `~/.claude.json` directly:**

```json
{ "mcpServers": { "devcoach": { "type": "stdio", "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

Then add the Stop hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "npx -y devcoach onboard-hook" }] },
      { "hooks": [{ "type": "command", "command": "npx -y devcoach lesson-ready" }] }
    ]
  }
}
```

> Tip: a global install (`npm i -g devcoach`) lets you drop the `npx -y` prefix and use `devcoach` directly in every command above.

#### Claude Desktop

Edit the config file for your platform:

| Platform | Config file |
|----------|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "devcoach": {
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

#### Claude.ai web (skill copy)

Claude.ai does not support MCP servers. Install the coaching instructions as a skill instead:

1. Copy the content of [`assets/SKILL.md`](assets/SKILL.md)
2. Go to **claude.ai → Settings → Custom instructions** (or Skills, depending on your plan)
3. Paste the content and save

This gives claude.ai the coaching behaviour without the MCP tools (lesson logging and profile tracking will not work).

> **Keep the skill up to date.** For Claude Code / Claude Desktop, the skill is served automatically via the MCP prompt and is always current. If you copied it manually to Claude.ai, re-paste the latest `SKILL.md` after each devcoach update.

</details>

---

## Onboarding

The first time your agent connects to devcoach it detects that your profile isn't set up and walks you through it inline — no separate command needed.

### Phase 1 — Choose how to set up your profile

```
devcoach: Your knowledge profile isn't set up yet.

Do you have an existing devcoach backup to restore?
If yes, provide the file path — otherwise I'll help you build your profile from scratch.
```

**Option A — restore from backup:** If you're on a new machine or reinstalling, provide the path to your backup zip and your full profile (knowledge map, lessons, settings) is imported instantly.

**Option B — build from scratch:** Choose between automatic detection or a guided conversation.

### Phase 2 — Build your profile

#### Automatic (recommended)

devcoach scans your project files and proposes your stack:

```
I detected these technologies in your project:

  typescript     → confidence 6  (keep? or enter 0–10 to adjust)
  docker         → confidence 7  (keep? or enter 0–10 to adjust)
  github_actions → confidence 6  (keep? or enter 0–10 to adjust)
  react          → confidence 5  (keep? or enter 0–10 to adjust)

Anything I missed? List any tools, languages, or practices you work with regularly.
```

You confirm, adjust scores, or add topics the scan missed. Then devcoach proposes logical groups:

```
Here's how I'd organise these:

  Languages  → typescript, javascript
  Frontend   → react, html_css
  DevOps     → docker, github_actions
  Databases  → postgresql, redis

Does this look right? Any changes?
```

#### Guided conversation

If you prefer to describe your stack manually, devcoach asks about each technology and your confidence level (1–3 still learning · 4–6 comfortable · 7–9 strong · 10 expert), then saves the profile.

### Phase 3 — Profile saved, coaching begins

```
✓ Profile saved — 24 topics across 6 groups.

From now on I'll deliver a short lesson after technical tasks,
calibrated to your current confidence on each topic.
```

That's it. You go back to work. Coaching happens silently in the background.

---

## Your first lesson

You work on a task as normal. After your agent responds, devcoach appends a lesson:

```
You: Refactor this endpoint to handle concurrent requests properly.

Agent: [refactors the code, explains the changes]

---
🎓 devcoach · TypeScript · Level: Mid

**Promise.allSettled vs Promise.all — don't let one failure sink the batch**

Promise.all rejects the moment any promise rejects, and you lose the results of
the ones that already succeeded. For independent work (fan-out fetches, batch
writes) that's usually the wrong default.

Promise.allSettled always resolves, giving you a status for every promise:

    const results = await Promise.allSettled(ids.map(fetchUser));
    const ok = results.filter(r => r.status === "fulfilled").map(r => r.value);

Use Promise.all when the tasks are genuinely all-or-nothing; reach for
allSettled when partial success is meaningful and you want to report failures.

💡 Senior tip: for coordinated work that *should* cancel siblings on failure,
   an AbortController shared across the requests gives you all-or-nothing with
   prompt cancellation — the structured-concurrency middle ground.

Did that land?  ✅ know · ❌ don't know · ⏭ skip
```

Responding adjusts your confidence on that topic and shapes future lessons.

---

## Screenshots

|                       Knowledge map                       | Lesson history | Settings |
|:---------------------------------------------------------:|:---:|:---:|
| ![Knowledge map](docs/screenshots/knowledge-map-dark.png) | ![Lessons](docs/screenshots/lessons-dark.png) | ![Settings](docs/screenshots/settings-dark.png) |

---

## Web dashboard

Open the dashboard at any time to review your progress, edit your profile, or manage settings:

```bash
npx -y devcoach ui   # → http://localhost:7860
```

| Page | What you can do |
|------|-----------------|
| **Knowledge map** | See all topics with confidence bars; adjust scores directly |
| **Lessons** | Browse and filter your full lesson history; star lessons to revisit |
| **Settings** | Change rate limits, import/export your profile, take a backup |

Full reference: [docs/web-ui.md](docs/web-ui.md)

---

## CLI reference

The CLI is a secondary interface for querying and managing your coaching data. Everything is also available in the [web dashboard](#web-dashboard). Run `devcoach --help` or `devcoach <command> --help` for full usage.

| Command | Description |
|---------|-------------|
| `devcoach install` | Register with Claude Code / Claude Desktop |
| `devcoach profile` | Show your knowledge map with confidence bars |
| `devcoach stats` | Overview: lesson counts, weakest/strongest topics |
| `devcoach lessons` | Browse lesson history with filters |
| `devcoach lesson <id>` | Show a single lesson in full |
| `devcoach star <id>` | Mark a lesson as starred |
| `devcoach feedback <id> <know\|dont_know\|clear>` | Record comprehension |
| `devcoach set max_per_day <n>` | Max lessons per day (default 2) |
| `devcoach set min_gap_minutes <n>` | Minutes between lessons (default 240) |
| `devcoach backup [file.zip]` | Export knowledge + lessons + settings |
| `devcoach restore <file.zip>` | Restore from a backup |
| `devcoach setup` | Run the onboarding wizard in the terminal |
| `devcoach ui` | Open the web dashboard |

(Prefix with `npx -y` if you haven't installed globally.) Full reference: [docs/cli.md](docs/cli.md)

---

## Configuration

```bash
devcoach set max_per_day 3        # up to 3 lessons per day
devcoach set min_gap_minutes 120  # at least 2 hours between lessons
```

Settings are stored in `~/.devcoach/coaching.db`. See [docs/configuration.md](docs/configuration.md) for all options.

---

## Uninstallation

```bash
npm uninstall -g devcoach          # if installed globally (npx: nothing to remove)
claude mcp remove devcoach         # remove from Claude Code
rm -rf ~/.devcoach                 # delete all coaching data (back up first: devcoach backup)
```

For Claude Desktop, delete the `devcoach` key from the platform config file (paths in **Manual setup** above). Also remove the two hook entries from `~/.claude/settings.json` → `hooks.Stop`.

---

## Development

```bash
git clone https://github.com/UltimaPhoenix/dev-coach && cd dev-coach
npm install
npm run dev -- mcp        # run the MCP server from source
npm run dev -- ui         # run the web dashboard from source
npm run lint && npm run typecheck && npm test
npm run build             # tsup → dist/bin.js
npm run mcpb              # build the Claude Desktop .mcpb (npm run mcpb:sign to self-sign)
```

- **MCP Inspector:** `npx @modelcontextprotocol/inspector node dist/bin.js mcp`
- **Stack:** `@modelcontextprotocol/sdk` · `node:sqlite` · Hono · Commander · Zod · Biome · Vitest · tsup

### Publishing a release

Tag a commit with `v*`:

```bash
git tag v1.2.3 && git push origin v1.2.3
```

CI lints, type-checks, tests (Node 24 & 26), builds, and publishes to npm via **OIDC provenance**
(`npm publish --provenance`). First-time setup: configure a Trusted Publisher on npmjs.com for the
`devcoach` package (GitHub Actions, repo `UltimaPhoenix/dev-coach`, workflow `ci.yml`).

---

## License

Copyright 2026 [UltimaPhoenix](https://github.com/UltimaPhoenix)

Licensed under the [Apache License, Version 2.0](LICENSE). Free to use, modify, and distribute;
commercial use and modifications must retain the license, copyright, and attribution notices and state
any changes. You may not use the `devcoach` name or branding to endorse derived products without permission.
