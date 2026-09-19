// Drag-to-resize table columns (the lessons table). Widths live on the <col> elements and are
// remembered per column in localStorage; double-click a handle to reset one column, or call
// window.resetLessonColumns() (the ⋯ menu) to reset them all. Desktop widths only — on narrow
// screens columns are already hidden and a drag would fight scrolling.
(function () {
  var MIN = 48;
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

    cols.forEach(function (col) {
      var px = widths[col.dataset.col];
      if (typeof px === "number" && px >= MIN) col.style.width = px + "px";
    });

    ths.forEach(function (th, i) {
      if (i === 0 || i === ths.length - 1) return; // the star and share columns stay fixed
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
        col.style.width = "";
        delete widths[col.dataset.col];
        save(widths);
      });
      handle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var startX = e.clientX;
        var startW = th.getBoundingClientRect().width;
        handle.setPointerCapture(e.pointerId);
        table.classList.add("dc-resizing");
        function move(ev) {
          var w = Math.max(MIN, Math.round(startW + ev.clientX - startX));
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
      col.style.width = "";
    });
  };
})();
