# Third-party notices

devcoach is licensed under AGPL-3.0-only (see `LICENSE`). It redistributes the libraries below,
vendored as files under `assets/static/vendor/`. Each keeps its own licence; all of them are
compatible with distribution under the AGPL.

| Library | Version | Licence | Where it is used | Notice |
|---|---|---|---|---|
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.10.0 | BSD-3-Clause | code blocks in lesson pages; **inlined into course documents** | header of `highlight.min.js`, full text in `highlight.LICENSE.txt` |
| [marked](https://github.com/markedjs/marked) | 4.3.0 | MIT | lesson markdown in the dashboard | header of `marked.min.js` |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.13 | Apache-2.0 OR MPL-2.0 | sanitising rendered markdown | header of `purify.min.js` |
| [flatpickr](https://github.com/flatpickr/flatpickr) | 4.6.13 | MIT | the date range picker | header of `flatpickr.min.js` |
| [Alpine.js](https://github.com/alpinejs/alpine) | 3.14.1 | MIT | dashboard interactions | upstream repository (the minified file carries no header) |
| [htmx](https://github.com/bigskysoftware/htmx) | 1.9.12 | BSD-2-Clause | partial page updates | upstream repository (the minified file carries no header) |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) (Play CDN build) | 3.4.17 | MIT | dashboard styling | upstream repository (the file carries no header) |

## Course documents and artifacts

A course document that shows code carries highlight.js **inside the file**: devcoach fills the
document's `<script data-devcoach="highlighter">` placeholder with the vendored build. The
BSD-3-Clause terms ask that the copyright notice, the conditions and the disclaimer travel with
every redistribution in binary form, so the inlined block starts with the full licence text.
Keep that comment when you copy, publish or share a course document — publishing it as a Claude
artifact redistributes the library too.

The course document itself (the text, examples and scripts written for you) is yours.
