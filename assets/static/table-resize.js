// Drag-to-resize table columns (the lessons table). Widths live on the <col> elements and are
// remembered per column in localStorage; double-click a handle to reset one column, or call
// window.resetLessonColumns() (the ⋯ menu) to reset them all. Desktop widths only — on narrow
// screens columns are already hidden and a drag would fight scrolling.
//
// One column (`<col data-flex>`, the title) never gets an explicit width: it takes whatever the
// others leave, so the table can never grow past its container and clip the right-hand columns.
// Every drag is clamped so the flex column keeps at least MIN_FLEX px, which keeps every column
// visible; stored widths that no longer fit (a narrower window) are dropped on load.
(function () {
  var MIN = 48;
  var MIN_FLEX = 220;
  var STORAGE = "lessons-col-widths";
  if (!globalThis.matchMedia || !globalThis.matchMedia("(min-width: 1024px)").matches) {
    globalThis.resetLessonColumns = function () {};
    return;
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || "{}") || {};
    } catch {
      return {};
    }
  }
  function save(widths) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(widths));
    } catch {
      /* storage unavailable: widths last for this page only */
    }
  }

  var tables = document.querySelectorAll("table[data-resizable]");
  tables.forEach(function (table) {
    var cols = Array.prototype.slice.call(table.querySelectorAll("colgroup > col"));
    var ths = Array.prototype.slice.call(table.querySelectorAll("thead th"));
    if (cols.length !== ths.length) return;
    var widths = load();
    // The defaults are inline widths on the <col>s: remember them so resets restore, not wipe.
    cols.forEach(function (col) {
      col.dataset.defaultWidth = col.style.width || "";
    });
    function restore(col) {
      col.style.width = col.dataset.defaultWidth || "";
    }
    var flexIndex = cols.findIndex(function (col) {
      return col.hasAttribute("data-flex");
    });
    var flexTh = flexIndex >= 0 ? ths[flexIndex] : null;
    function flexWidth() {
      return flexTh ? flexTh.getBoundingClientRect().width : Infinity;
    }
    function apply() {
      cols.forEach(function (col) {
        var px = widths[col.dataset.col];
        if (typeof px === "number" && px >= MIN) col.style.width = px + "px";
        else restore(col);
      });
      if (flexWidth() < MIN_FLEX) {
        // The remembered layout does not fit this window: fall back to the defaults.
        widths = {};
        cols.forEach(restore);
      }
    }
    apply();
    var resizeTimer;
    globalThis.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(apply, 150);
    });

    ths.forEach(function (th, i) {
      // The star and share columns stay fixed; the flex column is whatever is left.
      if (i === 0 || i === ths.length - 1 || i === flexIndex) return;
      var col = cols[i];
      var handle = document.createElement("span");
      handle.className = "dc-resize-handle";
      handle.setAttribute("aria-hidden", "true");
      th.appendChild(handle);

      handle.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      handle.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        restore(col);
        delete widths[col.dataset.col];
        save(widths);
      });
      handle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var startX = e.clientX;
        var startW = th.getBoundingClientRect().width;
        var maxW = startW + Math.max(0, flexWidth() - MIN_FLEX);
        handle.setPointerCapture(e.pointerId);
        table.classList.add("dc-resizing");
        function move(ev) {
          var w = Math.min(maxW, Math.max(MIN, Math.round(startW + ev.clientX - startX)));
          col.style.width = w + "px";
        }
        function up() {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          table.classList.remove("dc-resizing");
          widths[col.dataset.col] = Math.round(th.getBoundingClientRect().width);
          save(widths);
        }
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });
    });
  });

  globalThis.resetLessonColumns = function () {
    try {
      localStorage.removeItem(STORAGE);
    } catch {
      /* ignore */
    }
    document.querySelectorAll("table[data-resizable] colgroup > col").forEach(function (col) {
      col.style.width = col.dataset.defaultWidth || "";
    });
  };
})();
