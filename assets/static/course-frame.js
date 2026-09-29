// Injected by the dashboard at the end of every course document it serves (never part of the
// file on disk). Inside the sandboxed frame the parent cannot measure the document, so the
// document reports its own height and the step it is showing; the parent grows the frame to fit
// (the page scrolls, never the frame) and moves its step highlight. The dashboard in turn tells
// the document which theme it is in: framed, the document only sees the OS preference, not the
// dashboard's toggle. Standalone opens (a pasted URL, the artifact copy) never run this:
// `parent === window` exits at once, and the document's own theme switch is in charge.
(function () {
  if (window.parent === window) return;
  var root = document.documentElement;
  root.setAttribute("data-embedded", "1");
  // Embedded, the page canvas is the dashboard's: let it show through (sections keep their own
  // panel colours), so the frame reads as part of the page instead of a box inside it.
  root.style.background = "transparent";
  // …use the width the dashboard gives it (the reading-column caps of the contract's `.course` /
  // `section` / `header.intro` are for the standalone page), and take the NEUTRALS from the
  // dashboard palette so panels and text sit on its canvas without a seam. Accent and semantic
  // tokens stay the document's own: a course conforms to the palette, it does not copy it.
  var style = document.createElement("style");
  style.textContent =
    ":root[data-embedded] .course{max-width:none;padding:4px 0 32px}" +
    ":root[data-embedded] section,:root[data-embedded] header.intro{max-width:none}" +
    ":root[data-embedded] .theme-switch{display:none}" +
    ':root[data-embedded][data-theme="light"]{--bg:#f9fafb;--panel:#ffffff;--text:#111827;' +
    "--muted:#6b7280;--line:#e5e7eb;--code-bg:#f3f4f6}" +
    ':root[data-embedded][data-theme="dark"]{--bg:#1e1f22;--panel:#2b2d30;--text:#dfe1e5;' +
    "--muted:#9da0a8;--line:#43454a;--code-bg:#1e1f22}";
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
  // The dashboard answers every report with its theme (the first report is the handshake).
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data || data.type !== "devcoach:theme") return;
    if (data.theme !== "dark" && data.theme !== "light") return;
    if (root.getAttribute("data-theme") === data.theme) return;
    root.setAttribute("data-theme", data.theme);
    report();
  });
  window.addEventListener("load", report);
  window.addEventListener("hashchange", report);
  if (typeof ResizeObserver === "function") new ResizeObserver(report).observe(root);
  else setInterval(report, 500);
  report();
})();
