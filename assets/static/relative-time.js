/* Shared relative-time formatter used by the lessons list and the lesson page. Every [data-ts]
   gets a relative label; when its cell is too narrow for the long form ("17 minutes ago") it
   switches to the compact one ("17m"), and it is re-evaluated after column drags and resizes. */
(function () {
  /* "yesterday" / "today" are only right at day granularity; for weeks, months and years the
     number is always spelled out — "last month" for something 45 days old is a lie. */
  var rtfAuto = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  var rtfExact = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  var COMPACT_BELOW = 120; // cell width (px) under which the compact form is used

  function parts(iso) {
    var date = new Date(iso);
    var now = new Date();
    var diffMs = now - date;
    var mins = Math.floor(diffMs / 60000);
    var days = Math.floor(diffMs / 86400000);
    /* Whole calendar months elapsed (a lesson from the 3rd is "1 month ago" from the 3rd on). */
    var months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    if (now.getDate() < date.getDate()) months -= 1;
    return { diffMs: diffMs, mins: mins, days: days, months: Math.max(0, months) };
  }

  function relativeTime(iso) {
    var p = parts(iso);
    if (p.diffMs < 0 || p.mins < 1) return 'just now';
    if (p.mins < 60)    return rtfAuto.format(-p.mins, 'minute');
    if (p.days === 0)   return 'today';
    if (p.days === 1)   return 'yesterday';
    if (p.days < 7)     return rtfAuto.format(-p.days, 'day');
    if (p.months < 1)   return rtfExact.format(-Math.floor(p.days / 7), 'week');
    if (p.months < 12)  return rtfExact.format(-p.months, 'month');
    return rtfExact.format(-Math.floor(p.months / 12), 'year');
  }

  function compactTime(iso) {
    var p = parts(iso);
    if (p.diffMs < 0 || p.mins < 1) return 'now';
    if (p.mins < 60)    return p.mins + 'm';
    if (p.days === 0)   return 'today';
    if (p.days < 7)     return p.days + 'd';
    if (p.months < 1)   return Math.floor(p.days / 7) + 'w';
    if (p.months < 12)  return p.months + 'mo';
    return Math.floor(p.months / 12) + 'y';
  }

  function isNarrow(el) {
    var cell = el.closest('td, th');
    if (!cell) return false;
    var w = cell.getBoundingClientRect().width;
    return w > 0 && w < COMPACT_BELOW;
  }

  function applyRelativeTimes(root) {
    root.querySelectorAll('[data-ts]').forEach(function (el) {
      el.textContent = isNarrow(el) ? compactTime(el.dataset.ts) : relativeTime(el.dataset.ts);
    });
  }

  applyRelativeTimes(document);
  /* HTMX-swapped fragments (lesson rows, lesson meta) arrive with raw dates. */
  document.body.addEventListener('htmx:afterSettle', function () {
    applyRelativeTimes(document);
  });
  /* Column drags / resets (table-resize.js) and window resizes change the available width. */
  document.addEventListener('dc:columns-resized', function () {
    applyRelativeTimes(document);
  });
  var timer;
  globalThis.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { applyRelativeTimes(document); }, 150);
  });
})();
