// Drag-to-resize table columns (the lessons table). Widths live on the <col> elements and are
// remembered per column in localStorage; double-click a handle to reset the two columns beside it,
// or call window.resetLessonColumns() (the ⋯ menu) to reset them all. Desktop widths only — on
// narrow screens columns are already hidden and a drag would fight scrolling.
//
// A drag moves the boundary between two neighbouring columns: one grows exactly as much as the
// other shrinks, so the table never changes width. One column (`<col data-flex>`, the title) never
// gets an explicit width: it absorbs whatever its neighbours give or take, clamped to MIN_FLEX so
// it stays readable. Stored widths that no longer fit (a narrower window) are dropped on load.
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
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function setWidth(col, px) {
    col.style.width = Math.round(px) + "px";
  }
  // The defaults are inline widths on the <col>s: remember them so resets restore, not wipe.
  function restore(col) {
    col.style.width = col.dataset.defaultWidth || "";
  }

  var tables = document.querySelectorAll("table[data-resizable]");
  tables.forEach(function (table) {
    var cols = Array.prototype.slice.call(table.querySelectorAll("colgroup > col"));
    var ths = Array.prototype.slice.call(table.querySelectorAll("thead th"));
    if (cols.length !== ths.length) return;
    var widths = load();
    cols.forEach(function (col) {
      col.dataset.defaultWidth = col.style.width || "";
    });
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

    function nextVisible(i) {
      for (var j = i + 1; j < ths.length; j++) {
        if (ths[j].getBoundingClientRect().width > 0) return j;
      }
      return -1;
    }

    ths.forEach(function (th, i) {
      // The star column stays fixed, and the share column (last) is never a drag partner.
      if (i === 0 || i >= ths.length - 2) return;
      var handle = document.createElement("span");
      handle.className = "dc-resize-handle";
      handle.setAttribute("aria-hidden", "true");
      th.appendChild(handle);

      handle.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      handle.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var j = nextVisible(i);
        [cols[i], j >= 0 ? cols[j] : null].forEach(function (col) {
          if (!col || col.hasAttribute("data-flex")) return;
          restore(col);
          delete widths[col.dataset.col];
        });
        save(widths);
      });
      handle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        var j = nextVisible(i);
        if (j < 0) return;
        e.preventDefault();
        e.stopPropagation();
        var left = cols[i];
        var right = cols[j];
        var leftFlex = left.hasAttribute("data-flex");
        var rightFlex = right.hasAttribute("data-flex");
        var startX = e.clientX;
        var startL = th.getBoundingClientRect().width;
        var startR = ths[j].getBoundingClientRect().width;
        var total = startL + startR;
        handle.setPointerCapture(e.pointerId);
        table.classList.add("dc-resizing");
        function move(ev) {
          var dx = ev.clientX - startX;
          if (leftFlex) {
            setWidth(right, clamp(startR - dx, MIN, total - MIN_FLEX));
          } else if (rightFlex) {
            setWidth(left, clamp(startL + dx, MIN, total - MIN_FLEX));
          } else {
            var l = clamp(startL + dx, MIN, total - MIN);
            setWidth(left, l);
            setWidth(right, total - l);
          }
        }
        function up() {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          table.classList.remove("dc-resizing");
          if (!leftFlex) widths[left.dataset.col] = Math.round(th.getBoundingClientRect().width);
          if (!rightFlex) widths[right.dataset.col] = Math.round(ths[j].getBoundingClientRect().width);
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
    document.querySelectorAll("table[data-resizable] colgroup > col").forEach(restore);
  };
})();
