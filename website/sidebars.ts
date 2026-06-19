import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// Explicit order, mirroring the previous MkDocs nav. Doc ids are the file names under ../docs.
const sidebars: SidebarsConfig = {
  docs: [
    "index",
    "why",
    "how-it-works",
    {
      type: "category",
      label: "Installation",
      collapsed: false,
      link: { type: "doc", id: "install/index" },
      items: [
        "install/claude-code-plugin",
        "install/npx",
        "install/homebrew",
        "install/claude-desktop",
        "install/claude-ai",
        "install/other-agents",
      ],
    },
    {
      type: "category",
      label: "Using devcoach",
      collapsed: false,
      items: ["usage/coaching", "usage/cli", "usage/web-ui"],
    },
    {
      type: "category",
      label: "Reference",
      items: ["reference/mcp-server", "reference/configuration", "reference/privacy"],
    },
  ],
};

export default sidebars;
