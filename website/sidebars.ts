import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// Explicit order, mirroring the previous MkDocs nav. Doc ids are the file names under ../docs.
const sidebars: SidebarsConfig = {
  docs: [
    "index",
    "why",
    "how-it-works",
    "getting-started",
    "cli",
    "mcp-server",
    "web-ui",
    "configuration",
  ],
};

export default sidebars;
