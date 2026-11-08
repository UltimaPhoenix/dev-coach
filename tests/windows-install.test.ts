// The Windows channels' static pieces: the standalone zip and its launchers, the Scoop manifest
// generator and the installer script the docs site serves. install.ps1 itself runs end to end in
// CI's `windows` job (install.ps1 -Archive on windows-latest); here is what must hold byte for byte.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const text = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("standalone launchers (scripts/standalone)", () => {
  it("devcoach.cmd is CRLF + ASCII, prefers a private node.exe and falls back to the PATH", () => {
    const cmd = text("scripts", "standalone", "devcoach.cmd");
    expect(cmd.split("\n").every((line) => line === "" || line.endsWith("\r"))).toBe(true);
    expect([...cmd].every((ch) => ch.charCodeAt(0) < 0x80)).toBe(true); // cmd.exe reads the OEM code page
    expect(cmd).toContain('SET "_node=node"');
    expect(cmd).toContain("..\\node\\node.exe"); // install.ps1's layout: node\ beside app\
    expect(cmd).toContain('"%_node%" "%_dp0%dist\\bin.js" %*');
    expect(cmd).toContain("EXIT /B %ERRORLEVEL%");
  });

  it("the Git Bash twin is LF and mirrors it", () => {
    const sh = text("scripts", "standalone", "devcoach");
    expect(sh.startsWith("#!/bin/sh\n")).toBe(true);
    expect(sh).not.toContain("\r");
    expect(sh).toContain('exec "$node" "$dir/dist/bin.js" "$@"');
    expect(sh).toContain("$dir/../node/node.exe");
  });

  it("build-standalone.mjs packs the self-contained bundle, the launchers and a version to read", () => {
    const dist = mkdtempSync(join(tmpdir(), "dc-standalone-"));
    execFileSync(process.execPath, [join(root, "scripts", "build-standalone.mjs")], {
      env: { ...process.env, DEVCOACH_DIST_STANDALONE: dist },
      stdio: "pipe",
    });
    const zip = unzipSync(readFileSync(join(dist, `devcoach-${pkg.version}-standalone.zip`)));
    const names = Object.keys(zip);
    for (const must of [
      "dist/bin.js",
      "package.json",
      "assets/SKILL.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "devcoach.cmd",
      "devcoach",
    ])
      expect(names).toContain(must);
    expect(names.some((n) => n.includes("node_modules"))).toBe(false);
    const manifest = JSON.parse(Buffer.from(zip["package.json"] as Uint8Array).toString());
    expect(manifest.version).toBe(pkg.version); // install.ps1 reads it to verify the install
    expect(manifest.bin).toEqual({ devcoach: "dist/bin.js" });
    expect(Buffer.from(zip["devcoach.cmd"] as Uint8Array).toString()).toContain("\r\n");
  }, 60_000);
});

describe("Scoop manifest (scripts/scoop-manifest.mjs)", () => {
  const sha = "a".repeat(64);
  const generate = (...args: string[]) =>
    execFileSync(process.execPath, [join(root, "scripts", "scoop-manifest.mjs"), ...args], {
      encoding: "utf8",
      stdio: "pipe",
    });

  it("points at the release zip with its lower-case sha256 and leans on Scoop's nodejs-lts", () => {
    const m = JSON.parse(generate("2.8.0", sha.toUpperCase()));
    expect(m.version).toBe("2.8.0");
    expect(m.url).toBe(
      "https://github.com/UltimaPhoenix/dev-coach/releases/download/v2.8.0/devcoach-2.8.0-standalone.zip",
    );
    expect(m.hash).toBe(sha);
    expect(m.license).toBe(pkg.license);
    expect(m.depends).toBe("nodejs-lts");
    expect(m.bin).toBe("devcoach.cmd"); // Scoop shims .cmd/.ps1 launchers, never a .js
    expect(m.checkver).toEqual({ github: "https://github.com/UltimaPhoenix/dev-coach" });
    expect(m.autoupdate.url).toContain("/v$version/devcoach-$version-standalone.zip");
    expect(m.autoupdate.hash).toEqual({ url: "$baseurl/SHASUMS256.txt" });
    expect(m.notes.join("\n")).toContain("devcoach uninstall");
  });

  it("refuses a malformed version or hash", () => {
    expect(() => generate("latest", sha)).toThrow();
    expect(() => generate("2.8.0", "nope")).toThrow();
  });
});

describe("install.ps1 (website/static — served at /dev-coach/install.ps1)", () => {
  const ps1 = text("website", "static", "install.ps1");

  it("installs the standalone asset, verified, on a Node ≥ 24, and never touches ~/.devcoach", () => {
    expect(ps1).toContain("devcoach-*-standalone.zip");
    expect(ps1).toContain("SHASUMS256.txt");
    expect(ps1).toContain("$MinNodeMajor = 24");
    expect(ps1).toContain("Get-AuthenticodeSignature");
    expect(ps1).not.toMatch(/Remove-Item[^\n]*\.devcoach/);
    expect(ps1).toContain("install/windows"); // the docs page it prints at the end
  });

  it("documents every option twice: the parameter and its environment variable", () => {
    for (const [param, env] of [
      ["Version", "DEVCOACH_VERSION"],
      ["Channel", "DEVCOACH_CHANNEL"],
      ["InstallDir", "DEVCOACH_INSTALL_DIR"],
      ["NodeVersion", "DEVCOACH_NODE_VERSION"],
      ["UseSystemNode", "DEVCOACH_USE_SYSTEM_NODE"],
      ["NoModifyPath", "DEVCOACH_NO_MODIFY_PATH"],
      ["SkipConnect", "DEVCOACH_SKIP_CONNECT"],
    ]) {
      expect(ps1).toMatch(new RegExp(`\\[(string|switch)\\]\\$${param}\\b`));
      expect(ps1).toContain(`$env:${env}`);
    }
  });
});
