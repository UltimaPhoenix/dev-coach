// Injected by the dashboard at the end of every course document it serves (never part of the
// file on disk). Inside the sandboxed frame the parent cannot measure the document, so the
// document reports its own height and the step it is showing; the parent grows the frame to fit
// (the page scrolls, never the frame) and moves its step highlight. Standalone opens (a pasted
// URL, the artifact copy) never run this: `parent === window` exits at once.
(function () {
  if (window.parent === window) return;
  var root = document.documentElement;
  root.setAttribute("data-embedded", "1");
  // Embedded, the page canvas is the dashboard's: let it show through (sections keep their own
  // panel colours), so the frame reads as part of the page instead of a box inside it.
  root.style.background = "transparent";
  // …and use the width the dashboard gives it: the reading-column caps of the contract's
  // `.course` / `section` / `header.intro` are for the standalone page.
  var style = document.createElement("style");
  style.textContent =
    ":root[data-embedded] .course{max-width:none;padding:4px 0 32px}" +
    ":root[data-embedded] section,:root[data-embedded] header.intro{max-width:none}";
  (document.head || root).appendChild(style);
  function clearBody() { document.body.style.background = "transparent"; }
  if (document.body) clearBody(); else document.addEventListener("DOMContentLoaded", clearBody);
  function report() {
    var id = location.hash.replace(/^#/, "");
    var target = id ? document.getElementById(id) : null;
    window.parent.postMessage(
      { type: "devcoach:course", height: root.scrollHeight, anchor: target ? id : null },
      "*",
    );
  }
  window.addEventListener("load", report);
  window.addEventListener("hashchange", report);
  if (typeof ResizeObserver === "function") new ResizeObserver(report).observe(root);
  else setInterval(report, 500);
  report();
})();
