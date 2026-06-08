#!/usr/bin/env python3
"""Generate a Homebrew formula for devcoach that delegates to uv.

Fetches the devcoach sdist info from the PyPI JSON API and generates a formula
that uses `uv tool install` to install devcoach and all its dependencies.
No resource blocks — uv resolves and downloads deps from PyPI at install time,
picking pre-compiled wheels for the target platform automatically.

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.25
"""
import argparse
import json
import urllib.request


def fetch_pypi_sdist(package: str, version: str) -> tuple[str, str]:
    url = f"https://pypi.org/pypi/{package}/{version}/json"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    for f in data["urls"]:
        if f["packagetype"] == "sdist":
            return f["url"], f["digests"]["sha256"]
    raise RuntimeError(f"No sdist found for {package}=={version} on PyPI")


def render(version: str, pkg_url: str, pkg_sha: str) -> str:
    return f"""\
class Devcoach < Formula
  desc "Progressive technical coaching MCP server for Claude Code and Claude Desktop"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "{pkg_url}"
  sha256 "{pkg_sha}"
  version "{version}"
  license "Apache-2.0"

  depends_on "python@3.12"
  depends_on "uv"

  def install
    ENV["UV_TOOL_DIR"] = libexec
    system Formula["uv"].opt_bin/"uv", "tool", "install",
           "--python", Formula["python@3.12"].opt_bin/"python3.12",
           "devcoach==#{{version}}"

    # uv writes '#!/.../bin/python' in the entry point shebang, but Homebrew's
    # Python venv only creates python3/python3.12 — not the bare 'python' symlink.
    # Write our own wrapper that calls python3.12 explicitly, bypassing the shebang.
    (bin/"devcoach").write <<~SH
      #!/bin/sh
      exec "#{{libexec}}/devcoach/bin/python3.12" "#{{libexec}}/devcoach/bin/devcoach" "$@"
    SH
  end

  test do
    system bin/"devcoach", "--help"
  end
end
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="devcoach release version, e.g. 0.3.25")
    args = parser.parse_args()

    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha), end="")


if __name__ == "__main__":
    main()
