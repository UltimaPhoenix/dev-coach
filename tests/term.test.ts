import { describe, expect, it } from "vitest";
import { link, stripAnsi, supportsHyperlinks } from "../src/cli/term";

describe("terminal hyperlinks (OSC 8)", () => {
  it("detects terminals that render OSC 8, and nothing else", () => {
    const tty = (env: NodeJS.ProcessEnv) => supportsHyperlinks(env, true);
    expect(supportsHyperlinks({ TERM_PROGRAM: "iTerm.app" }, false)).toBe(false); // piped
    expect(tty({ TERM_PROGRAM: "iTerm.app" })).toBe(true);
    expect(tty({ TERM_PROGRAM: "vscode" })).toBe(true);
    expect(tty({ TERM_PROGRAM: "ghostty" })).toBe(true);
    expect(tty({ TERM_PROGRAM: "Apple_Terminal" })).toBe(false);
    expect(tty({ TERM: "xterm-kitty" })).toBe(true);
    expect(tty({ WT_SESSION: "x" })).toBe(true);
    expect(tty({ VTE_VERSION: "5000" })).toBe(true);
    expect(tty({ VTE_VERSION: "4999" })).toBe(false);
    expect(tty({ TERM_PROGRAM: "iTerm.app", NO_COLOR: "1" })).toBe(false);
    expect(tty({ TERM: "dumb" })).toBe(false);
    expect(tty({})).toBe(false);
    expect(supportsHyperlinks({ FORCE_HYPERLINK: "1" }, false)).toBe(true);
    expect(supportsHyperlinks({ FORCE_HYPERLINK: "0", TERM_PROGRAM: "iTerm.app" }, false)).toBe(
      false,
    );
  });

  it("link() wraps in OSC 8 only when supported; stripAnsi removes the wrapper", () => {
    const url = "http://localhost:7860";
    const prev = process.env.FORCE_HYPERLINK;
    process.env.FORCE_HYPERLINK = "1";
    try {
      const wrapped = link(url);
      expect(wrapped).toBe(`\u001b]8;;${url}\u0007${url}\u001b]8;;\u0007`);
      expect(stripAnsi(wrapped)).toBe(url);
      expect(stripAnsi(link(url, "dashboard"))).toBe("dashboard");
    } finally {
      if (prev === undefined) delete process.env.FORCE_HYPERLINK;
      else process.env.FORCE_HYPERLINK = prev;
    }
    delete process.env.FORCE_HYPERLINK;
    process.env.NO_COLOR = "1";
    try {
      expect(link(url)).toBe(url);
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});
