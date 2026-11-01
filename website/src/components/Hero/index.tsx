// The docs home's opening: what devcoach does in two lines, how to install it for your agent,
// and the coaching loop playing next to it. Commands mirror the per-agent install pages.
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import TabItem from "@theme/TabItem";
import Tabs from "@theme/Tabs";
import type { ReactNode } from "react";
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
          Type both lines in Claude Code. <Link to="/install/claude-code-plugin">Plugin guide →</Link>
        </p>
      </TabItem>
      <TabItem value="homebrew" label="Homebrew">
        <CodeBlock language="bash">
          {"brew tap UltimaPhoenix/tap && brew trust --tap UltimaPhoenix/tap\nbrew install devcoach && devcoach install"}
        </CodeBlock>
        <p className={styles.hint}>
          macOS and Linux; adds the <code>devcoach</code> CLI. <Link to="/install/homebrew">Homebrew guide →</Link>
        </p>
      </TabItem>
      <TabItem value="npx" label="npx">
        <CodeBlock language="bash">{"npx -y devcoach install"}</CodeBlock>
        <p className={styles.hint}>
          Any OS with Node.js 24+. <Link to="/install/npx">npx guide →</Link>
        </p>
      </TabItem>
      <TabItem value="gemini" label="Gemini CLI">
        <CodeBlock language="bash">{"npx -y devcoach install --gemini"}</CodeBlock>
        <p className={styles.hint}>
          Beta. <Link to="/install/gemini-cli">Gemini CLI guide →</Link>
        </p>
      </TabItem>
      <TabItem value="codex" label="Codex CLI">
        <CodeBlock language="bash">{"npx -y devcoach install --codex"}</CodeBlock>
        <p className={styles.hint}>
          Beta. <Link to="/install/codex">Codex CLI guide →</Link>
        </p>
      </TabItem>
    </Tabs>
  );
}

export default function Hero(): ReactNode {
  return (
    <section className={`${styles.hero} dc-wide`}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Claude Code · Gemini CLI · Codex CLI</p>
        <h1 className={styles.title}>
          Stay <span className={styles.accent}>sharp</span> while your AI does the work.
        </h1>
        <p className={styles.lead}>
          When your agent finishes a task, devcoach teaches you one thing from it that you don't know yet: a
          short lesson, right in the conversation. Free, 100% local, and quiet by design.
        </p>
        <InstallTabs />
        <ul className={styles.facts}>
          <li>No account, no telemetry</li>
          <li>At most 2 lessons a day</li>
          <li>Open source · AGPL-3.0</li>
        </ul>
      </div>
      <div className={styles.demo}>
        <LessonLoop />
        <a className={styles.demoLink} href="#what-happens">
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
        <code>y</code> knew it · <code>u</code> understood · <code>n</code> couldn't follow. The next lesson goes
        deeper, or slower.
      </>
    ),
  },
];

export function Steps(): ReactNode {
  return (
    <ol className={`${styles.steps} dc-wide`}>
      {STEPS.map((s, i) => (
        <li key={s.title} className={styles.step}>
          <span className={styles.stepN}>{i + 1}</span>
          <div>
            <p className={styles.stepTitle}>{s.title}</p>
            <p className={styles.stepBody}>{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
