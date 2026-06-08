#!/usr/bin/env python3
"""Generate a Homebrew formula for devcoach that delegates to uv.

Reads the maximum supported Python version from pyproject.toml classifiers,
fetches the devcoach sdist info from the PyPI JSON API, and generates a formula
that uses `uv tool install` to install devcoach and all its dependencies.

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.27
"""
import argparse
import json
import re
import urllib.request


def max_python_version(pyproject_path: str) -> str:
    """Return the highest Python version listed in pyproject.toml classifiers."""
    content = open(pyproject_path).read()
    versions = [
        (int(ma), int(mi))
        for ma, mi in re.findall(
            r"Programming Language :: Python :: (\d+)\.(\d+)", content
        )
    ]
    if not versions:
        raise RuntimeError("No Python version classifiers found in pyproject.toml")
    major, minor = max(versions)
    return f"{major}.{minor}"


def fetch_pypi_sdist(package: str, version: str) -> tuple[str, str]:
    url = f"https://pypi.org/pypi/{package}/{version}/json"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    for f in data["urls"]:
        if f["packagetype"] == "sdist":
            return f["url"], f["digests"]["sha256"]
    raise RuntimeError(f"No sdist found for {package}=={version} on PyPI")


def render(version: str, pkg_url: str, pkg_sha: str, python_version: str) -> str:
    return f"""\
class Devcoach < Formula
  desc "Progressive technical coaching MCP server for Claude Code and Claude Desktop"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "{pkg_url}"
  sha256 "{pkg_sha}"
  version "{version}"
  license "Apache-2.0"

  depends_on "python@{python_version}"
  depends_on "uv"

  def install
    ENV["UV_TOOL_DIR"] = libexec
    system Formula["uv"].opt_bin/"uv", "tool", "install",
           "--python", Formula["python@{python_version}"].opt_bin/"python{python_version}",
           "devcoach==#{{version}}"

    # uv writes '#!/.../bin/python' in the entry point shebang, but Homebrew's
    # Python venv only creates python3/python{python_version} — not the bare 'python' symlink.
    # Write our own wrapper that calls python{python_version} explicitly, bypassing the shebang.
    (bin/"devcoach").write <<~SH
      #!/bin/sh
      exec "#{{libexec}}/devcoach/bin/python{python_version}" "#{{libexec}}/devcoach/bin/devcoach" "$@"
    SH
  end

  test do
    system bin/"devcoach", "--help"
  end
end
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="devcoach release version, e.g. 0.3.27")
    parser.add_argument("--pyproject", default="pyproject.toml", help="path to pyproject.toml")
    args = parser.parse_args()

    python_version = max_python_version(args.pyproject)
    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha, python_version), end="")


if __name__ == "__main__":
    main()
