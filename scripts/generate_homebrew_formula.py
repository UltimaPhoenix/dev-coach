#!/usr/bin/env python3
"""Generate a minimal Homebrew formula for devcoach.

Fetches the devcoach sdist info from the PyPI JSON API and generates a formula
that creates a virtualenv and lets pip install devcoach (and all its dependencies)
directly from the downloaded sdist. No resource blocks needed — pip handles dep
resolution and downloads platform-appropriate pre-compiled wheels from PyPI.

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.22
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
  include Language::Python::Virtualenv

  desc "Progressive technical coaching MCP server for Claude Code and Claude Desktop"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "{pkg_url}"
  sha256 "{pkg_sha}"
  version "{version}"
  license "Apache-2.0"

  depends_on "python@3.12"

  def install
    venv = virtualenv_create(libexec, "python3.12")
    system venv.root/"bin/pip", "install", "--no-cache-dir", buildpath
    bin.install_symlink venv.root/"bin/devcoach"
  end

  test do
    system bin/"devcoach", "--help"
  end
end
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="devcoach release version, e.g. 0.3.22")
    args = parser.parse_args()

    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha), end="")


if __name__ == "__main__":
    main()
