// Course page: the sandboxed frame reports its height and current step (course-frame.js, injected
// by the server); this side sizes the frame to the document so the page scrolls, keeps the step
// list in sync, and turns step clicks into in-frame navigation (a fragment navigation of the
// cross-origin frame) instead of a page reload.
(function () {
  var frame = document.getElementById("course-frame");
  var list = document.getElementById("course-steps");
  if (!frame || !list) return;
  var CURRENT = ["bg-indigo-50", "dark:bg-indigo-900/30"];
  var shown = null;

  function select(anchor) {
    if (!anchor || anchor === shown) return;
    shown = anchor;
    list.querySelectorAll("li[data-anchor]").forEach(function (li) {
      var on = li.dataset.anchor === anchor;
      CURRENT.forEach(function (cls) {
        li.classList.toggle(cls, on);
      });
      var actions = li.querySelector("[data-step-actions]");
      if (actions) actions.classList.toggle("hidden", !on);
    });
  }

  function scrollToFrame() {
    var top = frame.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (event.source !== frame.contentWindow || !data || data.type !== "devcoach:course") return;
    var height = Number(data.height);
    if (Number.isFinite(height)) {
      frame.style.height = Math.min(50000, Math.max(320, Math.ceil(height))) + "px";
    }
    if (typeof data.anchor === "string") select(data.anchor);
  });

  list.addEventListener("click", function (event) {
    var link = event.target.closest("a[data-anchor]");
    if (!link) return;
    event.preventDefault();
    var anchor = link.dataset.anchor;
    try {
      // Only `href` is settable on a cross-origin Location; same URL + new fragment is a
      // fragment navigation inside the frame (hashchange, no reload).
      frame.contentWindow.location.href = frame.src.split("#")[0] + "#" + anchor;
    } catch {
      window.location.href = link.href;
      return;
    }
    select(anchor);
    scrollToFrame();
  });
})();
