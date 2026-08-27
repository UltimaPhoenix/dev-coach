import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// Explicit reading order: what it is → what you get → how to get it → reference → how it works
// inside → FAQ / roadmap. Doc ids are the file names under ../docs.
const sidebars: SidebarsConfig = {
  docs: [
    "index",
    "why",
    {
      type: "category",
      label: "Using devcoach",
      collapsed: false,
      items: ["usage/coaching", "usage/web-ui", "usage/cli"],
    },
    {
      type: "category",
      label: "Installation",
      collapsed: false,
      link: { type: "doc", id: "install/index" },
      items: [
        "install/homebrew",
        "install/claude-code-plugin",
        "install/claude-desktop",
        "install/gemini-cli",
        "install/codex",
        "install/npx",
        "install/other-agents",
        "install/claude-ai",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: ["reference/mcp-server", "reference/configuration", "reference/privacy", "reference/license"],
    },
    "how-it-works",
    "faq",
    "vision",
  ],
};

export default sidebars;
