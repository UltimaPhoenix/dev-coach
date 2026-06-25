# Security Policy

## Supported versions

devcoach is distributed via npm and as a Claude Desktop extension. Only the **latest released
version** receives security fixes. Please upgrade before reporting an issue.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's **[Report a vulnerability](https://github.com/UltimaPhoenix/dev-coach/security/advisories/new)**
form (Security → Advisories). This opens a private channel with the maintainer.

When reporting, please include:

- a description of the vulnerability and its impact,
- the version affected (`npx devcoach --version`),
- steps to reproduce, and
- any suggested remediation, if you have one.

You can expect an initial acknowledgement within a few days. Once a fix is released, we are happy to
credit you in the changelog unless you prefer to remain anonymous.

## Scope notes

devcoach is a **local** tool: it stores everything in a single SQLite file at `~/.devcoach/coaching.db`
and talks to your agent over stdio (MCP). It opens a local web dashboard only on demand. Reports about
local data handling, the dashboard server, and the MCP surface are all in scope.
