import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// The reader's path through the docs: decide (what it is, why, what happens around a task), install
// it for your agent, use it, look something up, get help, see where it is going. Doc ids are the
// file names under ../docs. The previous / next links under every page follow this order, and the
// footer and llms-full.txt (docusaurus.config.ts) and static/llms.txt list the same groups in the
// same order: change them together.
//
// Labels: a page's label is its front matter's `sidebar_label`, else its title. Docusaurus (3.10)
// gives the front matter precedence over a label set here, in the sidebar and in the previous / next
// links, so rename a page in its own front matter.
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: "category",
      label: "Start here",
      collapsed: false,
      // Like the other sections: the label opens a page that sends the reader to the right one.
      link: { type: "doc", id: "start" },
      items: ["index", "why", "how-it-works"],
    },
    {
      type: "category",
      label: "Install",
      // Closed until you are on an install page, where it opens by itself; its label opens the
      // chooser, which lists every method. With it open everywhere, the sidebar no longer fits a
      // 1440×900 screen and Help drops below the fold.
      collapsed: true,
      link: { type: "doc", id: "install/index" },
      // The order every page lists the install methods in, the recommended one first.
      items: [
        "install/claude-code-plugin",
        "install/homebrew",
        "install/windows",
        "install/npx",
        "install/claude-desktop",
        "install/gemini-cli",
        "install/codex",
        "install/other-agents",
        "install/claude-ai",
      ],
    },
    {
      type: "category",
      label: "Use devcoach",
      collapsed: false,
      // Like Install: the label opens a page that sends the reader to the right guide.
      link: { type: "doc", id: "usage/index" },
      items: ["usage/coaching", "usage/courses", "usage/sharing", "usage/web-ui", "usage/cli"],
    },
    {
      type: "category",
      label: "Reference",
      collapsed: false,
      link: { type: "doc", id: "reference/index" },
      items: [
        "reference/configuration",
        "reference/data",
        "reference/privacy",
        "reference/mcp-server",
        "reference/license",
      ],
    },
    {
      type: "category",
      label: "Help",
      collapsed: false,
      link: { type: "doc", id: "help" },
      items: ["troubleshooting", "faq", "glossary"],
    },
    "vision",
  ],
};

export default sidebars;
