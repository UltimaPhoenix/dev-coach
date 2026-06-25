---
title: License & commercial use
sidebar_label: License
description: devcoach is free and open source under AGPL-3.0. Using it never puts your own code under the AGPL — here's what that means, with examples.
---

# License & commercial use

devcoach is **free and open source**, licensed under the
[GNU Affero General Public License v3.0](https://github.com/UltimaPhoenix/dev-coach/blob/main/LICENSE)
(`AGPL-3.0-only`).

You may use, modify, and distribute it — **provided that any modified version you distribute, or run
as a network service, is also released as open source under the AGPL**.

:::tip devcoach is and stays 100% free
Free to download, install, and use — for everyone, forever, including at work and on commercial
projects. AGPL is *not* a price tag: you only ever pay if you want to ship a **proprietary/closed
derivative of devcoach itself** without complying with the AGPL.
:::

## Does using devcoach put my code under the AGPL?

**No.** devcoach runs as a *separate process* that talks to your agent over stdio (MCP) — you start it
with `npx -y devcoach mcp`. Talking to it at arm's length is not a derivative work, exactly like
querying an AGPL-licensed database. **Your own projects keep whatever license you choose.**

The copyleft only reaches *devcoach's own source code*, and only when you **modify and then distribute
or host** that modified devcoach.

## Examples

| Scenario | Result |
| --- | --- |
| I use devcoach inside Claude Code while building my closed-source startup app. | ✅ Free. Your app stays proprietary, zero obligations. |
| My whole team installs devcoach to get coaching on our internal/commercial repos. | ✅ Free. Using the unmodified tool at a company is fine. |
| I fork devcoach, add a feature, and publish the package or host its dashboard as a public service. | ⚠️ You must release **your modified devcoach** source under the AGPL. |
| I want to embed devcoach in my paid product and keep my changes closed. | 💼 You need a commercial license. |

:::note Keep it a separate tool
Use devcoach as a tool/executable (the `devcoach` command / MCP server), not as a library you `import`
into your own code, and the AGPL never reaches your project.
:::

## Commercial license

A separate **commercial license** is available for proprietary or closed use without the AGPL's
copyleft obligations — for example, embedding devcoach in a closed-source product or reselling a
derivative. [Open an issue](https://github.com/UltimaPhoenix/dev-coach/issues) to enquire.

## Contributing

Contributions are welcome under the AGPL. Because devcoach is offered under both AGPL and a commercial
license, contributors sign a lightweight
[Contributor License Agreement](https://github.com/UltimaPhoenix/dev-coach/blob/main/CLA.md) — handled
automatically by a bot on your first pull request. See
[CONTRIBUTING](https://github.com/UltimaPhoenix/dev-coach/blob/main/CONTRIBUTING.md) to get started.
