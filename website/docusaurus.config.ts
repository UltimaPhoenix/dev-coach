import * as fs from "node:fs";
import * as path from "node:path";
import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import type { Compiler, Configuration } from "webpack";
import sidebars from "./sidebars.ts";
import { darkCodeTheme, lightCodeTheme } from "./src/lib/codeThemes.ts";
import { type DemoCourse, loadDemoCourse } from "./src/lib/demoCourse.ts";
import { docRoute, llmsIntro, mdxToMarkdown, pageTitle, sidebarDocIds } from "./src/lib/llmsFull.ts";

// Runs in Node.js — no client-side code here.

/** The demo course's step list, as the tour reads it from the plugin's global data. */
export type { DemoCourse };

const SITE_URL = "https://ultimaphoenix.github.io/dev-coach/";
// DOCS_NEXT=1 builds the same tree for the unreleased `develop` branch; .github/workflows/docs.yml
// deploys it under /next/ next to the released docs: noindex, no sitemap, no JSON-LD, a banner.
const NEXT = process.env.DOCS_NEXT === "1";
const NEXT_URL = `${SITE_URL}next/`;
const BASE_URL = NEXT ? "/dev-coach/next/" : "/dev-coach/";
/** Where this build is served: the released docs, or the /next/ copy. */
const OWN_URL = NEXT ? NEXT_URL : SITE_URL;
const DESCRIPTION =
  "devcoach is a free, local, open-source MCP server that helps you learn from the code your AI writes — one short, in-context lesson at a time on what you don't know yet, for Claude Code, Claude Desktop, Gemini CLI, Codex CLI, Cursor, and other MCP tools.";

// Inline plugin (zero-dep): emit /llms-full.txt, every docs page as Markdown in one file for LLM and
// answer-engine retrieval, the companion of the curated static/llms.txt (https://llmstxt.org). The
// pages come in the sidebar's order; src/lib/llmsFull.ts turns each one's MDX into Markdown. The
// home page's text lives in its components (Hero, Tour), so its section is the summary at the top of
// llms.txt: one hand-written text for both files.
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
            files.push(path.relative(docsDir, full).split(path.sep).join("/"));
          }
        }
      };
      walk(docsDir);

      // The sidebar's order; a page it does not list (there should be none) comes last.
      const order = sidebarDocIds(sidebars.docs as unknown[]);
      const rank = (file: string) => {
        const at = order.indexOf(file.replace(/\.mdx?$/, ""));
        return at === -1 ? order.length : at;
      };
      files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

      const intro = llmsIntro(fs.readFileSync(path.join(siteDir, "static", "llms.txt"), "utf8"));
      const header =
        `# devcoach: the full documentation\n\n> Every page of ${OWN_URL} as Markdown, in the order of the ` +
        `site's sidebar. The curated index is ${OWN_URL}llms.txt; the source is https://github.com/UltimaPhoenix/dev-coach.\n`;

      const body = files
        .map((file) => {
          const raw = fs.readFileSync(path.join(docsDir, file), "utf8");
          const route = docRoute(file);
          const text = route === "" ? intro : mdxToMarkdown(raw, file, OWN_URL);
          return `\n\n---\n\n# ${pageTitle(raw, file)}\n\nPage: ${OWN_URL}${route}\n\n${text}`;
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
  baseUrl: BASE_URL,
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
          // "Edit this page" opens the page's source on `develop`, the branch pull requests target.
          // (A plain string is joined with the docs path, which starts with "../" here: the browser
          // then resolved .../edit/main/../docs/why.md to a branch called "docs".)
          editUrl: ({ docPath }) => `https://github.com/UltimaPhoenix/dev-coach/edit/develop/docs/${docPath}`,
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
        // One item is lit on every docs page: Install on the install pages, Why devcoach on its
        // page, Docs on all the others (sidebars.ts lists them).
        {
          to: "/usage/coaching",
          label: "Docs",
          position: "left",
          activeBaseRegex: `^${BASE_URL}(how-it-works|usage|reference|troubleshooting|faq|vision)(/|$)`,
        },
        { to: "/install", label: "Install", position: "left", activeBaseRegex: `^${BASE_URL}install(/|$)` },
        { to: "/why", label: "Why devcoach", position: "left" },
        { href: "https://www.npmjs.com/package/devcoach", label: "npm", position: "right" },
        { href: "https://github.com/UltimaPhoenix/dev-coach", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      // The home page has no sidebar, so the footer is the site's map: every page, in the sidebar's
      // groups and order (sidebars.ts), then the project's links. A page is named as the docs name
      // it everywhere ("(beta)" in lower case, no two brackets in a row).
      links: [
        {
          title: "Start here",
          items: [
            { label: "Home", to: "/" },
            { label: "Why devcoach", to: "/why" },
            { label: "How it works", to: "/how-it-works" },
          ],
        },
        {
          title: "Install",
          items: [
            { label: "Choose your setup", to: "/install" },
            { label: "Claude Code plugin", to: "/install/claude-code-plugin" },
            { label: "Homebrew", to: "/install/homebrew" },
            { label: "Windows", to: "/install/windows" },
            { label: "npx / npm", to: "/install/npx" },
            { label: "Claude Desktop (beta)", to: "/install/claude-desktop" },
            { label: "Gemini CLI (beta)", to: "/install/gemini-cli" },
            { label: "Codex CLI (beta)", to: "/install/codex" },
            { label: "Other MCP agents", to: "/install/other-agents" },
            { label: "claude.ai web (not supported)", to: "/install/claude-ai" },
          ],
        },
        {
          title: "Use devcoach",
          items: [
            { label: "Coaching in your agent", to: "/usage/coaching" },
            { label: "Courses", to: "/usage/courses" },
            { label: "Sharing lessons", to: "/usage/sharing" },
            { label: "Web dashboard", to: "/usage/web-ui" },
            { label: "Command line (CLI)", to: "/usage/cli" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "Configuration", to: "/reference/configuration" },
            { label: "Privacy & security", to: "/reference/privacy" },
            { label: "MCP server reference", to: "/reference/mcp-server" },
            { label: "License", to: "/reference/license" },
          ],
        },
        {
          title: "Help",
          items: [
            { label: "Troubleshooting", to: "/troubleshooting" },
            { label: "FAQ", to: "/faq" },
            { label: "Issues & feedback", href: "https://github.com/UltimaPhoenix/dev-coach/issues" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "Vision & roadmap", to: "/vision" },
            { label: "GitHub", href: "https://github.com/UltimaPhoenix/dev-coach" },
            { label: "npm", href: "https://www.npmjs.com/package/devcoach" },
            // The other copy of these docs: the unreleased `develop` branch, or back to the release.
            NEXT
              ? { label: "Released docs", href: SITE_URL }
              : { label: "Unreleased docs", href: NEXT_URL },
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
