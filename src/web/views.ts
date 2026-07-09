// Server-rendered views (hono/html) — faithful Tailwind/Alpine markup.
// The original Tailwind classes + Alpine/HTMX attributes are reproduced verbatim; the browser-runtime
// Tailwind (static/vendor/tailwind.js) and vendored Alpine/HTMX/Flatpickr/marked render them identically.
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { KnowledgeEntry, Lesson, Settings } from "../core/models";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/** JSON encoded for safe embedding inside a <script> (mirrors Jinja's |tojson). */
function jsonForScript(v: unknown): string {
  return JSON.stringify(v ?? "").replace(
    /[<>&\u2028\u2029]/g,
    (ch) => String.raw`\u` + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, "0"),
  );
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
    <span class="font-extrabold text-lg tracking-tight text-gray-900 dark:text-gray-100"
      >🎓 dev<span class="text-teal-600 dark:text-teal-300">coach</span></span
    >
    ${link("/", "Profile", o.currentPath === "/")}
    ${link("/lessons", "Lessons", o.currentPath.includes("/lessons"))}
    ${link("/settings", "Settings", o.currentPath === "/settings")}
    <div class="ml-auto">
      <button id="theme-toggle" onclick="toggleTheme()"
              class="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition text-lg leading-none px-1"
              title="Toggle theme"></button>
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
<div x-data="{ editMode: JSON.parse(localStorage.getItem('km-edit-mode') || 'false'), toggle() { this.editMode = !this.editMode; localStorage.setItem('km-edit-mode', this.editMode); } }">

<div class="flex items-center justify-between mb-6">
  <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Knowledge Map</h1>
  <div class="flex items-center gap-2">
    <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative">
      <button type="button" @click="open = !open"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">+ Add group</button>
      <div x-show="open" @click.outside="open = false" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-56" style="display:none">
        <form method="post" action="/groups" class="flex gap-2">
          <input type="text" name="group_name" placeholder="Group name…" required class="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition">Add</button>
        </form>
      </div>
    </div>
    <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative">
      <button type="button" @click="open = !open" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400">+ Add topic</button>
      <div x-show="open" @click.outside="open = false" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 w-72" style="display:none">
        <form method="post" action="/knowledge" class="space-y-3">
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
          ? html`<form x-show="editMode" style="display:none" method="post" action="/groups/${encodeURIComponent(category)}/delete" onsubmit="return confirm('Remove group &quot;${category}&quot;? Topics will move to Other.')">
          <button type="submit" class="text-xs text-gray-300 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition w-4 text-center opacity-0 group-hover/section:opacity-100" title="Delete group">×</button>
        </form>`
          : ""
      }
    </div>
    <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative">
      <button type="button" @click="open = !open" class="text-xs text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition px-1">+ topic</button>
      <div x-show="open" @click.outside="open = false" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-64" style="display:none">
        <form method="post" action="/knowledge" class="space-y-2">
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
    <div class="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-800/50 group/row">
      <div x-show="editMode" style="display:none" x-data="{ open: false }" class="relative shrink-0 flex items-center">
        <button type="button" @click="open = !open" class="text-xs text-gray-200 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition w-4 text-center opacity-0 group-hover/row:opacity-100" title="Move to group">⇄</button>
        <div x-show="open" @click.outside="open = false" class="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-1 w-40" style="display:none">
          <form method="post" action="/knowledge/${encodeURIComponent(entry.topic)}/group">
            <select name="group" onchange="this.form.submit()" class="w-full text-xs bg-transparent text-gray-700 dark:text-gray-200 px-2 py-1 focus:outline-none">
              <option value="Other" ${category === "Other" ? "selected" : ""}>Other (ungrouped)</option>
              ${groupOptions(category)}
            </select>
          </form>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-1 min-w-0">
        <a x-show="!editMode" href="/lessons?search=${encodeURIComponent(entry.topic)}" class="text-sm text-gray-700 dark:text-gray-200 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition" title="${entry.topic}">${entry.topic}</a>
        <span x-show="editMode" style="display:none" class="text-sm text-gray-700 dark:text-gray-200 min-w-0 truncate" title="${entry.topic}">${entry.topic}</span>
        <form x-show="editMode" style="display:none" method="post" action="/knowledge/${encodeURIComponent(entry.topic)}/delete" onsubmit="return confirm('Remove ${entry.topic} from your knowledge map?')" class="shrink-0 flex items-center">
          <button type="submit" class="text-xs text-gray-200 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 transition w-4 text-center opacity-0 group-hover/row:opacity-100" title="Remove topic">×</button>
        </form>
      </div>
      <form x-show="editMode" style="display:none" method="post" action="/knowledge/${encodeURIComponent(entry.topic)}" class="shrink-0 flex items-center">
        <input type="hidden" name="delta" value="-1" />
        <button class="text-xs text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition w-5 text-center leading-none">−</button>
      </form>
      <div class="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
        <div class="${color} h-full rounded-full transition-all" style="width: ${pct}%"></div>
      </div>
      <form x-show="editMode" style="display:none" method="post" action="/knowledge/${encodeURIComponent(entry.topic)}" class="shrink-0 flex items-center">
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

  return layout({ title: "Profile — devcoach", currentPath: "/", uiTheme: d.uiTheme, body });
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
  search: string;
  feedback: string;
  date_from: string;
  date_to: string;
  sort: string;
  order: string;
}

export interface LessonsData {
  lessons: Lesson[];
  allCategories: string[];
  allProjects: string[];
  allRepositories: string[];
  allBranches: string[];
  allCommits: string[];
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
    return html`<th class="px-3 py-3 whitespace-nowrap ${extra}">
      <a href="${lessonsQs(s, { sort: col, order: next })}" class="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition group/sort">${label}
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

  const body = html`
<form id="filter-form" method="get" action="/lessons">
  <input type="hidden" name="period" id="h-period" value="${s.period}">
  <input type="hidden" name="date_from" id="h-date-from" value="${s.date_from}">
  <input type="hidden" name="date_to" id="h-date-to" value="${s.date_to}">
  <input type="hidden" name="feedback" id="h-feedback" value="${s.feedback}">
  <input type="hidden" name="starred" id="h-starred" value="${s.starred ? "1" : ""}">
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
  </div>

  ${
    anyFilter
      ? html`<div class="flex flex-wrap gap-1.5 mb-4">
    ${customDate ? chip(`📅 ${periodLabel}`, lessonsQs(s, { date_from: "", date_to: "" })) : ""}
    ${s.period !== "all" && !customDate ? chip(`🕐 ${periodLabel}`, lessonsQs(s, { period: "all" })) : ""}
    ${s.feedback ? chip(FEEDBACK_LABELS[s.feedback] ?? s.feedback, lessonsQs(s, { feedback: "" })) : ""}
    ${s.starred ? html`<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">★ Starred<a href="${lessonsQs({ ...s, starred: false })}" class="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-yellow-200 dark:hover:bg-yellow-700 transition">×</a></span>` : ""}
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

${
  d.lessons.length
    ? html`<div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
  <table class="w-full text-sm">
    <thead>
      <tr class="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <th class="w-8 px-3 py-3"></th>
        ${sortTh("Date", "timestamp")}
        ${sortTh("Topic", "topic_id", "hidden sm:table-cell")}
        ${sortTh("Title", "title")}
        ${sortTh("Level", "level")}
        <th class="px-3 py-3 hidden lg:table-cell">Categories</th>
        ${sortTh("Feedback", "feedback", "hidden xl:table-cell")}
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
      ${d.lessons.map((lesson) => {
        const date = lesson.timestamp.slice(0, 10);
        const tip = lesson.timestamp.slice(0, 16).replace("T", " ");
        return html`<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group cursor-pointer" tabindex="0" onclick="window.location='/lessons/${encodeURIComponent(lesson.id)}'" onkeydown="if(event.key==='Enter')window.location='/lessons/${encodeURIComponent(lesson.id)}'" role="link">
        <td class="px-3 py-3" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <form method="post" action="/lessons/${encodeURIComponent(lesson.id)}/star">
            <input type="hidden" name="starred" value="${lesson.starred ? "0" : "1"}" />
            <input type="hidden" name="next" value="/lessons${lessonsQs(s)}" />
            <button type="submit" title="${lesson.starred ? "Unstar" : "Star"}" class="w-6 text-lg text-center leading-none transition ${lesson.starred ? "text-yellow-400 hover:text-yellow-300" : "text-gray-300 dark:text-gray-600 hover:text-yellow-400"}">${lesson.starred ? "★" : "☆"}</button>
          </form>
        </td>
        <td class="px-3 py-3 whitespace-nowrap tabular-nums relative group/date">
          <span class="text-gray-400 dark:text-gray-500 cursor-default" data-ts="${lesson.timestamp}">${date}</span>
          <div class="absolute z-10 bottom-full left-0 mb-1 px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover/date:opacity-100 transition-opacity duration-150">${tip}</div>
        </td>
        <td class="px-3 py-3 hidden sm:table-cell"><span class="text-xs font-mono text-cyan-600 dark:text-cyan-400">${lesson.topic_id}</span></td>
        <td class="px-3 py-3 max-w-xs"><a href="/lessons/${encodeURIComponent(lesson.id)}" class="font-medium text-gray-800 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2">${lesson.title}</a></td>
        <td class="px-3 py-3" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"><a href="${lessonsQs(s, { level: lesson.level })}" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${levelTextColor[lesson.level] ?? ""} hover:ring-2 hover:ring-current hover:ring-offset-1 transition-shadow">${lesson.level}</a></td>
        <td class="px-3 py-3 hidden lg:table-cell" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"><div class="flex flex-wrap gap-1">${lesson.categories.map((cat) => html`<a href="${lessonsQs(s, { category: cat })}" class="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">${cat}</a>`)}</div></td>
        <td class="px-3 py-3 hidden xl:table-cell" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">${lesson.feedback === "know" ? html`<span class="text-xs text-teal-600 dark:text-teal-400 font-medium">✓ Known</span>` : lesson.feedback === "dont_know" ? html`<span class="text-xs text-rose-500 dark:text-rose-400 font-medium">✗ Unknown</span>` : ""}</td>
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
}`;

  const scripts = html`<script src="/static/vendor/flatpickr.min.js"></script>
<script src="/static/relative-time.js"></script>
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

export function lessonDetailPage(d: { lesson: Lesson; uiTheme: string }): Html {
  const l = d.lesson;
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

  const body = html`
<div class="mb-4"><a href="/lessons" class="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white text-sm transition">← Back to lessons</a></div>
<div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
  <div class="flex flex-wrap items-center gap-3 mb-2">
    <form method="post" action="/lessons/${encodeURIComponent(l.id)}/star">
      <input type="hidden" name="starred" value="${l.starred ? "0" : "1"}" />
      <input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" />
      <button type="submit" title="${l.starred ? "Unstar" : "Star"}" class="w-6 text-center text-xl leading-none transition ${l.starred ? "text-yellow-400 hover:text-yellow-300" : "text-gray-300 dark:text-gray-600 hover:text-yellow-400"}">${l.starred ? "★" : "☆"}</button>
    </form>
    <h1 class="text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0">${l.title}</h1>
    <a href="/lessons?level=${l.level}" class="text-xs font-semibold px-2 py-0.5 rounded-full border ${levelClass} shrink-0 hover:ring-2 hover:ring-current hover:ring-offset-1 transition-shadow">${l.level}</a>
  </div>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-5">
    <span class="relative group/date cursor-default">🗓 <span data-ts="${l.timestamp}">${date}</span>
      <span class="absolute z-10 bottom-full left-0 mb-1 px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover/date:opacity-100 transition-opacity duration-150">${tip}</span>
    </span>
    <span>🏷 <span class="text-cyan-600 dark:text-cyan-400">${l.topic_id}</span></span>
    ${l.categories.map((cat) => html`<a href="/lessons?category=${encodeURIComponent(cat)}" class="inline-block bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 text-gray-600 dark:text-gray-300 text-xs rounded px-2 py-0.5 transition border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600">${cat}</a>`)}
    ${
      l.feedback
        ? html`${
            l.feedback === "know"
              ? html`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700">✓ I know this</span>`
              : html`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700">✗ I don't know this</span>`
          }
        <form method="post" action="/lessons/${encodeURIComponent(l.id)}/feedback"><input type="hidden" name="feedback" value="clear" /><input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" /><button type="submit" class="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition">Clear</button></form>`
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
  ${
    !l.feedback
      ? html`<div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
    <form method="post" action="/lessons/${encodeURIComponent(l.id)}/feedback"><input type="hidden" name="feedback" value="know" /><input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" /><button type="submit" class="px-3 py-1 rounded text-sm font-medium transition bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-800 hover:text-green-700 dark:hover:text-white">✓ I know this</button></form>
    <form method="post" action="/lessons/${encodeURIComponent(l.id)}/feedback"><input type="hidden" name="feedback" value="dont_know" /><input type="hidden" name="next" value="/lessons/${encodeURIComponent(l.id)}" /><button type="submit" class="px-3 py-1 rounded text-sm font-medium transition bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900 hover:text-red-700 dark:hover:text-white">✗ I don't know this</button></form>
  </div>`
      : ""
  }
  <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-300 dark:text-gray-600">ID: ${l.id}</div>
</div>`;

  const head = html`<link id="hljs-theme" rel="stylesheet" href="/static/vendor/hljs-dark.min.css" />`;
  const scripts = html`<script src="/static/vendor/highlight.min.js"></script>
<script src="/static/vendor/marked.min.js"></script>
<script src="/static/relative-time.js"></script>
<script>
  updateHljsTheme();
  marked.setOptions({
    highlight: function(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
    breaks: true, gfm: true,
  });
  document.getElementById('summary-content').innerHTML = marked.parse(${raw(jsonForScript(l.summary))});
  document.getElementById('body-content').innerHTML = marked.parse(${raw(jsonForScript(l.body))});
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
<script>
function updateLabel(inputId, labelId, submitId) {
  var input = document.getElementById(inputId);
  document.getElementById(labelId).textContent = input.files.length ? input.files[0].name : 'Choose file…';
  document.getElementById(submitId).disabled = !input.files.length;
}
marked.setOptions({ breaks: true, gfm: true });
document.getElementById('notebook-preview-settings').innerHTML = marked.parse(${raw(jsonForScript(d.notebookContent))});
</script>`;

  return layout({
    title: "Settings — devcoach",
    currentPath: "/settings",
    uiTheme: d.uiTheme,
    body,
    scripts,
  });
}
