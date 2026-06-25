import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

// Runs in Node.js — no client-side code here.

const config: Config = {
  title: "devcoach",
  tagline: "Progressive technical coaching, directly in your AI agent",
  favicon: "img/favicon.svg",

  future: { v4: true },

  url: "https://ultimaphoenix.github.io",
  baseUrl: "/dev-coach/",
  organizationName: "UltimaPhoenix",
  projectName: "dev-coach",
  trailingSlash: false,

  onBrokenLinks: "warn",

  markdown: { mermaid: true, hooks: { onBrokenMarkdownLinks: "warn" } },
  themes: ["@docusaurus/theme-mermaid"],

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          // The Markdown lives in the repo's top-level docs/ (shared with the README links).
          path: "../docs",
          routeBasePath: "/", // docs are the site root, like the old MkDocs "Home"
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/UltimaPhoenix/dev-coach/edit/main/",
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/docusaurus-social-card.jpg",
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: true },
    // Cleaner mermaid presets (closer to the old Material look) instead of the harsh default.
    mermaid: { theme: { light: "neutral", dark: "dark" } },
    navbar: {
      title: "devcoach",
      logo: { alt: "devcoach", src: "img/favicon.svg" },
      items: [
        { href: "https://www.npmjs.com/package/devcoach", label: "npm", position: "right" },
        { href: "https://github.com/UltimaPhoenix/dev-coach", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Installation", to: "/install" },
            { label: "Coaching in your agent", to: "/usage/coaching" },
            { label: "CLI reference", to: "/usage/cli" },
            { label: "MCP server", to: "/reference/mcp-server" },
          ],
        },
        {
          title: "More",
          items: [
            { label: "npm", href: "https://www.npmjs.com/package/devcoach" },
            { label: "GitHub", href: "https://github.com/UltimaPhoenix/dev-coach" },
            { label: "License", to: "/reference/license" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} UltimaPhoenix · AGPL-3.0`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
