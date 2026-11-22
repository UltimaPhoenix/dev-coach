import * as fs from "node:fs";
import * as path from "node:path";
import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import type { Compiler, Configuration } from "webpack";
import { darkCodeTheme, lightCodeTheme } from "./src/lib/codeThemes.ts";
import { type DemoCourse, loadDemoCourse } from "./src/lib/demoCourse.ts";

// Runs in Node.js — no client-side code here.

/** The demo course's step list, as the tour reads it from the plugin's global data. */
export type { DemoCourse };

const SITE_URL = "https://ultimaphoenix.github.io/dev-coach/";
// DOCS_NEXT=1 builds the same tree for the unreleased `develop` branch; .github/workflows/docs.yml
// deploys it under /next/ next to the released docs: noindex, no sitemap, no JSON-LD, a banner.
const NEXT = process.env.DOCS_NEXT === "1";
const NEXT_URL = `${SITE_URL}next/`;
const DESCRIPTION =
  "devcoach is a free, local, open-source MCP server that helps you learn from the code your AI writes — one short, in-context lesson at a time on what you don't know yet, for Claude Code, Claude Desktop, Gemini CLI, Codex CLI, Cursor, and other MCP tools.";

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

// Inline plugin (zero-dep): keep Mermaid's parser off the pages that have no diagram. Docusaurus
// puts every module shared by half the pages' chunks into one `common` chunk that every page
// loads. Mermaid's diagram chunks all share @mermaid-js/parser (Langium + Chevrotain grammars for
// pie, git graph, architecture…), so that chunk was 650 KB of parser next to 2 KB of MDX runtime,
// on every page. Mermaid's own modules now stay out of `common`: they load with a diagram, only
// on the pages that draw one, and the flowcharts the docs draw do not use that parser at all.
const MERMAID_ONLY = /[\\/]node_modules[\\/](?:mermaid|@mermaid-js|langium|chevrotain[\w-]*|@chevrotain|vscode-[\w-]+|lodash-es)[\\/]/;

function lazyMermaidPlugin() {
  return {
    name: "devcoach-lazy-mermaid",
    configureWebpack(config: Configuration, isServer: boolean) {
      const groups = config.optimization?.splitChunks ? config.optimization.splitChunks.cacheGroups : undefined;
      const common = groups?.common;
      if (isServer || !common || typeof common !== "object" || common instanceof RegExp) return {};
      if (common.test !== undefined) throw new Error("devcoach-lazy-mermaid: Docusaurus' common chunk has a test now");
      common.test = (module: { nameForCondition?: () => string | null | undefined }) =>
        !MERMAID_ONLY.test(module.nameForCondition?.() ?? "");
      return {};
    },
  };
}

// Inline plugin (zero-dep): the home page's tour can run a real course. This emits the demo course
// of the screenshot fixture as its own file, /demo/course.html, which a sandboxed frame loads on
// demand (website/src/components/Tour). The document is prepared the way the dashboard serves
// one (src/web/app.ts): highlighted on the way out, then the frame bridge; the fixture is not
// modified. GitHub Pages sends no headers of ours, so the policy the dashboard sends as a header
// travels as a <meta> instead. A <meta> policy cannot carry `sandbox` or `frame-ancestors`: the
// frame's own sandbox attribute confines the framed document, but opened on its own (by its URL)
// it is not sandboxed as the dashboard's copy is. Nothing on the site links to it: the tour's
// step list is made of buttons that move the frame.
function demoCoursePlugin(context: { siteDir: string }) {
  const name = "devcoach-demo-course";
  const demo = loadDemoCourse(path.join(context.siteDir, ".."));
  return {
    name,
    async contentLoaded({ actions }: { actions: { setGlobalData(data: DemoCourse): void } }) {
      actions.setGlobalData(demo.data);
    },
    // An emitted asset rather than a file under static/: nothing generated lands in the source
    // tree, and `docusaurus start` serves it too.
    configureWebpack(_config: unknown, isServer: boolean) {
      if (isServer) return {};
      return {
        plugins: [
          {
            apply(compiler: Compiler) {
              const { Compilation, sources } = compiler.webpack;
              compiler.hooks.thisCompilation.tap(name, (compilation) => {
                compilation.hooks.processAssets.tap(
                  { name, stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
                  () => compilation.emitAsset(demo.data.file, new sources.RawSource(demo.html)),
                );
              });
            },
          },
        ],
      };
    },
  };
}

const config: Config = {
  title: "devcoach",
  tagline: "One short lesson on what you don't know yet, drawn from a task your AI agent just finished",
  favicon: "img/favicon.svg",

  future: { v4: true },

  url: "https://ultimaphoenix.github.io",
  baseUrl: NEXT ? "/dev-coach/next/" : "/dev-coach/",
  organizationName: "UltimaPhoenix",
  projectName: "dev-coach",
  trailingSlash: false,
  noIndex: NEXT, // every /next/ page carries <meta name="robots" content="noindex, nofollow">

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
        sitemap: NEXT ? false : { changefreq: "weekly", priority: 0.5, filename: "sitemap.xml" },
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [llmsFullTxtPlugin, demoCoursePlugin, lazyMermaidPlugin],

  // Site-wide JSON-LD so search & answer engines model devcoach as a free developer tool
  // (released docs only — the /next/ copy must not duplicate the @ids).
  headTags: NEXT
    ? []
    : [
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
            softwareRequirements:
              "Node.js >= 24; an MCP-compatible AI agent (Claude Code, Claude Desktop, Gemini CLI, Codex CLI, Cursor, …)",
            downloadUrl: "https://www.npmjs.com/package/devcoach",
            license: "https://www.gnu.org/licenses/agpl-3.0.html",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            author: { "@type": "Person", name: "UltimaPhoenix", url: "https://github.com/UltimaPhoenix" },
            keywords:
              "MCP server, Model Context Protocol, AI coding coach, Claude Code, Claude Desktop, Gemini CLI, Codex CLI, Cursor, learn while coding, developer skill retention, technical coaching, local-first",
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
    ...(NEXT
      ? {
          announcementBar: {
            id: "next-docs",
            content: `You are reading the docs for the unreleased <strong>develop</strong> branch (<code>npx -y devcoach@next</code>) — <a href="${SITE_URL}">released docs</a>`,
            backgroundColor: "#0f766e",
            textColor: "#ffffff",
            isCloseable: false,
          },
        }
      : {}),
    // Social/OG card shown in link previews (Docusaurus also emits twitter:card=summary_large_image).
    image: "img/og-card.jpg",
    // Extra <meta> for search engines and social cards; Docusaurus dedupes against page frontmatter.
    metadata: [
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "devcoach, MCP server, Model Context Protocol, AI coding coach, Claude Code, Claude Desktop, Gemini CLI, Codex CLI, Cursor, learn while coding, developer skill retention, technical coaching, AI pair programming, code learning tool",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: true },
    // Cleaner mermaid presets (closer to the old Material look) instead of the harsh default; the
    // colours are restyled in src/css/custom.css. The font is set here, not in CSS: Mermaid sizes
    // every box to its text, so it has to measure with the font the page shows (Infima's base).
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
      options: {
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif, BlinkMacSystemFont, Helvetica, Arial',
      },
    },
    navbar: {
      title: "devcoach",
      // The title next to it is the link's name: the logo is decoration (alt="").
      logo: { alt: "", src: "img/favicon.svg" },
      items: [
        // The home page has no sidebar (it's the landing page), so the way into the docs is here.
        { to: "/usage/coaching", label: "Docs", position: "left", activeBaseRegex: "/(usage|reference|how-it-works|faq)" },
        { to: "/install", label: "Install", position: "left", activeBaseRegex: "/install" },
        { to: "/why", label: "Why devcoach", position: "left" },
        NEXT
          ? { href: SITE_URL, label: "stable docs", position: "right" }
          : { href: NEXT_URL, label: "next", position: "right" },
        { href: "https://www.npmjs.com/package/devcoach", label: "npm", position: "right" },
        { href: "https://github.com/UltimaPhoenix/dev-coach", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      // The home page has no sidebar, so the footer is the site's map: every guide, four columns.
      links: [
        {
          title: "Use it",
          items: [
            { label: "Coaching in your agent", to: "/usage/coaching" },
            { label: "Courses", to: "/usage/courses" },
            { label: "Sharing lessons", to: "/usage/sharing" },
            { label: "Web dashboard", to: "/usage/web-ui" },
            { label: "Command line (CLI)", to: "/usage/cli" },
          ],
        },
        {
          title: "Install",
          items: [
            { label: "Choose your setup", to: "/install" },
            { label: "Claude Code plugin", to: "/install/claude-code-plugin" },
            { label: "Homebrew", to: "/install/homebrew" },
            { label: "Windows", to: "/install/windows" },
            { label: "Claude Desktop", to: "/install/claude-desktop" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "How it works", to: "/how-it-works" },
            { label: "Configuration", to: "/reference/configuration" },
            { label: "MCP server", to: "/reference/mcp-server" },
            { label: "Privacy & security", to: "/reference/privacy" },
            { label: "Troubleshooting", to: "/troubleshooting" },
            { label: "FAQ", to: "/faq" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "Why devcoach", to: "/why" },
            { label: "Vision & roadmap", to: "/vision" },
            { label: "License", to: "/reference/license" },
            { label: "GitHub", href: "https://github.com/UltimaPhoenix/dev-coach" },
            { label: "Issues & feedback", href: "https://github.com/UltimaPhoenix/dev-coach/issues" },
            { label: "npm", href: "https://www.npmjs.com/package/devcoach" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} UltimaPhoenix · AGPL-3.0`,
    },
    // prism-react-renderer's github / dracula, with the colours that fell under AA fixed.
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
      additionalLanguages: ["bash", "json", "powershell", "sql"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
