---
title: License & commercial use
sidebar_label: License
description: devcoach is free and open source under AGPL-3.0, for everyone, including at work. Using it never puts your own code under the AGPL. Here is what that means, with examples.
---

# License & commercial use

devcoach is **free and open source**, licensed under the
[GNU Affero General Public License v3.0](https://github.com/UltimaPhoenix/dev-coach/blob/main/LICENSE)
(<code style={{whiteSpace: "nowrap"}}>AGPL-3.0-only</code>).

You may use, modify and distribute it. Whoever you give a copy to, modified or not, gets it under the
same license, with its source. If you change devcoach and let others use your version over a network,
you offer them your modified source too.

:::tip[Free for everyone]
Free to download, install and use, for everyone, including at work and on commercial projects. There
is nothing to pay for: no paid tier, no subscription. The AGPL's conditions only come into play when you
distribute devcoach or host a modified version of it.
:::

## Does it put my code under the AGPL? \{#does-using-devcoach-put-my-code-under-the-agpl\}

**No.** devcoach runs as a *separate process*: your agent starts it
(<code style={{whiteSpace: "nowrap"}}>npx -y devcoach mcp</code>, for example) and talks to it over
stdio (MCP). Talking to it at arm's length is not a derivative work, much like querying an
AGPL-licensed database. **Your own projects keep whatever license you choose.**

The copyleft only reaches *devcoach's own source code*. You have changes of your own to release only
when you **modify and then distribute or host** that modified devcoach.

## Examples

| Verdict | Scenario and what it means |
| --- | --- |
| ✅ **Free** | *I use devcoach inside Claude Code while building my closed-source startup app.* Your app stays proprietary, with zero obligations. |
| ✅ **Free** | *My whole team installs devcoach to get coaching on our internal or commercial repos.* Using the unmodified tool at a company is fine. |
| ⚠️ **Release your changes** | *I fork devcoach, add a feature, and publish the package or host its dashboard as a public service.* You must release **your modified devcoach** source under the AGPL. |
| 💼 **Ask first** | *I want to embed devcoach in my paid product and keep my changes closed.* Not covered by the AGPL: [open an issue](https://github.com/UltimaPhoenix/dev-coach/issues) and ask. |

## Commercial license

There is **no commercial license on offer today**. devcoach is distributed under the AGPL only, and
that covers every ordinary use, at home or at work. If you need to embed devcoach in a
**closed-source product**, [open an issue](https://github.com/UltimaPhoenix/dev-coach/issues) and ask.

## Third-party code

devcoach redistributes seven small browser libraries, vendored as files. Each keeps its own license,
and all of them are compatible with distribution under the AGPL. Versions and where each notice lives:
[THIRD_PARTY_NOTICES.md](https://github.com/UltimaPhoenix/dev-coach/blob/main/THIRD_PARTY_NOTICES.md).

| Library | License | Used for |
| --- | --- | --- |
| highlight.js | BSD-3-Clause | code blocks in lesson pages, and inside course documents |
| marked | MIT | lesson markdown in the dashboard |
| DOMPurify | Apache-2.0 OR MPL-2.0 | sanitising rendered markdown |
| flatpickr | MIT | the date range picker |
| Alpine.js | MIT | dashboard interactions |
| htmx | BSD-2-Clause | partial page updates |
| Tailwind CSS | MIT | dashboard styling |

A [course](../usage/courses.md) document that shows code carries highlight.js **inside the file**,
and the inlined block starts with the library's full license text, as the BSD-3-Clause terms ask.
Keep that comment when you copy, publish or share a course document: publishing it as a Claude
artifact redistributes the library too. The course itself (the text, examples and scripts written
for you) is yours.

## Contributing

Contributions are welcome: [CONTRIBUTING](https://github.com/UltimaPhoenix/dev-coach/blob/main/CONTRIBUTING.md)
explains how to get started.

Every contributor signs the
[Contributor License Agreement](https://github.com/UltimaPhoenix/dev-coach/blob/main/CLA.md) (CLA)
once, and a pull request cannot be merged before that (the maintainer's account and the Dependabot
and GitHub Actions bots are exempt). On your first pull request the CLA Assistant bot asks you to
sign by posting this exact comment:

> `I have read the CLA Document and I hereby sign the CLA`

By signing, for all your current and future contributions:

| You | Details |
| --- | --- |
| **confirm** | that the contribution is your original work and yours to give (with your employer's permission, if it has rights in what you create), that you have marked any part that is not, and that, as far as you know, it violates no one else's license, patent, copyright, trademark or other right |
| **grant** | the maintainer, and everyone who receives software the maintainer distributes, a perpetual, worldwide, non-exclusive, royalty-free, irrevocable copyright license and a patent license on your contribution |
| **agree** | that the maintainer may license your contribution under any terms: the AGPL-3.0, any other open-source license, or proprietary and commercial terms |

No commercial license is offered today. If one is ever granted for a closed-source use, the
maintainer must hold the right to relicense every contribution: that is why the CLA exists.

This page summarises the license. The
[LICENSE](https://github.com/UltimaPhoenix/dev-coach/blob/main/LICENSE) text and the
[CLA](https://github.com/UltimaPhoenix/dev-coach/blob/main/CLA.md) are what apply.
