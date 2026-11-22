// The docs home's opening: what devcoach does in two lines, how to install it for your agent,
// and the coaching loop playing next to it. Commands mirror the per-agent install pages, in the
// order the docs list install methods everywhere.
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import TabItem from "@theme/TabItem";
import Tabs from "@theme/Tabs";
import type { ReactNode } from "react";
import { Card, Cards } from "../Cards";
import LessonLoop from "../LessonLoop";
import styles from "./styles.module.css";

function InstallTabs(): ReactNode {
  return (
    <Tabs groupId="agent" className={styles.tabs}>
      <TabItem value="claude-code" label="Claude Code" default>
        <CodeBlock language="text">
          {"/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace\n/plugin install devcoach@ultimaphoenix"}
        </CodeBlock>
        <p className={styles.hint}>
          Type both lines in Claude Code, then choose <strong>Install for you (user scope)</strong>.{" "}
          <Link to="/install/claude-code-plugin">Plugin guide →</Link>
        </p>
      </TabItem>
      <TabItem value="homebrew" label="Homebrew">
        <CodeBlock language="bash">{"brew install UltimaPhoenix/tap/devcoach\ndevcoach install"}</CodeBlock>
        <p className={styles.hint}>
          macOS and Linux. Brings Node.js and adds the <code>devcoach</code> command.{" "}
          <Link to="/install/homebrew">Homebrew guide →</Link>
        </p>
      </TabItem>
      {/* Windows support ships in 2.8.0: until then the release site serves no installer, so the
          tab gives the canary line, as docs/install/windows.md does. At 2.8.0, both switch to
          `irm https://ultimaphoenix.github.io/dev-coach/install.ps1 | iex`. */}
      <TabItem value="windows" label="Windows">
        <CodeBlock language="powershell">
          {'$env:DEVCOACH_CHANNEL = "next"\nirm https://ultimaphoenix.github.io/dev-coach/next/install.ps1 | iex'}
        </CodeBlock>
        <p className={styles.hint}>
          Beta, from devcoach 2.8.0. Until it is out, this installs the unreleased canary. No admin; brings
          its own Node.js. <Link to="/install/windows">Windows guide →</Link>
        </p>
      </TabItem>
      <TabItem value="npx" label="npx">
        <CodeBlock language="bash">{"npx -y devcoach install"}</CodeBlock>
        <p className={styles.hint}>
          Needs Node.js 24 or newer. <Link to="/install/npx">npx guide →</Link>
        </p>
      </TabItem>
      <TabItem value="desktop" label="Claude Desktop">
        <p className={styles.desktop}>
          Download <code>devcoach-&lt;version&gt;.mcpb</code> from the{" "}
          <a href="https://github.com/UltimaPhoenix/dev-coach/releases/latest">latest release</a>, then
          double-click it or drag it onto Claude Desktop.
        </p>
        <p className={styles.hint}>
          Beta. No terminal, no Node.js to set up. <Link to="/install/claude-desktop">Claude Desktop guide →</Link>
        </p>
      </TabItem>
      <TabItem value="gemini" label="Gemini CLI">
        <CodeBlock language="bash">{"npm install -g devcoach\ndevcoach install --gemini"}</CodeBlock>
        <p className={styles.hint}>
          Beta. Have the <code>devcoach</code> command already? Skip the first line.{" "}
          <Link to="/install/gemini-cli">Gemini CLI guide →</Link>
        </p>
      </TabItem>
      <TabItem value="codex" label="Codex CLI">
        <CodeBlock language="bash">{"npm install -g devcoach\ndevcoach install --codex"}</CodeBlock>
        <p className={styles.hint}>
          Beta. Have the <code>devcoach</code> command already? Skip the first line. Then trust its two hooks
          when Codex asks. <Link to="/install/codex">Codex CLI guide →</Link>
        </p>
      </TabItem>
      <TabItem value="other" label="Other agents">
        <p className={styles.desktop}>
          Cursor, Windsurf, Cline, Continue and Zed each take devcoach as an MCP server entry in their own
          settings.
        </p>
        <p className={styles.hint}>
          <Link to="/install/other-agents">Other MCP agents guide →</Link>
        </p>
      </TabItem>
    </Tabs>
  );
}

export default function Hero(): ReactNode {
  return (
    <section className={`${styles.hero} dc-wide`}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Claude Code · Claude Desktop · Gemini CLI · Codex CLI · Cursor</p>
        <h1 className={styles.title}>
          <span className={styles.accent}>Learn</span> from the code your AI writes.
        </h1>
        <p className={styles.lead}>
          When your agent finishes a task and a lesson is due, devcoach teaches you one thing from it that you
          don't know yet: a short lesson, right in the conversation. Free, 100% local, and quiet by design.
        </p>
        <InstallTabs />
        <p className={styles.agents}>
          Automatic lessons in Claude Code, Gemini CLI and Codex CLI; on request in Claude Desktop and other
          agents. <Link to="/install">What each agent gets →</Link>
        </p>
        <ul className={styles.facts}>
          <li>No account, no telemetry</li>
          <li>Unobtrusive · you set the pace</li>
          <li>Open source · AGPL-3.0</li>
        </ul>
      </div>
      <div className={styles.demo}>
        <LessonLoop />
        <a className={styles.demoLink} href="#see-it">
          Read a full lesson card ↓
        </a>
      </div>
    </section>
  );
}

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "You work as usual",
    body: "Ask your agent for a feature, a fix, a refactor. Nothing to open, no command to run.",
  },
  {
    title: "A lesson lands",
    body: "When one is due, a short card on something that task touched and you don't know yet, pitched at your level.",
  },
  {
    title: "You answer with one key",
    body: (
      <>
        <code>y</code> knew it · <code>u</code> understood · <code>n</code> couldn't follow. <em>Knew it</em> on a
        lesson above your level raises that topic a point, so the next ones go deeper. <em>Couldn't follow</em>{" "}
        keeps the lesson as the seed of a course.
      </>
    ),
  },
];

/** The three steps, as the guides' cards (one look for the whole site), numbered in their title. */
export function Steps(): ReactNode {
  return (
    <div className={`${styles.steps} dc-wide`}>
      <Cards columns={3}>
        {STEPS.map((s, i) => (
          <Card key={s.title} title={`${i + 1}. ${s.title}`}>
            {s.body}
          </Card>
        ))}
      </Cards>
    </div>
  );
}

/** The home's last word: where your data lives first, then why devcoach exists. */
export function Closing(): ReactNode {
  return (
    <section className={`${styles.closing} dc-wide`}>
      <div>
        <h2 className={styles.closingTitle}>Private by design</h2>
        <p>
          Your coaching data stays on your computer, in <code>~/.devcoach</code>. No account, no telemetry, no
          update check. It leaves only when you share a lesson or publish a course; your agent's model sees
          what the agent reads, as in any session. Setup never keeps your prompts.
        </p>
        <Link to="/reference/privacy">Privacy &amp; security →</Link>
      </div>
      <div>
        <h2 className={styles.closingTitle}>Why it exists</h2>
        <p>
          AI agents write more of your code every month. The skill that stays scarce is telling when they are
          wrong, and it only survives if you keep learning.
        </p>
        <Link to="/why">Why devcoach exists →</Link>
      </div>
    </section>
  );
}
