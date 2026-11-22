// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cells, parseAnsi, plainText } from "./ansi.ts";

const E = "\u001b";

test("plain text: one unstyled run per line, empty lines kept", () => {
  assert.deepEqual(parseAnsi("hello\n\nworld"), [
    [{ text: "hello", style: {} }],
    [],
    [{ text: "world", style: {} }],
  ]);
  assert.deepEqual(parseAnsi(""), [[]]);
  assert.deepEqual(parseAnsi("a\r\nb"), [[{ text: "a", style: {} }], [{ text: "b", style: {} }]]);
});

test("colours and attributes, standard and bright", () => {
  assert.deepEqual(parseAnsi(`${E}[32m✓${E}[39m ok ${E}[91;1mbad${E}[0m`), [
    [
      { text: "✓", style: { fg: "green" } },
      { text: " ok ", style: {} },
      { text: "bad", style: { fg: "brightRed", bold: true } },
    ],
  ]);
  assert.deepEqual(parseAnsi(`${E}[2mdim${E}[22m ${E}[4mline${E}[24m`)[0], [
    { text: "dim", style: { dim: true } },
    { text: " ", style: {} },
    { text: "line", style: { underline: true } },
  ]);
});

test("nested styles: an inner change keeps the outer ones until their own reset", () => {
  const [line] = parseAnsi(`${E}[1mBold ${E}[36mcyan ${E}[2mdim${E}[22m back${E}[39m plain`);
  assert.deepEqual(line, [
    { text: "Bold ", style: { bold: true } },
    { text: "cyan ", style: { bold: true, fg: "cyan" } },
    { text: "dim", style: { bold: true, fg: "cyan", dim: true } },
    // 22 ends bold and dim together, as in a terminal
    { text: " back", style: { fg: "cyan" } },
    { text: " plain", style: {} },
  ]);
});

test("reset: ESC[0m and the bare ESC[m clear everything; a style carries across lines", () => {
  const lines = parseAnsi(`${E}[1;4;35mA\nB${E}[mC${E}[33mD${E}[0mE`);
  assert.deepEqual(lines, [
    [{ text: "A", style: { bold: true, underline: true, fg: "magenta" } }],
    [
      { text: "B", style: { bold: true, underline: true, fg: "magenta" } },
      { text: "C", style: {} },
      { text: "D", style: { fg: "yellow" } },
      { text: "E", style: {} },
    ],
  ]);
});

test("unknown and unsupported codes are stripped and change nothing", () => {
  // 256-colour and true-colour codes: their 5 and 2 are not blink and dim
  assert.deepEqual(parseAnsi(`${E}[38;5;208mA${E}[48;2;10;20;30mB${E}[38:2::1:2:3mC`)[0], [
    { text: "ABC", style: {} },
  ]);
  // background, italic, blink, inverse: ignored
  assert.deepEqual(parseAnsi(`${E}[41;3;5;7mX`)[0], [{ text: "X", style: {} }]);
  // cursor moves, erase, private modes, charset, save/restore, a window title
  const noisy = `${E}[2K${E}[1A${E}[?25l${E}(B${E}7${E}]0;title${E}\\${E}[10;5HY${E}[?25h`;
  assert.deepEqual(parseAnsi(noisy), [[{ text: "Y", style: {} }]]);
  // control characters (BEL, backspace, a lone CR, DEL) never reach the page; tab stays
  assert.equal(plainText(parseAnsi("a\u0007b\u0008c\rd\u007fe\tf")), "abcde\tf");
  // an unterminated sequence is dropped to the end, not printed
  assert.equal(plainText(parseAnsi(`ok${E}]8;;https://x`)), "ok");
  assert.equal(plainText(parseAnsi(`ok${E}[31`)), "ok");
});

test("OSC 8 hyperlinks become their text, with either terminator", () => {
  const bel = `see ${E}]8;;https://example.com\u0007the docs${E}]8;;\u0007.`;
  const st = `see ${E}]8;id=1;https://example.com${E}\\the docs${E}]8;;${E}\\.`;
  for (const input of [bel, st]) assert.deepEqual(parseAnsi(input), [[{ text: "see the docs.", style: {} }]]);
  const styled = parseAnsi(`${E}[36m${E}]8;;https://x\u0007link${E}]8;;\u0007${E}[39m`);
  assert.deepEqual(styled, [[{ text: "link", style: { fg: "cyan" } }]]);
});

test("cells: what monospace fonts carry stays text, the rest gets its terminal width", () => {
  assert.deepEqual(cells("plain ascii"), ["plain ascii"]);
  assert.deepEqual(cells("│ café ─█░ │"), ["│ café ─█░ │"]);
  assert.deepEqual(cells("ok ✓ x"), ["ok ", { text: "✓", width: 1 }, " x"]);
  assert.deepEqual(cells("💡 tip"), [{ text: "💡", width: 2 }, " tip"]);
  assert.deepEqual(cells("日本"), [
    { text: "日", width: 2 },
    { text: "本", width: 2 },
  ]);
  // a ZWJ sequence is one grapheme, two columns
  assert.deepEqual(cells("👩‍💻"), [{ text: "👩‍💻", width: 2 }]);
  assert.deepEqual(cells(""), []);
});

test("the committed captures parse to text with no escape left", () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "cli-output.json");
  const captures = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  assert.ok(Object.keys(captures).length > 10);
  for (const [name, output] of Object.entries(captures)) {
    const text = plainText(parseAnsi(output));
    assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(text), `${name}: a control character is left`);
    assert.ok(text.trim().length > 0, `${name}: empty`);
    assert.ok(!/\/(tmp|home|Users|private|var\/folders)\//.test(text), `${name}: a home or sandbox path`);
  }
});
