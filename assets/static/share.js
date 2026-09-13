/* Lesson sharing helpers for the dashboard (lesson detail + lessons list).
   The share payloads are pre-rendered by the server into #share-payloads data-* attributes so a
   clipboard write happens synchronously inside the click (Safari refuses async writes). */
(function () {
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function flash(btn, label) {
    if (!btn) return;
    var original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = label;
    setTimeout(function () { btn.textContent = original; }, 1500);
  }

  window.copyShare = function (kind, btn) {
    var el = document.getElementById('share-payloads');
    if (!el) return;
    var text = el.dataset[kind] || '';
    var done = function () { flash(btn, '✓ Copied'); };
    var fail = function () { flash(btn, fallbackCopy(text) ? '✓ Copied' : 'Copy failed'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  };

  /* Drop a .devcoach.md (or lessons .json) anywhere on the lessons page: the dropped file goes
     into the import form's file input and the form submits. */
  window.dropSharedFile = function (event) {
    var files = event.dataTransfer && event.dataTransfer.files;
    var form = document.getElementById('import-form');
    var input = document.getElementById('import-file');
    if (!files || !files.length || !form || !input) return;
    input.files = files;
    form.submit();
  };
})();

/* Drop anywhere: only on pages that carry the import form. */
(function () {
  if (!document.getElementById('import-form')) return;
  var hint = document.getElementById('drop-hint');
  var depth = 0;
  function show(on) {
    if (!hint) return;
    hint.classList.toggle('hidden', !on);
    hint.classList.toggle('flex', on);
  }
  window.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; show(true); });
  window.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) show(false); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); depth = 0; show(false); window.dropSharedFile(e); });
})();
