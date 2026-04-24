/* Shared relative-time formatter used by lessons.html and lesson_detail.html */
(function () {
  var rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  function relativeTime(iso) {
    var date = new Date(iso);
    var diffMs = Date.now() - date;
    if (diffMs < 0)       return 'just now';
    var diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)     return 'just now';
    if (diffMins < 60)    return rtf.format(-diffMins, 'minute');
    var diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0)   return 'today';
    if (diffDays === 1)   return 'yesterday';
    if (diffDays < 7)     return rtf.format(-diffDays, 'day');
    if (diffDays < 30)    return rtf.format(-Math.floor(diffDays / 7), 'week');
    if (diffDays < 365)   return rtf.format(-Math.floor(diffDays / 30), 'month');
    return rtf.format(-Math.floor(diffDays / 365), 'year');
  }

  document.querySelectorAll('[data-ts]').forEach(function (el) {
    el.textContent = relativeTime(el.dataset.ts);
  });
})();
