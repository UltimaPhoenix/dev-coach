import * as fs from "node:fs";
import * as path from "node:path";
import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

// Runs in Node.js — no client-side code here.

const SITE_URL = "https://ultimaphoenix.github.io/dev-coach/";
const DESCRIPTION =
  "devcoach is a free, local, open-source MCP server that turns every task your AI agent finishes into one short, in-context lesson — progressive technical coaching for Claude Code, Cursor, and other MCP tools.";

// Inline plugin (zero-dep): emit /llms-full.txt — the entire docs corpus concatenated into one
// file for LLM / answer-engine retrieval. It is the companion to the curated static /llms.txt.
// See https://llmstxt.org. The docs Markdown lives in the repo's top-level docs/ (../docs).
function llmsFullTxtPlugin() {
  return {
    name: "devcoach-llms-full-txt",
    async postBuild({ siteDir, outDir }: { siteDir: string; outDir: string }) {
      const docsDir = path.join(siteDir, "..", "docs");

      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (/\.mdx?$/.test(entry.name) && !/\.local\.mdx?$/.test(entry.name)) {
            files.push(full);
          }
        }
      };
      walk(docsDir);

      // index first, then alphabetical by path — a stable, sensible reading order.
      files.sort((a, b) => {
        const rank = (f: string) => (/(^|\/)index\.mdx?$/.test(f) ? 0 : 1);
        return rank(a) - rank(b) || a.localeCompare(b);
      });

      const titleOf = (raw: string, file: string) => {
        const fm = raw.match(/^---\n[\s\S]*?\btitle:\s*(.+?)\s*\n[\s\S]*?\n---/);
        if (fm) return fm[1].replace(/^["']|["']$/g, "");
        const h1 = raw.match(/^#\s+(.+)$/m);
        return h1 ? h1[1] : path.basename(file).replace(/\.mdx?$/, "");
      };

      const clean = (raw: string) =>
        raw
          .replace(/^---\n[\s\S]*?\n---\n/, "") // drop YAML frontmatter
          .replace(/^import\s.+$/gm, "") // drop MDX import lines
          .replace(/<Head>[\s\S]*?<\/Head>/g, "") // drop injected JSON-LD / <head> tags
          .replace(/<[A-Z][\w-]*(?:\s[^>]*?)?\/>/g, "") // drop self-closing JSX components
          .trim()
          .replace(/^#\s+.+\n+/, "") // drop leading H1 (we prepend our own title)
          .replace(/\n{3,}/g, "\n\n")
          .trim();

      const header = `# devcoach — full documentation\n\n> ${DESCRIPTION}\n>\n> Home: ${SITE_URL} · Index: ${SITE_URL}llms.txt · Source: https://github.com/UltimaPhoenix/dev-coach\n`;

      const body = files
        .map((file) => {
          const raw = fs.readFileSync(file, "utf8");
          return `\n\n---\n\n# ${titleOf(raw, file)}\n\n${clean(raw)}`;
        })
        .join("");

      fs.writeFileSync(path.join(outDir, "llms-full.txt"), `${header}${body}\n`, "utf8");
    },
  };
}

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
          // Keep internal *.local.md(x) runbooks/notes out of the public site & sitemap.
          exclude: ["**/*.local.md", "**/*.local.mdx"],
        },
        blog: false,
        // Help search engines crawl every page; the classic preset auto-emits sitemap.xml.
        sitemap: { changefreq: "weekly", priority: 0.5, filename: "sitemap.xml" },
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [llmsFullTxtPlugin],

  // Site-wide JSON-LD so search & answer engines model devcoach as a free developer tool.
  headTags: [
    {
      tagName: "script",
      attributes: { type: "application/ld+json" },
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "SoftwareApplication",
            "@id": `${SITE_URL}#software`,
            name: "devcoach",
            alternateName: "dev-coach",
            description: DESCRIPTION,
            url: SITE_URL,
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Linux, Windows",
            softwareRequirements: "Node.js >= 24; an MCP-compatible AI agent (Claude Code, Claude Desktop, Cursor, …)",
            downloadUrl: "https://www.npmjs.com/package/devcoach",
            license: "https://www.gnu.org/licenses/agpl-3.0.html",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            author: { "@type": "Person", name: "UltimaPhoenix", url: "https://github.com/UltimaPhoenix" },
            keywords:
              "MCP server, Model Context Protocol, AI coding coach, Claude Code, Cursor, learn while coding, developer skill retention, technical coaching, local-first",
            sameAs: ["https://github.com/UltimaPhoenix/dev-coach", "https://www.npmjs.com/package/devcoach"],
          },
          {
            "@type": "SoftwareSourceCode",
            "@id": "https://github.com/UltimaPhoenix/dev-coach",
            name: "devcoach",
            description: DESCRIPTION,
            codeRepository: "https://github.com/UltimaPhoenix/dev-coach",
            programmingLanguage: "TypeScript",
            runtimePlatform: "Node.js",
            license: "https://www.gnu.org/licenses/agpl-3.0.html",
            about: { "@id": `${SITE_URL}#software` },
          },
        ],
      }),
    },
  ],

  themeConfig: {
    // Social/OG card shown in link previews (Docusaurus also emits twitter:card=summary_large_image).
    image: "img/og-card.jpg",
    // Extra <meta> for search engines and social cards; Docusaurus dedupes against page frontmatter.
    metadata: [
      {
        name: "description",
        content:
          "devcoach is a free, local, open-source MCP server that turns every task your AI agent finishes into one short, in-context lesson — progressive technical coaching for Claude Code, Cursor, and other MCP tools.",
      },
      {
        name: "keywords",
        content:
          "devcoach, MCP server, Model Context Protocol, AI coding coach, Claude Code, Cursor, learn while coding, developer skill retention, technical coaching, AI pair programming, code learning tool",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
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
