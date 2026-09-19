/* Shared relative-time formatter used by the lessons list and the lesson page. Every [data-ts]
   gets a relative label; when its cell is too narrow for the long form ("17 minutes ago") it
   switches to the compact one ("17m"), and it is re-evaluated after column drags and resizes. */
(function () {
  var rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  var COMPACT_BELOW = 120; // cell width (px) under which the compact form is used

  function parts(iso) {
    var diffMs = Date.now() - new Date(iso);
    var mins = Math.floor(diffMs / 60000);
    var days = Math.floor(diffMs / 86400000);
    return { diffMs: diffMs, mins: mins, days: days };
  }

  function relativeTime(iso) {
    var p = parts(iso);
    if (p.diffMs < 0 || p.mins < 1) return 'just now';
    if (p.mins < 60)    return rtf.format(-p.mins, 'minute');
    if (p.days === 0)   return 'today';
    if (p.days === 1)   return 'yesterday';
    if (p.days < 7)     return rtf.format(-p.days, 'day');
    if (p.days < 30)    return rtf.format(-Math.floor(p.days / 7), 'week');
    if (p.days < 365)   return rtf.format(-Math.floor(p.days / 30), 'month');
    return rtf.format(-Math.floor(p.days / 365), 'year');
  }

  function compactTime(iso) {
    var p = parts(iso);
    if (p.diffMs < 0 || p.mins < 1) return 'now';
    if (p.mins < 60)    return p.mins + 'm';
    if (p.days === 0)   return 'today';
    if (p.days < 7)     return p.days + 'd';
    if (p.days < 30)    return Math.floor(p.days / 7) + 'w';
    if (p.days < 365)   return Math.floor(p.days / 30) + 'mo';
    return Math.floor(p.days / 365) + 'y';
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
