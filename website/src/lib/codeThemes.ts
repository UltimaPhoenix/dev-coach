// The code blocks' colours. prism-react-renderer's `github` (light) and `dracula` (dark) themes,
// with every colour that read under WCAG AA (4.5:1) on its own background moved, along its hue,
// until it does: in light the numbers / properties (#36acaa, 2.6:1), keywords (#00a4db, 2.7:1),
// comments (#999988, 2.7:1), strings (#e3116c, 4.3:1) and tags / functions (#d73a49, 4.3:1); in
// dark the comments (#6272a4, 3.0:1). src/css/tokens.test.ts holds every colour here at 4.5:1.
import type { PrismTheme } from "prism-react-renderer";

export const lightCodeTheme: PrismTheme = {
  plain: { color: "#393A34", backgroundColor: "#f6f8fa" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#6e6e61", fontStyle: "italic" } },
    { types: ["namespace"], style: { opacity: 0.7 } },
    { types: ["string", "attr-value"], style: { color: "#d01064" } },
    { types: ["punctuation", "operator"], style: { color: "#393A34" } },
    {
      types: ["entity", "url", "symbol", "number", "boolean", "variable", "constant", "property", "regex", "inserted"],
      style: { color: "#237473" },
    },
    { types: ["atrule", "keyword", "attr-name", "selector"], style: { color: "#00739a" } },
    { types: ["function", "deleted", "tag"], style: { color: "#c53543" } },
    { types: ["function-variable"], style: { color: "#6f42c1" } },
    { types: ["tag", "selector", "keyword"], style: { color: "#00009f" } },
  ],
};

export const darkCodeTheme: PrismTheme = {
  plain: { color: "#F8F8F2", backgroundColor: "#282A36" },
  styles: [
    { types: ["prolog", "constant", "builtin"], style: { color: "rgb(189, 147, 249)" } },
    { types: ["inserted", "function"], style: { color: "rgb(80, 250, 123)" } },
    { types: ["deleted"], style: { color: "rgb(255, 85, 85)" } },
    { types: ["changed"], style: { color: "rgb(255, 184, 108)" } },
    { types: ["punctuation", "symbol"], style: { color: "rgb(248, 248, 242)" } },
    { types: ["string", "char", "tag", "selector"], style: { color: "rgb(255, 121, 198)" } },
    { types: ["keyword", "variable"], style: { color: "rgb(189, 147, 249)", fontStyle: "italic" } },
    { types: ["comment"], style: { color: "rgb(140, 152, 190)" } },
    { types: ["attr-name"], style: { color: "rgb(241, 250, 140)" } },
  ],
};
