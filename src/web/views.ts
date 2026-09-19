// Server-rendered views (hono/html) — faithful Tailwind/Alpine markup.
// The original Tailwind classes + Alpine/HTMX attributes are reproduced verbatim; the browser-runtime
// Tailwind (static/vendor/tailwind.js) and vendored Alpine/HTMX/Flatpickr/marked render them identically.
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { KnowledgeEntry, Lesson, Settings } from "../core/models";
import type { SharedLesson } from "../core/share";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/** JSON encoded for safe embedding inside a <script> (mirrors Jinja's |tojson). */
function jsonForScript(v: unknown): string {
  return JSON.stringify(v ?? "").replace(
    /[<>&\u2028\u2029]/g,
    (ch) => String.raw`\u` + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, "0"),
  );
}

/** CSS-selector-safe element id \u2014 topic/lesson ids are free text and may start with a digit. */
function domId(prefix: string, key: string): string {
  return (
    prefix + key.replace(/[^A-Za-z0-9_-]/g, (ch) => `_${(ch.codePointAt(0) ?? 0).toString(16)}`)
  );
}

const MORE_ICON = html`<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.75"/><circle cx="10" cy="10" r="1.75"/><circle cx="16" cy="10" r="1.75"/></svg>`;

/**
 * The one "more" button, shared by the lessons toolbar and the lesson page: rare actions live behind
 * an icon button instead of standing in the toolbar. `attrs` is a static string of extra attributes
 * (never user data).
 */
function moreMenu(items: Html, className = "", attrs = ""): Html {
  return html`<div class="relative ${className}" ${raw(attrs)} x-data="{ open: false }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" :aria-expanded="open" aria-label="More actions" title="More actions" class="w-8 h-8 inline-flex items-center justify-center rounded-lg border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-gray-800 dark:hover:text-gray-100">${MORE_ICON}</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-56 p-1" style="display:none">
        ${items}
      </div>
    </div>`;
}

/**
 * The delete confirmation, in the app's own style instead of the browser's confirm(): what is
 * about to go, that it cannot be undone, and a red button that says so. `show` / `close` are
 * static Alpine expressions.
 */
function dangerDialog(show: string, close: string, heading: Html, body: Html, footer: Html): Html {
  return html`<div x-show="${show}" style="display:none" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100" class="fixed inset-0 z-[80] flex items-center justify-center px-4">
    <div class="absolute inset-0 bg-gray-900/50 dark:bg-black/60" @click="${close}"></div>
    <div role="alertdialog" aria-modal="true" class="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-5">
      <div class="flex items-start gap-3">
        <span class="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 inline-flex items-center justify-center shrink-0" aria-hidden="true">🗑</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">${heading}</h2>
          <div class="mt-1 text-sm text-gray-500 dark:text-gray-400 space-y-2">${body}</div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">${footer}</div>
    </div>
  </div>`;
}

// ── Layout (base.html) ───────────────────────────────────────────────────────

export function layout(o: {
  title: string;
  currentPath: string;
  uiTheme: string;
  head?: Html | string;
  scripts?: Html | string;
  body: Html;
}): Html {
  const link = (href: string, label: string, active: boolean) =>
    html`<a href="${href}" class="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition ${active ? "text-gray-900 dark:text-white font-semibold" : ""}">${label}</a>`;
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${o.title}</title>
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <meta name="devcoach-theme" content="${o.uiTheme}" />
  <script>
    (function () {
      var serverTheme = document.querySelector('meta[name="devcoach-theme"]').content;
      var session = localStorage.getItem('theme-override');
      var active = session || serverTheme;
      var dark = active === 'dark' || (active === 'system' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) document.documentElement.classList.add('dark');
    })();
  </script>
  <script src="/static/vendor/tailwind.js"></script>
  <script>tailwind.config = { darkMode: 'class' }</script>
  <script src="/static/vendor/htmx.min.js"></script>
  <script src="/static/vendor/alpinejs.min.js" defer></script>
  <link rel="stylesheet" href="/static/style.css" />
  ${o.head ?? ""}
</head>
<body class="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen font-mono transition-colors duration-200">
  <nav class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-6">
    <!-- Brand wordmark, mirrors the docs site (website/src/css/custom.css): "dev" in the
         theme foreground, "coach" in the teal accent (#0d9488 / #5eead4 = teal-600/300). -->
    <a href="/" class="font-extrabold text-lg tracking-tight text-gray-900 dark:text-gray-100 hover:opacity-80 transition"
      >🎓 dev<span class="text-teal-600 dark:text-teal-300">coach</span></a
    >
    ${link("/knowledge", "Profile", o.currentPath === "/knowledge")}
    ${link("/lessons", "Lessons", o.currentPath.includes("/lessons"))}
    <div class="ml-auto flex items-center gap-1.5">
      <a href="/settings" title="Settings" ${o.currentPath === "/settings" ? raw('aria-current="page"') : ""} class="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium transition ${o.currentPath === "/settings" ? "bg-white dark:bg-gray-900 border-indigo-400 text-gray-900 dark:text-white" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-gray-800 dark:hover:text-gray-100"}"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10.1 3.1V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg><span>Settings</span></a>
      <button id="theme-toggle" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle theme"
              class="w-8 h-8 inline-flex items-center justify-center rounded-lg border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 text-base leading-none"></button>
    </div>
  </nav>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8">${o.body}</main>
  <script>
    function isDark() { return document.documentElement.classList.contains('dark'); }
    function updateThemeIcon() { var b = document.getElementById('theme-toggle'); if (b) b.textContent = isDark() ? '☀️' : '🌙'; }
    function updateHljsTheme() {
      var link = document.getElementById('hljs-theme'); if (!link) return;
      link.href = isDark() ? '/static/vendor/hljs-dark.min.css' : '/static/vendor/hljs-light.min.css';
    }
    function toggleTheme() {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme-override', isDark() ? 'dark' : 'light');
      updateThemeIcon(); updateHljsTheme();
    }
    (function () {
      var serverTheme = document.querySelector('meta[name="devcoach-theme"]').content;
      if (serverTheme !== 'system') localStorage.removeItem('theme-override');
    })();
    updateThemeIcon(); updateHljsTheme();
  </script>
  ${o.scripts ?? ""}
</body>
</html>`;
}

// ── Profile (profile.html) ───────────────────────────────────────────────────

export interface ProfileData {
  categorised: Record<string, KnowledgeEntry[]>;
  allGroups: string[];
  stats: Record<string, unknown>;
  rateLimit: { allowed: boolean; reason?: string | null };
  maxPerDay: number;
  uiTheme: string;
}

export function profilePage(d: ProfileData): Html {
  const groupOptions = (current: string) =>
    d.allGroups
      .filter((g) => g !== "Other")
      .map((g) => html`<option value="${g}" ${g === current ? "selected" : ""}>${g}</option>`);

  const body = html`
<div id="knowledge-map" x-data="{ editMode: JSON.parse(localStorage.getItem('km-edit-mode') || 'false'), toggle() { this.editMode = !this.editMode; localStorage.setItem('km-edit-mode', this.editMode); } }">

<div class="flex items-center justify-between mb-6">
  <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Knowledge Map</h1>
  <div class="flex items-center gap-2">
    <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative">
      <button type="button" @click="open = !open"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">+ Add group</button>
      <div x-show="open" @click.outside="open = false" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-56" style="display:none">
        <form method="post" action="/groups" hx-post="/groups" hx-target="#knowledge-map" hx-select="#knowledge-map" hx-swap="outerHTML" class="flex gap-2">
          <input type="text" name="group_name" placeholder="Group name…" required class="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition">Add</button>
        </form>
      </div>
    </div>
    <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative">
      <button type="button" @click="open = !open" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">+ Add topic</button>
      <div x-show="open" @click.outside="open = false" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 w-72" style="display:none">
        <form method="post" action="/knowledge" hx-post="/knowledge" hx-target="#knowledge-map" hx-select="#knowledge-map" hx-swap="outerHTML" class="space-y-3">
          <div>
            <label for="add-topic-id" class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Topic ID</label>
            <input id="add-topic-id" type="text" name="topic" placeholder="e.g. rust_lifetimes" required class="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div class="flex gap-2">
            <div class="w-24">
              <label for="add-topic-confidence" class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Confidence</label>
              <input id="add-topic-confidence" type="number" name="confidence" value="5" min="0" max="10" class="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div class="flex-1">
              <label for="add-topic-group" class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Group</label>
              <select id="add-topic-group" name="group" class="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Other (ungrouped)</option>
                ${groupOptions("")}
              </select>
            </div>
          </div>
          <button type="submit" class="w-full px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition">Add</button>
        </form>
      </div>
    </div>
    <button type="button" @click="toggle()"
            :class="editMode ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400'"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition">
      <span x-text="editMode ? '✓ Done' : '✎ Edit'">✎ Edit</span>
    </button>
  </div>
</div>

<div class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
  <span><span class="font-semibold text-gray-800 dark:text-gray-100">${Number(d.stats.total_lessons ?? 0)}</span> lessons total</span>
  <span class="text-gray-300 dark:text-gray-600">·</span>
  <span><span class="font-semibold text-gray-800 dark:text-gray-100">${Number(d.stats.lessons_today ?? 0)}</span> / ${d.maxPerDay} today</span>
  <span class="text-gray-300 dark:text-gray-600">·</span>
  <span><span class="font-semibold text-gray-800 dark:text-gray-100">${Number(d.stats.lessons_this_week ?? 0)}</span> this week</span>
  <span class="text-gray-300 dark:text-gray-600">·</span>
  ${
    d.rateLimit.allowed
      ? html`<span class="text-green-600 dark:text-green-400 font-medium">Available now</span>`
      : html`<span class="text-yellow-600 dark:text-yellow-400">${d.rateLimit.reason}</span>`
  }
</div>

${Object.entries(d.categorised).map(([category, topics]) => {
  return html`
<section class="mb-6 group/section">
  <div class="flex items-center gap-2 mb-2 border-b border-gray-200 dark:border-gray-800 pb-1">
    <div class="flex items-center gap-1 flex-1 min-w-0">
      <h2 class="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">${category}</h2>
      ${
        category !== "Other"
          ? html`<form x-show="editMode" style="display:none" method="post" action="/groups/${encodeURIComponent(category)}/delete" hx-post="/groups/${encodeURIComponent(category)}/delete" hx-target="#knowledge-map" hx-select="#knowledge-map" hx-swap="outerHTML" hx-confirm="Remove group &quot;${category}&quot;? Topics will move to Other.">
          <button type="submit" class="text-xs text-gray-300 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition w-4 text-center opacity-0 group-hover/section:opacity-100" title="Delete group">×</button>
        </form>`
          : ""
      }
    </div>
    <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative">
      <button type="button" @click="open = !open" class="text-xs text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition px-1">+ topic</button>
      <div x-show="open" @click.outside="open = false" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-64" style="display:none">
        <form method="post" action="/knowledge" hx-post="/knowledge" hx-target="#knowledge-map" hx-select="#knowledge-map" hx-swap="outerHTML" class="space-y-2">
          <input type="hidden" name="group" value="${category !== "Other" ? category : ""}" />
          <input type="text" name="topic" placeholder="topic_id (e.g. rust_lifetimes)" required class="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-400 dark:text-gray-500 shrink-0">Confidence</label>
            <input type="number" name="confidence" value="5" min="0" max="10" class="w-16 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button type="submit" class="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition">Add</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-0">
    ${topics.map((entry) => {
      const rowId = domId("topic-row-", entry.topic);
      const conf = entry.confidence;
      const pct = Math.trunc((conf / 10) * 100);
      const color = conf >= 7 ? "bg-green-500" : conf >= 4 ? "bg-yellow-500" : "bg-red-500";
      const textColor =
        conf >= 7
          ? "text-green-600 dark:text-green-400"
          : conf >= 4
            ? "text-yellow-600 dark:text-yellow-400"
            : "text-red-600 dark:text-red-400";
      return html`
    <div id="${rowId}" class="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-800/50 group/row">
      <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative shrink-0 flex items-center">
        <button type="button" @click="open = !open" class="text-xs text-gray-200 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition w-4 text-center opacity-0 group-hover/row:opacity-100" title="Move to group">⇄</button>
        <div x-show="open" @click.outside="open = false" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-1 w-40" style="display:none">
          <form method="post" action="/knowledge/${encodeURIComponent(entry.topic)}/group" hx-post="/knowledge/${encodeURIComponent(entry.topic)}/group" hx-target="#knowledge-map" hx-select="#knowledge-map" hx-swap="outerHTML">
            <select name="group" onchange="this.form.requestSubmit()" class="w-full text-xs bg-transparent text-gray-700 dark:text-gray-200 px-2 py-1 focus:outline-none">
              <option value="Other" ${category === "Other" ? "selected" : ""}>Other (ungrouped)</option>
              ${groupOptions(category)}
            </select>
          </form>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-1 min-w-0">
        <a x-show="!editMode" href="/lessons?search=${encodeURIComponent(entry.topic)}" class="text-sm text-gray-700 dark:text-gray-200 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition" title="${entry.topic}">${entry.topic}</a>
        <span x-show="editMode" style="display:none" class="text-sm text-gray-700 dark:text-gray-200 min-w-0 truncate" title="${entry.topic}">${entry.topic}</span>
        <form x-show="editMode" style="display:none" method="post" action="/knowledge/${encodeURIComponent(entry.topic)}/delete" hx-post="/knowledge/${encodeURIComponent(entry.topic)}/delete" hx-target="#knowledge-map" hx-select="#knowledge-map" hx-swap="outerHTML" hx-confirm="Remove ${entry.topic} from your knowledge map?" class="shrink-0 flex items-center">
          <button type="submit" class="text-xs text-gray-200 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 transition w-4 text-center opacity-0 group-hover/row:opacity-100" title="Remove topic">×</button>
        </form>
      </div>
      <form x-show="editMode" style="display:none" method="post" action="/knowledge/${encodeURIComponent(entry.topic)}" hx-post="/knowledge/${encodeURIComponent(entry.topic)}" hx-target="#${rowId}" hx-select="#${rowId}" hx-swap="outerHTML" class="shrink-0 flex items-center">
        <input type="hidden" name="delta" value="-1" />
        <button class="text-xs text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition w-5 text-center leading-none">−</button>
      </form>
      <div class="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
        <div class="${color} h-full rounded-full transition-all" style="width: ${pct}%"></div>
      </div>
      <form x-show="editMode" style="display:none" method="post" action="/knowledge/${encodeURIComponent(entry.topic)}" hx-post="/knowledge/${encodeURIComponent(entry.topic)}" hx-target="#${rowId}" hx-select="#${rowId}" hx-swap="outerHTML" class="shrink-0 flex items-center">
        <input type="hidden" name="delta" value="1" />
        <button class="text-xs text-gray-300 dark:text-gray-600 hover:text-green-600 dark:hover:text-green-400 transition w-5 text-center leading-none">+</button>
      </form>
      <span class="text-xs font-bold ${textColor} w-5 text-right shrink-0">${conf}</span>
    </div>`;
    })}
  </div>
</section>`;
})}
</div>`;

  return layout({
    title: "Profile — devcoach",
    currentPath: "/knowledge",
    uiTheme: d.uiTheme,
    body,
  });
}

// ── Lessons (lessons.html) ───────────────────────────────────────────────────

export interface LessonsSelected {
  period: string;
  category: string;
  level: string;
  project: string;
  repository: string;
  branch: string;
  commit: string;
  starred: boolean;
  /** "" = all, "1" = shared with me, "0" = my own. */
  imported: string;
  /** Exact sender name; implies imported = "1". */
  shared_by: string;
  search: string;
  feedback: string;
  date_from: string;
  date_to: string;
  sort: string;
  order: string;
}

export interface LessonsData {
  /** `?import=1` — open the import popover (after an error, or from a deep link). */
  importOpen: boolean;
  importError: "invalid" | "cross" | null;
  lessons: Lesson[];
  allCategories: string[];
  allProjects: string[];
  allRepositories: string[];
  allBranches: string[];
  allCommits: string[];
  /** Every sender of a shared lesson, one dropdown entry each. */
  allSharedBy: string[];
  s: LessonsSelected;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  uiTheme: string;
}

const PERIOD_LABELS: Record<string, string> = {
  all: "All time",
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days",
  year: "Last year",
};
const FEEDBACK_LABELS: Record<string, string> = {
  know: "✓ Known",
  dont_know: "✗ Don't know",
  none: "— No response",
};
const LEVEL_EMOJI: Record<string, string> = { junior: "🟢", mid: "🟡", senior: "🔴" };

function lessonsQs(s: LessonsSelected, overrides: Record<string, string> = {}): string {
  const params: Record<string, string> = {
    period: s.period,
    category: s.category,
    level: s.level,
    project: s.project,
    repository: s.repository,
    branch: s.branch,
    commit: s.commit,
    feedback: s.feedback,
    imported: s.imported,
    shared_by: s.shared_by,
    search: s.search,
    date_from: s.date_from,
    date_to: s.date_to,
    sort: s.sort,
    order: s.order,
  };
  if (s.starred) params.starred = "1";
  Object.assign(params, overrides);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return `?${q.toString()}`;
}

export function lessonsPage(d: LessonsData): Html {
  const s = d.s;
  const customDate = Boolean(s.date_from || s.date_to);
  const anyFilter =
    (s.period !== "all" && !customDate) ||
    customDate ||
    Boolean(
      s.category ||
        s.level ||
        s.project ||
        s.repository ||
        s.branch ||
        s.commit ||
        s.starred ||
        s.imported ||
        s.shared_by ||
        s.search ||
        s.feedback,
    );
  const periodLabel = customDate
    ? s.date_from && s.date_to
      ? `${s.date_from} → ${s.date_to}`
      : s.date_from
        ? `From ${s.date_from}`
        : `Until ${s.date_to}`
    : (PERIOD_LABELS[s.period] ?? "All time");
  const feedbackLabel = s.feedback ? (FEEDBACK_LABELS[s.feedback] ?? "Feedback") : "Feedback";
  const sharedLabel = s.shared_by
    ? `🤝 from ${s.shared_by}`
    : s.imported === "1"
      ? "🤝 Shared with me"
      : s.imported === "0"
        ? "👤 My own"
        : "🤝 Shared";
  // [imported value, sender, label] — the sender travels in data attributes, never in a JS literal.
  const sharedOptions: [string, string, string][] = [
    ["", "", "All lessons"],
    ["0", "", "👤 My own"],
    ["1", "", "🤝 Shared with me"],
    ...d.allSharedBy.map((name): [string, string, string] => ["1", name, `🤝 from ${name}`]),
  ];
  const levelTextColor: Record<string, string> = {
    junior: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20",
    mid: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
    senior: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20",
  };

  const chip = (label: string, clearUrl: string) =>
    html`<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">${label}<a href="${clearUrl}" class="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-700 transition">×</a></span>`;

  const sortTh = (label: string, col: string, extra = "") => {
    const active = s.sort === col;
    const next = active && s.order === "desc" ? "asc" : "desc";
    return html`<th class="px-3 py-3 whitespace-nowrap relative overflow-hidden text-ellipsis ${extra}">
      <a href="${lessonsQs(s, { sort: col, order: next })}" class="hover:text-gray-700 dark:hover:text-gray-200 transition group/sort">${label}
        ${
          active
            ? html`<span class="text-indigo-400">${s.order === "asc" ? "↑" : "↓"}</span>`
            : html`<span class="text-gray-200 dark:text-gray-700 group-hover/sort:text-gray-400 dark:group-hover/sort:text-gray-500 transition">↕</span>`
        }
      </a></th>`;
  };

  const caret = html`<svg class="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>`;

  const head = html`<link rel="stylesheet" href="/static/vendor/flatpickr.min.css" />
<style>
  .dark .flatpickr-calendar { background:#1f2937; border-color:#374151; }
  .dark .flatpickr-day { color:#e5e7eb; }
  .dark .flatpickr-day:hover { background:#374151; }
  .dark .flatpickr-day.selected, .dark .flatpickr-day.startRange, .dark .flatpickr-day.endRange, .dark .flatpickr-day.inRange { background:#4f46e5; border-color:#4f46e5; color:#fff; }
  .dark .flatpickr-day.today { border-color:#6366f1; }
  .dark .flatpickr-months, .dark .flatpickr-month { background:#1f2937; color:#e5e7eb; fill:#e5e7eb; }
  .dark .flatpickr-current-month, .dark .flatpickr-monthDropdown-months { color:#e5e7eb; background:#1f2937; }
  .dark .flatpickr-weekday { color:#9ca3af; background:#1f2937; }
  .dark .flatpickr-prev-month svg, .dark .flatpickr-next-month svg { fill:#9ca3af; }
</style>`;

  const countLabel =
    d.total === 0
      ? "No lessons"
      : d.totalPages === 1
        ? `${d.total} lesson${d.total !== 1 ? "s" : ""}`
        : `${(d.page - 1) * d.perPage + 1}–${Math.min(d.page * d.perPage, d.total)} of ${d.total}`;

  const pageIds = JSON.stringify(d.lessons.map((l) => l.id));
  const body = html`
<div :class="selectMode && 'dc-selecting'" x-data="{ selectMode: false, selected: [], confirmOpen: false, shareOpen: false, sharePos: { left: 0, top: null, bottom: null }, openShare(btn) { const r = btn.getBoundingClientRect(); const w = 320; const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)); const below = innerHeight - r.bottom > 380; this.sharePos = { left, top: below ? r.bottom + 6 : null, bottom: below ? null : innerHeight - r.top + 6 }; this.shareOpen = true }, toggle(id) { const i = this.selected.indexOf(id); if (i < 0) this.selected.push(id); else this.selected.splice(i, 1) }, setAll(ids, on) { this.selected = on ? ids.slice() : [] }, selectedTitles() { const rows = Array.from(document.querySelectorAll('tr[data-id]')); return this.selected.map((id) => { const r = rows.find((x) => x.dataset.id === id); return r ? r.dataset.title : id }) }, leave() { this.selectMode = false; this.selected = []; this.shareOpen = false; this.confirmOpen = false } }" @keydown.escape.window="leave()">
<form id="filter-form" method="get" action="/lessons">
  <input type="hidden" name="period" id="h-period" value="${s.period}">
  <input type="hidden" name="date_from" id="h-date-from" value="${s.date_from}">
  <input type="hidden" name="date_to" id="h-date-to" value="${s.date_to}">
  <input type="hidden" name="feedback" id="h-feedback" value="${s.feedback}">
  <input type="hidden" name="starred" id="h-starred" value="${s.starred ? "1" : ""}">
  <input type="hidden" name="imported" id="h-imported" value="${s.imported}">
  <input type="hidden" name="shared_by" id="h-shared-by" value="${s.shared_by}">
  <input type="hidden" name="category" value="${s.category}">
  <input type="hidden" name="level" id="h-level" value="${s.level}">
  <input type="hidden" name="project" value="${s.project}">
  <input type="hidden" name="repository" value="${s.repository}">
  <input type="hidden" name="branch" value="${s.branch}">
  <input type="hidden" name="commit" value="${s.commit}">

  <div class="flex items-center gap-3 mb-4">
    <div class="relative flex-1">
      <span class="absolute inset-y-0 left-3.5 flex items-center text-gray-400 pointer-events-none text-sm">🔍</span>
      <input type="text" name="search" value="${s.search}" placeholder="Search lessons…" autocomplete="off" class="w-full pl-9 pr-10 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
      ${s.search ? html`<button type="submit" name="search" value="" class="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>` : ""}
    </div>
    <p class="text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0">${countLabel}</p>
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-3">
    <button type="button" onclick="var h=document.getElementById('h-starred'); h.value=h.value?'':'1'; document.getElementById('filter-form').submit()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${s.starred ? "bg-yellow-400 text-yellow-900 border-yellow-400" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-yellow-400 hover:text-yellow-500"}">★ Starred</button>

    <div class="relative" x-data="{ open: false }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${s.imported || s.shared_by ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400"}">${sharedLabel}${caret}</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-52 p-1 overflow-hidden" style="display:none">
        ${sharedOptions.map(([val, name, lbl]) => {
          const active = s.imported === val && s.shared_by === name;
          return html`<button type="button" data-imported="${val}" data-shared-by="${name}" onclick="var d=this.dataset; document.getElementById('h-imported').value=d.imported; document.getElementById('h-shared-by').value=d.sharedBy; document.getElementById('filter-form').submit()" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${active ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}"><span class="truncate">${lbl}</span>${active ? html`<span class="text-indigo-500 ml-auto">✓</span>` : ""}</button>`;
        })}
      </div>
    </div>

    <div class="relative" x-data="periodPicker()" @keydown.escape="close()">
      <button type="button" @click="toggle()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${customDate || s.period !== "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400"}">
        <span>📅</span><span x-text="label">${periodLabel}</span>${caret}
      </button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" x-transition:leave="transition ease-in duration-75" x-transition:leave-start="opacity-100 scale-100" x-transition:leave-end="opacity-0 scale-95" @click.outside="close()" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-64 overflow-hidden" style="display:none">
        <div class="p-1">
          ${(Object.entries(PERIOD_LABELS) as [string, string][]).map(([val, lbl]) => {
            const sel = s.period === val && !customDate;
            return html`<button type="button" @click="selectPreset('${val}', '${lbl}')" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${sel ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}">${lbl}${sel ? html`<span class="text-indigo-500">✓</span>` : ""}</button>`;
          })}
        </div>
        <div class="border-t border-gray-100 dark:border-gray-800 p-1">
          <button type="button" @click="showCustom = !showCustom" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${customDate ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}">
            <span>Custom range</span>
            <svg class="w-3 h-3 opacity-60 transition-transform" :class="showCustom ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div x-show="showCustom" class="px-2 pb-2 pt-1">
            <input type="text" x-ref="fp" placeholder="Select date range…" class="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer" />
          </div>
        </div>
      </div>
    </div>

    <div class="relative" x-data="{ open: false }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${s.feedback ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400"}">${feedbackLabel}${caret}</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-44 p-1 overflow-hidden" style="display:none">
        ${(
          [
            ["", "All feedback"],
            ["know", "✓ Known"],
            ["dont_know", "✗ Don't know"],
            ["none", "— No response"],
          ] as [string, string][]
        ).map(
          ([val, lbl]) =>
            html`<button type="button" onclick="document.getElementById('h-feedback').value='${val}'; document.getElementById('filter-form').submit()" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${s.feedback === val ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}">${lbl}${s.feedback === val ? html`<span class="text-indigo-500 ml-auto">✓</span>` : ""}</button>`,
        )}
      </div>
    </div>

    <div class="relative" x-data="{ open: false }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${s.level ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400"}">${s.level ? `${LEVEL_EMOJI[s.level] ?? ""} ${s.level}` : "Level"}${caret}</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-40 p-1 overflow-hidden" style="display:none">
        ${(
          [
            ["", "All levels"],
            ["junior", "🟢 Junior"],
            ["mid", "🟡 Mid"],
            ["senior", "🔴 Senior"],
          ] as [string, string][]
        ).map(
          ([val, lbl]) =>
            html`<button type="button" onclick="document.getElementById('h-level').value='${val}'; document.getElementById('filter-form').submit()" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${s.level === val ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}">${lbl}${s.level === val ? html`<span class="text-indigo-500 ml-auto">✓</span>` : ""}</button>`,
        )}
      </div>
    </div>

    ${
      d.allCategories.length ||
      d.allProjects.length ||
      d.allRepositories.length ||
      d.allBranches.length ||
      d.allCommits.length
        ? html`<div class="relative" x-data="{ open: false }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${s.category || s.project || s.repository || s.branch || s.commit ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400"}">Filters${caret}</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-64 p-3 space-y-2.5" style="display:none">
        ${d.allCategories.length ? html`<div><label class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Category</label><select name="category" onchange="this.form.submit()" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="">All categories</option>${d.allCategories.map((cat) => html`<option value="${cat}" ${s.category === cat ? "selected" : ""}>${cat}</option>`)}</select></div>` : ""}
        ${d.allProjects.length ? html`<div><label class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Project</label><select name="project" onchange="this.form.submit()" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="">All projects</option>${d.allProjects.map((p) => html`<option value="${p}" ${s.project === p ? "selected" : ""}>${p}</option>`)}</select></div>` : ""}
        ${d.allRepositories.length ? html`<div><label class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Repository</label><select name="repository" onchange="this.form.submit()" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="">All repositories</option>${d.allRepositories.map((r) => html`<option value="${r}" ${s.repository === r ? "selected" : ""}>${r}</option>`)}</select></div>` : ""}
        ${d.allBranches.length ? html`<div><label class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Branch</label><input type="text" name="branch" value="${s.branch}" placeholder="e.g. main" list="branch-list" autocomplete="off" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" /><datalist id="branch-list">${d.allBranches.map((b) => html`<option value="${b}">`)}</datalist></div>` : ""}
        ${d.allCommits.length ? html`<div><label class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Commit</label><input type="text" name="commit" value="${s.commit}" placeholder="hash prefix…" list="commit-list" autocomplete="off" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" /><datalist id="commit-list">${d.allCommits.map((c) => html`<option value="${c.slice(0, 7)}">`)}</datalist></div>` : ""}
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition">Apply</button>
      </div>
    </div>`
        : ""
    }

    ${anyFilter ? html`<a href="/lessons" class="ml-auto text-xs text-gray-400 hover:text-gray-700 dark:hover:text-white transition">Clear all</a>` : ""}

    ${moreMenu(
      html`<button type="button" @click="selectMode = true; open = false" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"><span class="w-4 h-4 inline-flex items-center justify-center shrink-0 text-[13px] leading-none" aria-hidden="true">🗑</span>Delete lessons…</button>
        <button type="button" @click="window.resetLessonColumns && window.resetLessonColumns(); open = false" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"><svg class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M7.5 4v12M12.5 4v12"/></svg>Reset column widths</button>`,
      anyFilter ? "" : "ml-auto",
      'x-show="!selectMode"',
    )}
    <button type="button" x-show="selectMode" style="display:none" @click="leave()" class="${anyFilter ? "" : "ml-auto"} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400">✕ Cancel</button>
    <div class="relative" x-data="{ open: ${String(d.importOpen)} }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" title="Import a lesson someone shared" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">＋ Import</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-80 p-3 space-y-2.5" style="display:none">
        <p class="text-xs text-gray-500 dark:text-gray-400">Paste the lesson code, the link, a URL or the whole text — or drop a <code>.devcoach.md</code> anywhere on this page.</p>
        ${d.importError === "invalid" ? html`<p class="text-xs text-rose-600 dark:text-rose-400">That doesn't look like a devcoach lesson — copy the whole text again.</p>` : d.importError === "cross" ? html`<p class="text-xs text-rose-600 dark:text-rose-400">Imports only work from this dashboard — paste the lesson here.</p>` : ""}
        <textarea name="text" form="import-form" rows="4" placeholder="devcoach:lesson:1:…" autocomplete="off" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" x-ref="importText" x-effect="if (open) $nextTick(() => $refs.importText.focus())"></textarea>
        <div class="flex items-center gap-2">
          <label class="cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition">📄 Choose file<input id="import-file" type="file" name="file" form="import-form" accept=".md,.json,.txt" class="hidden" onchange="document.getElementById('import-form').submit()" /></label>
          <button type="submit" form="import-form" class="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition">Import</button>
        </div>
      </div>
    </div>
  </div>

  ${
    anyFilter
      ? html`<div class="flex flex-wrap gap-1.5 mb-4">
    ${customDate ? chip(`📅 ${periodLabel}`, lessonsQs(s, { date_from: "", date_to: "" })) : ""}
    ${s.period !== "all" && !customDate ? chip(`🕐 ${periodLabel}`, lessonsQs(s, { period: "all" })) : ""}
    ${s.feedback ? chip(FEEDBACK_LABELS[s.feedback] ?? s.feedback, lessonsQs(s, { feedback: "" })) : ""}
    ${s.starred ? html`<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">★ Starred<a href="${lessonsQs({ ...s, starred: false })}" class="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-yellow-200 dark:hover:bg-yellow-700 transition">×</a></span>` : ""}
    ${s.imported || s.shared_by ? chip(sharedLabel, lessonsQs(s, { imported: "", shared_by: "" })) : ""}
    ${s.search ? chip(`🔍 "${s.search}"`, lessonsQs(s, { search: "" })) : ""}
    ${s.category ? chip(s.category, lessonsQs(s, { category: "" })) : ""}
    ${s.level ? chip(`${LEVEL_EMOJI[s.level] ?? ""} ${s.level}`, lessonsQs(s, { level: "" })) : ""}
    ${s.project ? chip(`📁 ${s.project}`, lessonsQs(s, { project: "" })) : ""}
    ${s.repository ? chip(`⎇ ${s.repository}`, lessonsQs(s, { repository: "" })) : ""}
    ${s.branch ? chip(`⎇ ${s.branch}`, lessonsQs(s, { branch: "" })) : ""}
    ${s.commit ? chip(s.commit.slice(0, 7), lessonsQs(s, { commit: "" })) : ""}
  </div>`
      : ""
  }
</form>
<form id="import-form" method="post" action="/lessons/import" enctype="multipart/form-data" class="hidden"><input type="hidden" name="from" value="lessons" /></form>
<div id="drop-hint" class="hidden fixed inset-0 z-[60] bg-indigo-500/10 border-4 border-dashed border-indigo-400 pointer-events-none items-center justify-center"><p class="bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 font-semibold rounded-xl px-6 py-3 shadow-lg">Drop to import the lesson</p></div>

${
  d.lessons.length
    ? html`<div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
  <table class="w-full text-sm table-fixed" data-resizable="lessons">
    <colgroup>
      <col data-col="star" style="width:2.75rem" />
      <col data-col="date" data-min="72" style="width:8rem" />
      <col data-col="topic" data-min="88" class="hidden sm:table-column" style="width:11rem" />
      <col data-col="title" data-flex data-min="220" />
      <col data-col="level" data-min="88" style="width:5.5rem" />
      <col data-col="categories" data-min="120" class="hidden lg:table-column" style="width:24%" />
      <col data-col="feedback" data-min="112" class="hidden xl:table-column" style="width:7rem" />
      <col data-col="share" style="width:2.5rem" />
    </colgroup>
    <thead>
      <tr class="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <th class="px-3 py-3"><input type="checkbox" tabindex="-1" aria-label="Select all on this page" class="dc-check" x-show="selectMode" style="display:none" :checked="selected.length > 0 && ${pageIds}.every((id) => selected.includes(id))" @change="setAll(${pageIds}, $event.target.checked)" /></th>
        ${sortTh("Date", "timestamp")}
        ${sortTh("Topic", "topic_id", "hidden sm:table-cell")}
        ${sortTh("Title", "title")}
        ${sortTh("Level", "level")}
        <th class="px-3 py-3 hidden lg:table-cell relative overflow-hidden text-ellipsis">Categories</th>
        ${sortTh("Feedback", "feedback", "hidden xl:table-cell")}
        <th class="px-2 py-3 w-8"><span class="sr-only">Share</span></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
      ${d.lessons.map((lesson) => {
        const rowId = domId("lesson-row-", lesson.id);
        const date = lesson.timestamp.slice(0, 10);
        const tip = lesson.timestamp.slice(0, 16).replace("T", " ");
        return html`<tr id="${rowId}" data-id="${lesson.id}" data-title="${lesson.title}" data-href="/lessons/${encodeURIComponent(lesson.id)}" class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group cursor-pointer" tabindex="0" role="link" @click="if (selectMode) toggle($el.dataset.id); else if (!$event.target.closest('a, button, input, label')) window.location = $el.dataset.href" @keydown.enter="if (selectMode) toggle($el.dataset.id); else if ($event.target === $el) window.location = $el.dataset.href" @keydown.space.prevent="selectMode && toggle($el.dataset.id)" :class="selected.includes($el.dataset.id) && 'bg-indigo-50 dark:bg-indigo-900/20'">
        <td class="px-3 py-3">
          <form x-show="!selectMode" method="post" action="/lessons/${encodeURIComponent(lesson.id)}/star" hx-post="/lessons/${encodeURIComponent(lesson.id)}/star" hx-target="#${rowId}" hx-select="#${rowId}" hx-swap="outerHTML">
            <input type="hidden" name="starred" value="${lesson.starred ? "0" : "1"}" />
            <input type="hidden" name="next" value="/lessons${lessonsQs(s)}" />
            <button type="submit" title="${lesson.starred ? "Unstar" : "Star"}" class="w-6 text-lg text-center leading-none transition ${lesson.starred ? "text-yellow-400 hover:text-yellow-300" : "text-gray-300 dark:text-gray-600 hover:text-yellow-400"}">${lesson.starred ? "★" : "☆"}</button>
          </form>
          <input type="checkbox" tabindex="-1" aria-hidden="true" class="dc-check pointer-events-none" x-show="selectMode" style="display:none" :checked="selected.includes($el.closest('tr').dataset.id)" />
        </td>
        <td class="px-3 py-3 whitespace-nowrap tabular-nums relative group/date">
          <span class="text-gray-400 dark:text-gray-500 cursor-default" data-ts="${lesson.timestamp}">${date}</span>
          <div class="absolute z-10 bottom-full left-0 mb-1 px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover/date:opacity-100 transition-opacity duration-150">${tip}</div>
        </td>
        <td class="px-3 py-3 hidden sm:table-cell"><span class="block truncate text-xs font-mono text-cyan-600 dark:text-cyan-400">${lesson.topic_id}</span>${lesson.imported ? html`<span class="block text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[10rem]" title="This lesson was shared with you">🤝 ${lesson.shared_by ?? "anonymous"}</span>` : ""}</td>
        <td class="px-3 py-3"><a href="/lessons/${encodeURIComponent(lesson.id)}" class="font-semibold text-[15px] leading-snug text-gray-800 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2">${lesson.title}</a></td>
        <td class="px-3 py-3"><a href="${lessonsQs(s, { level: lesson.level })}" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${levelTextColor[lesson.level] ?? ""} hover:ring-2 hover:ring-current hover:ring-offset-1 transition-shadow">${lesson.level}</a></td>
        <td class="px-3 py-3 hidden lg:table-cell"><div class="flex flex-wrap gap-1">${lesson.categories.map((cat) => html`<a href="${lessonsQs(s, { category: cat })}" class="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">${cat}</a>`)}</div></td>
        <td class="px-3 py-3 hidden xl:table-cell">${lesson.feedback === "know" ? html`<span class="text-xs text-teal-600 dark:text-teal-400 font-medium">✓ Known</span>` : lesson.feedback === "dont_know" ? html`<span class="text-xs text-rose-500 dark:text-rose-400 font-medium">✗ Unknown</span>` : ""}</td>
        <td class="px-2 py-3 text-center"><button type="button" hx-get="/lessons/${encodeURIComponent(lesson.id)}/share?format=panel" hx-target="#share-modal-body" hx-swap="innerHTML" @click="openShare($el)" title="Share this lesson" aria-label="Share this lesson" class="inline-flex text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14 14 6M8 6h6v6"/></svg></button></td>
      </tr>`;
      })}
    </tbody>
  </table>
</div>
${
  d.totalPages > 1
    ? html`<div class="flex items-center justify-between mt-4">
  <p class="text-xs text-gray-400 dark:text-gray-500">Page ${d.page} of ${d.totalPages}</p>
  <div class="flex items-center gap-1">
    ${
      d.page > 1
        ? html`<a href="${lessonsQs(s, { page: String(d.page - 1) })}" class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 transition">← Prev</a>`
        : html`<span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed">← Prev</span>`
    }
    ${pageNumbers(d.page, d.totalPages).map((p) =>
      p === 0
        ? html`<span class="text-gray-400 dark:text-gray-600 text-xs px-1">…</span>`
        : p === d.page
          ? html`<span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white border border-indigo-600">${p}</span>`
          : html`<a href="${lessonsQs(s, { page: String(p) })}" class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 transition">${p}</a>`,
    )}
    ${
      d.page < d.totalPages
        ? html`<a href="${lessonsQs(s, { page: String(d.page + 1) })}" class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 transition">Next →</a>`
        : html`<span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed">Next →</span>`
    }
  </div>
</div>`
    : ""
}`
    : html`<div class="flex flex-col items-center justify-center py-16 text-center">
  <p class="text-3xl mb-3">📭</p>
  <p class="text-gray-500 dark:text-gray-400 text-sm">No lessons match the current filters.</p>
  ${anyFilter ? html`<a href="/lessons" class="mt-2 text-indigo-500 hover:text-indigo-400 text-sm transition">Clear all filters</a>` : ""}
</div>`
}
<div x-show="selectMode" style="display:none" x-transition:enter="transition ease-out duration-150" x-transition:enter-start="opacity-0 translate-y-2" x-transition:enter-end="opacity-100 translate-y-0" class="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-4 sm:px-6 py-3">
  <div class="max-w-7xl mx-auto flex items-center gap-3">
    <button type="button" @click="leave()" class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">Cancel</button>
    <div class="ml-auto flex items-center gap-3">
      <p class="text-sm text-gray-700 dark:text-gray-200 tabular-nums"><span x-text="selected.length"></span> selected</p>
      <button type="button" x-show="selected.length" style="display:none" @click="selected = []" class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition">Clear</button>
      <button type="button" :disabled="!selected.length" @click="confirmOpen = true" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-rose-600 text-white border-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed">🗑 Delete selected</button>
    </div>
  </div>
</div>
${dangerDialog(
  "confirmOpen",
  "confirmOpen = false",
  html`<span x-text="selected.length === 1 ? 'Delete this lesson?' : 'Delete ' + selected.length + ' lessons?'"></span>`,
  html`<ul class="max-h-40 overflow-y-auto space-y-1 text-gray-700 dark:text-gray-200">
      <template x-for="t in selectedTitles().slice(0, 6)" :key="t"><li class="truncate">· <span x-text="t"></span></li></template>
    </ul>
    <p x-show="selected.length > 6" style="display:none" x-text="'…and ' + (selected.length - 6) + ' more'"></p>
    <p>They will be removed from your log. This cannot be undone.</p>`,
  html`<button type="button" @click="confirmOpen = false" class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">Cancel</button>
    <form method="post" action="/lessons/delete" class="contents">
      <template x-for="id in selected" :key="id"><input type="hidden" name="id" :value="id" /></template>
      <input type="hidden" name="next" value="/lessons${lessonsQs(s, { page: String(d.page) })}" />
      <button type="submit" :disabled="!selected.length" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-rose-600 text-white border-rose-600 hover:bg-rose-500" x-text="selected.length === 1 ? '🗑 Delete lesson' : '🗑 Delete ' + selected.length + ' lessons'">🗑 Delete</button>
    </form>`,
)}
<div x-show="shareOpen" style="display:none" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100" class="fixed inset-0 z-[70] pointer-events-none">
  <div @click.outside="shareOpen = false" :style="{ left: sharePos.left + 'px', top: sharePos.top != null ? sharePos.top + 'px' : 'auto', bottom: sharePos.bottom != null ? sharePos.bottom + 'px' : 'auto' }" role="dialog" aria-label="Share this lesson" class="absolute w-80 pointer-events-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4">
    <button type="button" @click="shareOpen = false" aria-label="Close" class="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition">✕</button>
    <div id="share-modal-body" class="space-y-3"><p class="text-xs text-gray-400 dark:text-gray-500">Loading…</p></div>
  </div>
</div>
</div>`;

  const scripts = html`<script src="/static/vendor/flatpickr.min.js"></script>
<script src="/static/relative-time.js"></script>
<script src="/static/table-resize.js"></script>
<script src="/static/share.js"></script>
<script>
function periodPicker() {
  return {
    open: false,
    showCustom: ${raw(customDate ? "true" : "false")},
    label: ${raw(jsonForScript(periodLabel))},
    fp: null,
    init() {
      const self = this;
      this.$watch('showCustom', val => {
        if (val && !this.fp) {
          this.fp = flatpickr(this.$refs.fp, {
            mode: 'range', dateFormat: 'Y-m-d', inline: false,
            ${raw(s.date_from ? `defaultDate: [${jsonForScript(s.date_from)}${s.date_to ? `, ${jsonForScript(s.date_to)}` : ""}],` : "")}
            onChange(dates) {
              if (dates.length === 2) {
                document.getElementById('h-date-from').value = self.fp.formatDate(dates[0], 'Y-m-d');
                document.getElementById('h-date-to').value = self.fp.formatDate(dates[1], 'Y-m-d');
                document.getElementById('h-period').value = '';
                document.getElementById('filter-form').submit();
              }
            }
          });
        }
      });
    },
    toggle() { this.open = !this.open; },
    close() { this.open = false; },
    selectPreset(val) {
      document.getElementById('h-period').value = val;
      document.getElementById('h-date-from').value = '';
      document.getElementById('h-date-to').value = '';
      document.getElementById('filter-form').submit();
    },
  };
}
</script>`;

  return layout({
    title: "Lessons — devcoach",
    currentPath: "/lessons",
    uiTheme: d.uiTheme,
    head,
    body,
    scripts,
  });
}

/** Windowed page list: 1, current±2, last, with 0 marking an ellipsis gap. */
function pageNumbers(page: number, totalPages: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) {
      if (prev && p - prev > 1) out.push(0);
      out.push(p);
      prev = p;
    }
  }
  return out;
}

// ── Lesson detail (lesson_detail.html) ───────────────────────────────────────

const REPO_DOMAINS: Record<string, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
};

/** Everything the share popover needs, pre-rendered server-side for the current name/context. */
export interface ShareState {
  id: string;
  open: boolean;
  name: string;
  includeContext: boolean;
  text: string;
  link: string;
}

/**
 * The popover's action row: the payloads travel as data-* attributes so a click copies
 * synchronously (Safari refuses clipboard writes after an await). Re-rendered by HTMX
 * whenever the name or the context checkbox changes.
 */
export function shareFragment(sh: ShareState): Html {
  const dl = `/lessons/${encodeURIComponent(sh.id)}/share?format=md&name=${encodeURIComponent(sh.name)}&include_context=${sh.includeContext ? "1" : "0"}`;
  return html`<div id="share-payloads" data-text="${sh.text}" data-link="${sh.link}" class="space-y-2">
  <div class="flex flex-wrap gap-2">
    <button type="button" onclick="copyShare('text', this)" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition">📋 Copy text</button>
    <button type="button" onclick="copyShare('link', this)" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition">🔗 Copy link</button>
    <a href="${dl}" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition">⬇ Download .md</a>
  </div>
  <p class="text-[11px] text-gray-400 dark:text-gray-500">${sh.name ? html`Shared by <span class="text-gray-600 dark:text-gray-300">${sh.name}</span>` : "Shared anonymously"} · ${sh.includeContext ? "includes project, branch and commit" : "only the lesson travels — no paths, no project"}.</p>
</div>`;
}

/**
 * The share panel (sender name, context toggle, the copy/download payloads). It lives inside the
 * lesson page's popover and, with `heading`, inside the lessons list's modal — the same route
 * (`?format=panel`) serves it there so the list never has to leave the page.
 */
export function sharePanel(lessonId: string, sh: ShareState, heading: string | null = null): Html {
  return html`
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Share this lesson</p>
        ${heading ? html`<p class="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">${heading}</p>` : ""}
        <form method="post" action="/lessons/${encodeURIComponent(lessonId)}/share" hx-post="/lessons/${encodeURIComponent(lessonId)}/share" hx-target="#share-payloads" hx-swap="outerHTML" hx-trigger="input delay:300ms, change" onsubmit="return false" class="space-y-2.5">
          <input type="hidden" name="persist" value="0" x-ref="persist" />
          <div>
            <label for="share-name" class="block text-xs text-gray-400 dark:text-gray-500 mb-1">Your name</label>
            <input id="share-name" type="text" name="name" value="${sh.name}" maxlength="80" placeholder="anonymous" autocomplete="off" @input="$refs.persist.value = '0'" @change="$refs.persist.value = '1'" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <label class="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer"><input type="checkbox" name="include_context" value="1" ${sh.includeContext ? "checked" : ""} class="mt-0.5" /><span>Include where it happened <span class="text-gray-400 dark:text-gray-500">(project, branch, commit — never local paths)</span></span></label>
        </form>
        ${shareFragment(sh)}
`;
}

export function lessonDetailPage(d: {
  lesson: Lesson;
  uiTheme: string;
  share: ShareState;
  /** Flash after POST /lessons/import: freshly stored, or already in the log. */
  imported: "new" | "dup" | null;
}): Html {
  const l = d.lesson;
  const sh = d.share;
  const levelClass =
    l.level === "junior"
      ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700"
      : l.level === "mid"
        ? "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700"
        : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700";

  const isLocal = l.repository_platform === "local";
  let repoUrl: string | null = null;
  if (isLocal && l.repository) repoUrl = `vscode://file/${l.repository}`;
  else if (l.repository_platform && REPO_DOMAINS[l.repository_platform] && l.repository)
    repoUrl = `https://${REPO_DOMAINS[l.repository_platform]}/${l.repository}`;
  let commitUrl: string | null = null;
  if (repoUrl && l.commit_hash && !isLocal) {
    commitUrl =
      l.repository_platform === "gitlab"
        ? `${repoUrl}/-/commit/${l.commit_hash}`
        : l.repository_platform === "bitbucket"
          ? `${repoUrl}/commits/${l.commit_hash}`
          : `${repoUrl}/commit/${l.commit_hash}`;
  }
  const hasMeta = Boolean(l.project || l.repository || l.branch || l.commit_hash || l.folder);
  const date = l.timestamp.slice(0, 10);
  const tip = l.timestamp.slice(0, 16).replace("T", " ");
  // One feedback POST re-renders both regions: the badge row (target) and, out of band,
  // the footer buttons — the markdown body is client-rendered, so a full-page swap would blank it.
  const feedbackHx = `hx-post="/lessons/${encodeURIComponent(l.id)}/feedback" hx-target="#lesson-meta" hx-select="#lesson-meta" hx-swap="outerHTML" hx-select-oob="#lesson-feedback:outerHTML"`;

  const body = html`
<div x-data="{ confirmOpen: false }" @keydown.escape.window="confirmOpen = false">
<div class="mb-4"><a href="/lessons" class="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white text-sm transition">← Back to lessons</a></div>
${
  d.imported
    ? html`<div class="mb-4 px-4 py-2 rounded-lg border text-sm bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300">${d.imported === "new" ? html`✓ Imported “${l.title}”${l.shared_by ? html`, shared by ${l.shared_by}` : ""}. It's in your log now — feedback works as usual and it never counts against your daily limit.` : html`“${l.title}” was already in your log — nothing changed.`}</div>`
    : ""
}
<div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
  <div class="flex flex-wrap items-center gap-3 mb-2">
    <form id="lesson-star" method="post" action="/lessons/${encodeURIComponent(l.id)}/star" hx-post="/lessons/${encodeURIComponent(l.id)}/star" hx-target="#lesson-star" hx-select="#lesson-star" hx-swap="outerHTML">
      <input type="hidden" name="starred" value="${l.starred ? "0" : "1"}" />
      <input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" />
      <button type="submit" title="${l.starred ? "Unstar" : "Star"}" class="w-6 text-center text-xl leading-none transition ${l.starred ? "text-yellow-400 hover:text-yellow-300" : "text-gray-300 dark:text-gray-600 hover:text-yellow-400"}">${l.starred ? "★" : "☆"}</button>
    </form>
    <h1 class="text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0">${l.title}</h1>
    <a href="/lessons?level=${l.level}" class="text-xs font-semibold px-2 py-0.5 rounded-full border ${levelClass} shrink-0 hover:ring-2 hover:ring-current hover:ring-offset-1 transition-shadow">${l.level}</a>
    ${moreMenu(
      html`<button type="button" @click="confirmOpen = true; open = false" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:!bg-rose-50 dark:hover:!bg-rose-900/30 hover:text-rose-700 dark:hover:text-rose-300"><span class="w-4 h-4 inline-flex items-center justify-center shrink-0 text-[13px] leading-none" aria-hidden="true">🗑</span>Delete lesson…</button>`,
      "shrink-0",
    )}
    <div class="relative shrink-0" x-data="{ open: ${String(sh.open)} }" @click.outside="open = false" @keydown.escape="open = false">
      <button type="button" @click="open = !open" title="Share this lesson" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">↗ Share</button>
      <div x-show="open" x-transition:enter="transition ease-out duration-100" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-80 p-4 space-y-3" style="display:none">
        ${sharePanel(l.id, sh)}
      </div>
    </div>
  </div>
  <div id="lesson-meta" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-5">
    <span class="relative group/date cursor-default">🗓 <span data-ts="${l.timestamp}">${date}</span>
      <span class="absolute z-10 bottom-full left-0 mb-1 px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover/date:opacity-100 transition-opacity duration-150">${tip}</span>
    </span>
    <span>🏷 <span class="text-cyan-600 dark:text-cyan-400">${l.topic_id}</span></span>
    ${l.imported ? html`<span title="This lesson was shared with you">🤝 shared by <span class="text-gray-700 dark:text-gray-200">${l.shared_by ?? "anonymous"}</span></span>` : ""}
    ${l.categories.map((cat) => html`<a href="/lessons?category=${encodeURIComponent(cat)}" class="inline-block bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 text-gray-600 dark:text-gray-300 text-xs rounded px-2 py-0.5 transition border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600">${cat}</a>`)}
    ${
      l.feedback
        ? html`${
            l.feedback === "know"
              ? html`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700">✓ I know this</span>`
              : html`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700">✗ I don't know this</span>`
          }
        <form method="post" action="/lessons/${encodeURIComponent(l.id)}/feedback" ${raw(feedbackHx)}><input type="hidden" name="feedback" value="clear" /><input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" /><button type="submit" class="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition">Clear</button></form>`
        : ""
    }
  </div>
  <div class="my-5 pl-4 border-l-4 border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 rounded-r-lg py-3 pr-4">
    <p class="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400 mb-1">TL;DR</p>
    <div id="summary-content" class="markdown-body text-sm text-indigo-900 dark:text-indigo-100"></div>
  </div>
  <div id="body-content" class="markdown-body"></div>
  ${l.task_context ? html`<div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400"><span class="text-gray-400 dark:text-gray-500">Context:</span> ${l.task_context}</div>` : ""}
  ${
    hasMeta
      ? html`<div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800"><div class="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-400 dark:text-gray-500 font-mono">
    ${l.project ? html`<span><span class="text-gray-400 dark:text-gray-600">project</span> ${repoUrl ? html`<a href="${repoUrl}" ${!isLocal ? raw('target="_blank" rel="noopener"') : ""} class="text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition">${l.project}</a>` : html`<span class="text-gray-600 dark:text-gray-300">${l.project}</span>`}</span>` : ""}
    ${l.repository ? html`<span class="inline-flex items-center gap-1"><span class="text-gray-400 dark:text-gray-600">repo</span>${l.repository_platform && REPO_DOMAINS[l.repository_platform] ? html`<img src="/static/vendor/icons/${l.repository_platform}.svg" class="w-3 h-3 dark:invert opacity-60 shrink-0" alt="" />` : ""}${repoUrl ? html`<a href="${repoUrl}" ${!isLocal ? raw('target="_blank" rel="noopener"') : ""} class="text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition">${l.repository}</a>` : html`<span class="text-gray-600 dark:text-gray-300">${l.repository}</span>`}</span>` : ""}
    ${l.branch ? html`<span><span class="text-gray-400 dark:text-gray-600">branch</span> <span class="text-indigo-600 dark:text-indigo-400">${l.branch}</span></span>` : ""}
    ${l.commit_hash ? html`<span><span class="text-gray-400 dark:text-gray-600">commit</span> ${commitUrl ? html`<a href="${commitUrl}" target="_blank" rel="noopener" class="text-cyan-600 dark:text-cyan-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition">${l.commit_hash.slice(0, 7)}</a>` : html`<span class="text-cyan-600 dark:text-cyan-400">${l.commit_hash.slice(0, 7)}</span>`}</span>` : ""}
    ${l.folder ? html`<span class="inline-flex items-center gap-1"><span class="text-gray-400 dark:text-gray-600">folder</span><a href="vscode://file/${l.folder}" class="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition"><img src="/static/vendor/icons/vscode.svg" class="w-3.5 h-3.5 shrink-0" alt="" />${l.folder}</a></span>` : ""}
  </div></div>`
      : ""
  }
  <div id="lesson-feedback">${
    !l.feedback
      ? html`<div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
    <form method="post" action="/lessons/${encodeURIComponent(l.id)}/feedback" ${raw(feedbackHx)}><input type="hidden" name="feedback" value="know" /><input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" /><button type="submit" class="px-3 py-1 rounded text-sm font-medium transition bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-800 hover:text-green-700 dark:hover:text-white">✓ I know this</button></form>
    <form method="post" action="/lessons/${encodeURIComponent(l.id)}/feedback" ${raw(feedbackHx)}><input type="hidden" name="feedback" value="dont_know" /><input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" /><button type="submit" class="px-3 py-1 rounded text-sm font-medium transition bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900 hover:text-red-700 dark:hover:text-white">✗ I don't know this</button></form>
  </div>`
      : ""
  }</div>
  <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-300 dark:text-gray-600">ID: ${l.id}</div>
</div>
${dangerDialog(
  "confirmOpen",
  "confirmOpen = false",
  html`Delete this lesson?`,
  html`<p class="text-gray-700 dark:text-gray-200 font-medium">“${l.title}”</p>
    <p>${l.imported ? html`It was shared with you${l.shared_by ? html` by ${l.shared_by}` : ""}; you can import it again later. ` : ""}It will be removed from your log. This cannot be undone.</p>`,
  html`<button type="button" @click="confirmOpen = false" class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">Cancel</button>
    <form method="post" action="/lessons/delete" class="contents">
      <input type="hidden" name="id" value="${l.id}" />
      <input type="hidden" name="next" value="/lessons" />
      <button type="submit" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-rose-600 text-white border-rose-600 hover:bg-rose-500">🗑 Delete lesson</button>
    </form>`,
)}
</div>`;

  const head = html`<link id="hljs-theme" rel="stylesheet" href="/static/vendor/hljs-dark.min.css" />`;
  const scripts = html`<script src="/static/vendor/highlight.min.js"></script>
<script src="/static/vendor/marked.min.js"></script>
<script src="/static/vendor/purify.min.js"></script>
<script src="/static/relative-time.js"></script>
<script src="/static/share.js"></script>
<script>
  updateHljsTheme();
  marked.setOptions({
    highlight: function(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
    breaks: true, gfm: true,
  });
  document.getElementById('summary-content').innerHTML = DOMPurify.sanitize(marked.parse(${raw(jsonForScript(l.summary))}));
  document.getElementById('body-content').innerHTML = DOMPurify.sanitize(marked.parse(${raw(jsonForScript(l.body))}));
</script>`;

  return layout({
    title: `${l.title} — devcoach`,
    currentPath: "/lessons",
    uiTheme: d.uiTheme,
    head,
    body,
    scripts,
  });
}

// ── Import (GET /lessons/import) ─────────────────────────────────────────────

const LEVEL_BADGE: Record<string, string> = {
  junior:
    "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700",
  mid: "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700",
  senior:
    "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700",
};

/**
 * The receiving end of a share link (the docs page sends the browser here with `?code=`) and
 * the plain paste form. Rendering is read-only: the lesson is stored only when the visitor
 * clicks "Add to my lessons", a same-origin POST.
 */
export function importPage(d: {
  code: string;
  preview: SharedLesson | null;
  error: string | null;
  uiTheme: string;
}): Html {
  const p = d.preview;
  const pasteForm = html`<form id="import-form" method="post" action="/lessons/import" enctype="multipart/form-data" class="space-y-3">
  <input type="hidden" name="from" value="lessons" />
  <textarea name="text" rows="5" placeholder="devcoach:lesson:1:… — or the link, a URL, or the whole card" autocomplete="off" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"></textarea>
  <div class="flex items-center gap-3">
    <label class="cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition">📄 Choose a .devcoach.md file<input id="import-file" type="file" name="file" accept=".md,.json,.txt" class="hidden" onchange="document.getElementById('import-form').submit()" /></label>
    <button type="submit" class="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">Import</button>
  </div>
  <p class="text-xs text-gray-400 dark:text-gray-500">You can also drop the file anywhere on this page.</p>
</form>`;

  const body = html`
<div class="mb-4"><a href="/lessons" class="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white text-sm transition">← Back to lessons</a></div>
<div class="${p ? "max-w-5xl" : "max-w-3xl"} mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
  <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-4">${p ? "Someone shared a lesson with you" : "Import a shared lesson"}</p>
  ${d.error ? html`<div class="mb-4 px-4 py-2 rounded-lg border text-sm bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-300">${d.error}</div>` : ""}
  ${
    p
      ? html`<div class="flex flex-wrap items-center gap-3 mb-2">
    <h1 class="text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0">${p.lesson.title}</h1>
    <span class="text-xs font-semibold px-2 py-0.5 rounded-full border ${LEVEL_BADGE[p.lesson.level] ?? ""} shrink-0">${p.lesson.level}</span>
  </div>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-5">
    <span>🏷 <span class="text-cyan-600 dark:text-cyan-400">${p.lesson.topic_id}</span></span>
    ${p.lesson.categories.map((cat) => html`<span class="inline-block bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs rounded px-2 py-0.5 border border-gray-200 dark:border-gray-700">${cat}</span>`)}
    <span>🤝 shared by <span class="text-gray-700 dark:text-gray-200">${p.shared_by ?? "anonymous"}</span> · ${p.shared_at.slice(0, 10)}</span>
  </div>
  <div class="my-5 pl-4 border-l-4 border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 rounded-r-lg py-3 pr-4">
    <p class="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400 mb-1">TL;DR</p>
    <div id="summary-content" class="markdown-body text-sm text-indigo-900 dark:text-indigo-100"></div>
  </div>
  <details class="group" open ${p.lesson.body ? "" : "hidden"}>
    <summary class="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 select-none">Full lesson</summary>
    <div id="body-content" class="markdown-body mt-3"></div>
  </details>
  ${p.lesson.task_context ? html`<div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400"><span class="text-gray-400 dark:text-gray-500">Context:</span> ${p.lesson.task_context}</div>` : ""}
  <form method="post" action="/lessons/import" class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3">
    <input type="hidden" name="from" value="lessons" />
    <input type="hidden" name="text" value="${d.code}" />
    <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">＋ Add to my lessons</button>
    <p class="text-xs text-gray-400 dark:text-gray-500">Nothing is saved until you click. It joins your log like your own lessons and never counts against the daily limit.</p>
  </form>`
      : pasteForm
  }
</div>`;

  const head = html`<link id="hljs-theme" rel="stylesheet" href="/static/vendor/hljs-dark.min.css" />`;
  const scripts = html`<script src="/static/vendor/highlight.min.js"></script>
<script src="/static/vendor/marked.min.js"></script>
<script src="/static/vendor/purify.min.js"></script>
<script src="/static/share.js"></script>
<script>
  updateHljsTheme();
  marked.setOptions({
    highlight: function(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
    breaks: true, gfm: true,
  });
  ${
    p
      ? raw(`document.getElementById('summary-content').innerHTML = DOMPurify.sanitize(marked.parse(${jsonForScript(p.lesson.summary)}));
  document.getElementById('body-content').innerHTML = DOMPurify.sanitize(marked.parse(${jsonForScript(p.lesson.body ?? "")}));`)
      : ""
  }
</script>`;

  return layout({
    title: p ? `${p.lesson.title} — devcoach` : "Import a lesson — devcoach",
    currentPath: "/lessons",
    uiTheme: d.uiTheme,
    head,
    body,
    scripts,
  });
}

// ── Settings (settings.html) ─────────────────────────────────────────────────

const GAP_OPTIONS: [number, string][] = [
  [0, "No cooldown"],
  [15, "15 minutes"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [90, "1 hour 30 min"],
  [120, "2 hours"],
  [180, "3 hours"],
  [240, "4 hours"],
  [360, "6 hours"],
  [480, "8 hours"],
  [720, "12 hours"],
  [1440, "24 hours"],
];

export interface SettingsData {
  settings: Settings;
  notebookContent: string;
  notebookPath: string;
  uiTheme: string;
  flash?: {
    imported: number;
    skipped: number;
    invalid: number;
    groups: number;
    notebook: number;
  } | null;
}

export function settingsPage(d: SettingsData): Html {
  const gap = d.settings.min_gap_minutes;
  const themeRadios: [string, string, string][] = [
    ["system", "System", "🌓"],
    ["light", "Light", "☀️"],
    ["dark", "Dark", "🌙"],
  ];
  const homeRadios: [string, string, string][] = [
    ["auto", "Auto", "🏠"],
    ["lessons", "Lessons", "📚"],
    ["knowledge", "Knowledge map", "🧭"],
  ];
  const f = d.flash;

  const body = html`
<h1 class="text-2xl font-bold mb-6 text-indigo-600 dark:text-indigo-400">Settings</h1>
${
  f
    ? html`<div class="mb-4 px-4 py-2 rounded-lg border text-sm ${f.invalid ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300" : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300"}">
  ${f.imported} lesson${f.imported !== 1 ? "s" : ""} imported.${f.skipped ? ` ${f.skipped} skipped (already in DB).` : ""}${f.invalid ? ` ${f.invalid} rejected (failed validation).` : ""}${f.groups ? ` ${f.groups} group${f.groups !== 1 ? "s" : ""} added.` : ""}${f.notebook ? " Notebook restored." : ""}
</div>`
    : ""
}
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
    <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-5">Coaching</p>
    <form method="post" action="/settings" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="max-per-day" class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Max lessons per day</label>
          <input id="max-per-day" type="number" name="max_per_day" min="1" max="20" value="${d.settings.max_per_day}" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Lessons in a 24h window.</p>
        </div>
        <div>
          <label for="min-gap-minutes" class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Minimum gap between lessons</label>
          <select id="min-gap-minutes" name="min_gap_minutes" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            ${GAP_OPTIONS.map(([val, lbl]) => html`<option value="${val}" ${gap === val ? "selected" : ""}>${lbl}</option>`)}
          </select>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Minimum gap between lessons.</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="nudge-every" class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Interactions between lessons</label>
          <input id="nudge-every" type="number" name="nudge_every" min="0" max="1000" value="${d.settings.nudge_every}" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Cue at most once every N (0 = every turn).</p>
        </div>
        <div>
          <label for="nudge-scope" class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Count interactions</label>
          <select id="nudge-scope" name="nudge_scope" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            <option value="session" ${d.settings.nudge_scope === "session" ? "selected" : ""}>Per chat session</option>
            <option value="global" ${d.settings.nudge_scope === "global" ? "selected" : ""}>Globally</option>
          </select>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Per-chat or across all sessions.</p>
        </div>
      </div>
      <div>
        <label for="share-name" class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Your name (for sharing)</label>
        <input id="share-name" type="text" name="share_name" maxlength="80" value="${d.settings.share_name ?? ""}" placeholder="git user.name when empty" autocomplete="off" class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Proposed as the sender when you share a lesson. Empty → your git name.</p>
      </div>
      <fieldset class="border-0 p-0 m-0">
        <legend class="block text-sm text-gray-600 dark:text-gray-400 mb-1">UI theme</legend>
        <div class="flex gap-2">
          ${themeRadios.map(
            ([value, label, icon]) => html`<label class="flex-1 cursor-pointer">
            <input type="radio" name="ui_theme" value="${value}" ${d.settings.ui_theme === value ? "checked" : ""} class="sr-only peer" />
            <span class="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 dark:peer-checked:bg-indigo-900/30 peer-checked:text-indigo-700 dark:peer-checked:text-indigo-300 text-gray-500 dark:text-gray-400 text-xs font-medium transition select-none"><span class="text-base leading-none">${icon}</span>${label}</span>
          </label>`,
          )}
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">System follows your OS preference.</p>
      </fieldset>
      <fieldset class="border-0 p-0 m-0">
        <legend class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Home page</legend>
        <div class="flex gap-2">
          ${homeRadios.map(
            ([value, label, icon]) => html`<label class="flex-1 cursor-pointer">
            <input type="radio" name="ui_home" value="${value}" ${d.settings.ui_home === value ? "checked" : ""} class="sr-only peer" />
            <span class="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 dark:peer-checked:bg-indigo-900/30 peer-checked:text-indigo-700 dark:peer-checked:text-indigo-300 text-gray-500 dark:text-gray-400 text-xs font-medium transition select-none"><span class="text-base leading-none">${icon}</span>${label}</span>
          </label>`,
          )}
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Auto opens Lessons once you have one, the knowledge map before.</p>
      </fieldset>
      <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-4 py-2 text-sm transition">Save settings</button>
    </form>
  </div>

  <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
    <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-5">Backup &amp; Restore</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Full backup</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">Settings + knowledge map + lessons + coaching notebook as a zip file.</p>
        <a href="/settings/export" class="mt-auto inline-flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded px-4 py-2 text-sm transition">↓ Download backup</a>
      </div>
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Restore backup</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">Overwrites settings, knowledge map &amp; coaching notebook; duplicate lessons are skipped.</p>
        <form method="post" action="/settings/import" enctype="multipart/form-data" class="mt-auto flex flex-col gap-2">
          <input id="file-restore" type="file" name="file" accept=".zip,.json" class="hidden" onchange="updateLabel('file-restore','label-restore','restore-submit')" />
          <label id="label-restore" for="file-restore" class="cursor-pointer inline-flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded px-4 py-2 text-sm transition truncate">Choose file…</label>
          <button id="restore-submit" type="submit" disabled class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded px-4 py-2 text-sm transition">Restore</button>
        </form>
      </div>
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Lessons only</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">Export just the lesson log as JSON (no settings).</p>
        <a href="/lessons/export" class="mt-auto inline-flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded px-4 py-2 text-sm transition">↓ Download lessons</a>
      </div>
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Import lessons</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">Merge a lessons JSON file; duplicates are skipped.</p>
        <form method="post" action="/lessons/import" enctype="multipart/form-data" class="mt-auto flex flex-col gap-2">
          <input id="file-import" type="file" name="file" accept=".json" class="hidden" onchange="updateLabel('file-import','label-import','import-submit')" />
          <label id="label-import" for="file-import" class="cursor-pointer inline-flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded px-4 py-2 text-sm transition truncate">Choose file…</label>
          <button id="import-submit" type="submit" disabled class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded px-4 py-2 text-sm transition">Import</button>
        </form>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 lg:col-span-2" x-data="{ nbMode: 'preview' }">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Coaching Notebook</p>
      <div class="flex items-center gap-2">
        <div class="flex rounded border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
          <button type="button" @click="nbMode = 'preview'" :class="nbMode === 'preview' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'" class="px-3 py-1.5 transition">Preview</button>
          <button type="button" @click="nbMode = 'source'" :class="nbMode === 'source' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'" class="px-3 py-1.5 transition border-l border-gray-200 dark:border-gray-700">Source</button>
        </div>
        <a href="/settings/notebook/download" class="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded px-3 py-1.5 text-xs transition">↓ Download</a>
        <a href="vscode://file/${d.notebookPath}" title="Open in VS Code" class="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded px-3 py-1.5 text-xs transition"><img src="/static/vscode.svg" class="w-4 h-4" alt="VS Code" />Open in VS Code</a>
      </div>
    </div>
    <div x-show="nbMode === 'preview'" id="notebook-preview-settings" class="markdown-body min-h-24"></div>
    <pre x-show="nbMode === 'source'" style="display:none" class="text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-700 dark:text-gray-200 min-h-24">${d.notebookContent}</pre>
  </div>
</div>`;

  const scripts = html`<script src="/static/vendor/marked.min.js"></script>
<script src="/static/vendor/purify.min.js"></script>
<script>
function updateLabel(inputId, labelId, submitId) {
  var input = document.getElementById(inputId);
  document.getElementById(labelId).textContent = input.files.length ? input.files[0].name : 'Choose file…';
  document.getElementById(submitId).disabled = !input.files.length;
}
marked.setOptions({ breaks: true, gfm: true });
document.getElementById('notebook-preview-settings').innerHTML = DOMPurify.sanitize(marked.parse(${raw(jsonForScript(d.notebookContent))}));
</script>`;

  return layout({
    title: "Settings — devcoach",
    currentPath: "/settings",
    uiTheme: d.uiTheme,
    body,
    scripts,
  });
}
