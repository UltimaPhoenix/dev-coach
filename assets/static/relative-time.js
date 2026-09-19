/* Shared relative-time formatter used by the lessons list and the lesson page. Every [data-ts]
   gets a relative label; when its cell is too narrow for the long form ("17 minutes ago") it
   switches to the compact one ("17m"), and it is re-evaluated after column drags and resizes. */
(function () {
  /* "yesterday" / "today" are only right at day granularity; for weeks the number is always
     spelled out — "last week" for something 13 days old is a lie — and from two months on the
     relative label stops being useful at all: the ISO date is printed instead. */
  var rtfAuto = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  var rtfExact = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  var COMPACT_BELOW = 120; // cell width (px) under which the compact form is used

  function parts(iso) {
    var date = new Date(iso);
    var now = new Date();
    var diffMs = now - date;
    var mins = Math.floor(diffMs / 60000);
    var days = Math.floor(diffMs / 86400000);
    /* Calendar months between the two dates by label: a July lesson seen in September is two
       months away, whatever the day of month — old enough to print the date. */
    var months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
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
    if (p.months < 2)   return rtfExact.format(-p.months, 'month');
    return isoDate(iso);
  }

  function isoDate(iso) {
    return iso.slice(0, 10);
  }

  function compactTime(iso) {
    var p = parts(iso);
    if (p.diffMs < 0 || p.mins < 1) return 'now';
    if (p.mins < 60)    return p.mins + 'm';
    if (p.days === 0)   return 'today';
    if (p.days < 7)     return p.days + 'd';
    if (p.months < 1)   return Math.floor(p.days / 7) + 'w';
    if (p.months < 2)   return p.months + 'mo';
    return isoDate(iso);
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
