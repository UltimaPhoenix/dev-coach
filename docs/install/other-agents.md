---
title: Other MCP agents
description: Add devcoach to Cursor, Windsurf, Cline, Continue or Zed with the MCP entry each agent expects. You get devcoach's tools, your profile, and lessons when you ask for them.
keywords: [devcoach cursor, devcoach windsurf, devcoach cline, devcoach continue, devcoach zed, mcp server config, cursor mcp.json, zed context_servers, MCP Registry]
---

import { Card, Cards } from "@site/src/components/Cards";
import WrapTabs from "@site/src/components/WrapTabs";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

# Other MCP agents

## What you get here

<Cards columns={3}>
  <Card label="Yes" title="All 25 tools">
    Your agent can build your profile, save and find lessons, share them and run courses.
  </Card>
  <Card label="When you ask" title="Lessons">
    devcoach has no hooks in these agents, so no lesson comes on its own after a task.
  </Card>
  <Card label="A prompt only" title="The devcoach skill">
    Not installed here. Its rules reach the agent through the **devcoach_instructions** prompt, if your agent lists MCP prompts.
  </Card>
</Cards>

Say *set up devcoach* once to build your profile, then ask for a lesson when you want one: *teach me
something from what we just did*. Every agent on this computer shares one profile and one set of
lessons (`~/.devcoach/`).

:::tip[Using Claude Code, Gemini CLI or Codex CLI?]

devcoach wires automatic lessons only into those three: use the
[Claude Code plugin](./claude-code-plugin.md), [Gemini CLI](./gemini-cli.md) *(beta)* or
[Codex CLI](./codex.md) *(beta)* page. Every agent side by side: [what each agent gets](./index.md).

:::

## You need

- **Node.js 24 or newer**, on the PATH your agent starts programs with (`node --version` shows
  yours). devcoach uses Node's built-in SQLite; on an older Node it stops with a message
  ([below](#if-it-doesnt-work)).
- **The network when the agent starts devcoach:** npx downloads it from npm the first time and checks
  for a new release at each start.

## Add devcoach

Every agent starts the same command, `npx -y devcoach mcp`: the program `npx` with three arguments,
`-y`, `devcoach` and `mcp`. Only the place and the format differ. Pick your agent: Cursor, Windsurf,
Cline, Continue or Zed.

<WrapTabs>
<TabItem value="cursor" label="Cursor" default>

**File:** `~/.cursor/mcp.json` in your home folder, for every project. For one project only, use
`.cursor/mcp.json` in that project.

```json title="~/.cursor/mcp.json"
{
  "mcpServers": {
    "devcoach": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

Already have servers there? Add the `devcoach` entry inside your `mcpServers`.

</TabItem>
<TabItem value="windsurf" label="Windsurf">

**Not verified for this page.** Windsurf keeps its MCP servers in the settings of Cascade, its agent,
which can also open the raw config file. This page could not confirm Windsurf's current file and
format: follow [Windsurf's MCP guide](https://docs.windsurf.com/windsurf/cascade/mcp) and give it
the command `npx` with the three arguments `-y`, `devcoach` and `mcp`.

</TabItem>
<TabItem value="cline" label="Cline">

**In VS Code:** in the Cline panel, click the **MCP Servers** icon, open the **Configure** tab, then
click **Configure MCP Servers**. Cline opens its MCP settings file; add the entry under
`mcpServers`:

```json title="cline_mcp_settings.json"
{
  "mcpServers": {
    "devcoach": {
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

**Cline CLI:** the same entry goes in `~/.cline/data/settings/cline_mcp_settings.json`, or run
`cline mcp` and add a server there.

</TabItem>
<TabItem value="continue" label="Continue">

**File:** your local `config.yaml`, for every project: `~/.continue/config.yaml` (macOS, Linux) or
`%USERPROFILE%\.continue\config.yaml` (Windows). To open it, use the gear icon next to **Local
Config** in the configs menu above the chat input. Add the entry to its `mcpServers` list:

```yaml title="~/.continue/config.yaml"
mcpServers:
  - name: devcoach
    command: npx
    args:
      - "-y"
      - "devcoach"
      - "mcp"
```

**For one workspace only**, put it in its own file, `.continue/mcpServers/devcoach.yaml` at the top
of the workspace, with the three lines a standalone file needs first:

```yaml title=".continue/mcpServers/devcoach.yaml"
name: devcoach
version: 0.0.1
schema: v1
mcpServers:
  - name: devcoach
    command: npx
    args:
      - "-y"
      - "devcoach"
      - "mcp"
```

Continue uses MCP servers in **agent mode** only.

</TabItem>
<TabItem value="zed" label="Zed">

**In Zed:** Settings → AI → MCP Servers → **Add Server** → **Add Local Server**. Or run
`zed: open settings file` from the command palette and add the entry under `context_servers`:

```json title="settings.json"
{
  "context_servers": {
    "devcoach": {
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"],
      "env": {}
    }
  }
}
```

</TabItem>
</WrapTabs>

If the agent was already open and devcoach does not show up, restart the agent.

### MCP Registry

devcoach is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as
**`io.github.UltimaPhoenix/devcoach`**: the npm package `devcoach`, run over stdio, at the version of
each release. If your client installs servers from the registry, search for that name (or
`devcoach`).

The entry lists no arguments for the command, so check the one your client writes. It must end in
**`mcp`**; add it if it is missing:

```text title="The command your client should run"
npx -y devcoach mcp
```

Without `mcp`, devcoach prints its list of commands and exits, and the client has no server.

## Check it worked

Ask your agent: *which devcoach tools do you have?* It should name tools such as `get_briefing`,
`log_lesson` and `submit_feedback` (25 in all). Then say *set up devcoach* ([First run](#first-run)).

- **Zed** shows a dot next to devcoach in Settings → AI → MCP Servers: green, with the tooltip
  *Server is active*, when it runs.
- **Continue** uses devcoach only in agent mode: switch to it before you ask.

## First run

Say *set up devcoach*. devcoach tells your agent to ask how to build your profile, leading with
Automatic, which starts from the stack of your Claude Code projects when you have some and from
devcoach's general topic map when you don't. Your agent may ask before each devcoach tool call (Zed
does by default).

:::tip[The full coaching rules]

If your agent supports MCP prompts (Cursor and Zed do), add the **devcoach_instructions** prompt,
titled *devcoach coaching instructions*, where your agent lists MCP prompts. It hands your agent the
devcoach skill and its reference files.

:::

Then ask for a lesson when you want one. The web dashboard: ask *open the devcoach dashboard*, or run
`npx -y devcoach ui`.

**You're set.** The rest of this page is for later: [updating](#update), [removing](#remove) and
[fixes](#if-it-doesnt-work).

## Update

npx fetches each new release by itself. Your agent runs it the next time it starts devcoach: restart
the agent. With the [full-path entry](#npx-or-node-not-found), run `npm install -g devcoach`, then
restart the agent. There is no skill or hook to refresh here.

## Remove

Delete the `devcoach` entry where you added it (for a Continue workspace, the file
`.continue/mcpServers/devcoach.yaml`), then restart the agent. To pause devcoach instead, Cursor has a
toggle per server under **Customize** in the sidebar, and Cline's MCP settings can turn a server off.

Your lessons, profile, notebook and courses stay in `~/.devcoach/`, for every agent on this computer
that uses devcoach. To delete them too, back up first if you might come back
(`npx -y devcoach backup` writes `devcoach-backup.zip` in the current folder), then delete the
`~/.devcoach` folder.

## If it doesn't work

| What you see | What to do |
|---|---|
| The agent cannot find `npx` or `node` (for example `spawn npx ENOENT`) | Give it [full paths](#npx-or-node-not-found), below |
| `devcoach <version> needs Node 24 or newer`, then the Node it found and where | That Node is older. Make Node 24 or newer your default (check `node --version` in a new terminal), or put a Node 24 in the [full paths](#npx-or-node-not-found) |
| devcoach starts and stops at once | The command does not end in `mcp`, so devcoach prints its list of commands and exits. Add `mcp` as the last argument |
| Slow to start, or no devcoach offline | npx asks the npm registry at every start and waits out its retries without a network. The [full paths](#npx-or-node-not-found) run without npm |

Anything else: [Troubleshooting](../troubleshooting.md).

### `npx` or `node` not found

An agent started from the Dock, the Start menu or a launcher may not see your terminal's PATH, where
Node version managers (nvm, fnm and others) put Node. Give the agent full paths instead: install
devcoach globally, then point the entry at Node and at devcoach's own script, so nothing depends on
PATH.

<Tabs>
<TabItem value="unix" label="macOS · Linux" default>

```bash
npm install -g devcoach
which node                                    # the command
echo "$(npm root -g)/devcoach/dist/bin.js"    # the first argument
```

```json title="Only command and args change"
"devcoach": {
  "command": "/full/path/to/node",
  "args": ["/full/path/to/node_modules/devcoach/dist/bin.js", "mcp"]
}
```

</TabItem>
<TabItem value="windows" label="Windows">

```powershell
npm install -g devcoach
where.exe node     # the command
npm root -g        # then \devcoach\dist\bin.js: the first argument
```

```json title="Only command and args change"
"devcoach": {
  "command": "C:\\full\\path\\to\\node.exe",
  "args": ["C:\\full\\path\\to\\node_modules\\devcoach\\dist\\bin.js", "mcp"]
}
```

In JSON, each `\` of a path is written `\\`. `devcoach install` writes this same form for Claude
Desktop on Windows.

</TabItem>
</Tabs>

Keep the rest of your agent's entry (Cursor's `"type": "stdio"`, Zed's `"env": {}`); in Continue's
YAML the two values go under `command:` and `args:`. With a Node version manager, both paths belong
to one Node version: after you remove it, run the commands again and update the entry. More on the
[npx / npm page](./npx.md).

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    What a lesson looks like and what your answers do. In these agents, each lesson starts when you ask.
  </Card>
</Cards>
