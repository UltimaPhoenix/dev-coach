#!/usr/bin/env python3
"""Generate a Homebrew formula for devcoach.

Creates a virtualenv, then installs devcoach (and all its deps) in one pip
call directly from the sdist. This avoids build-backend availability issues
that arise from two-pass installs.

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.30
"""
import argparse
import json
import re
import urllib.request


# ── pyproject.toml ────────────────────────────────────────────────────────────

def max_python_version(pyproject_path: str) -> str:
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


# ── PyPI ──────────────────────────────────────────────────────────────────────

def fetch_pypi_sdist(package: str, version: str) -> tuple[str, str]:
    url = f"https://pypi.org/pypi/{package}/{version}/json"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    for f in data["urls"]:
        if f["packagetype"] == "sdist":
            return f["url"], f["digests"]["sha256"]
    raise RuntimeError(f"No sdist found for {package}=={version} on PyPI")


# ── formula ───────────────────────────────────────────────────────────────────

def render(version: str, pkg_url: str, pkg_sha: str, python_version: str) -> str:
    return f"""\
class Devcoach < Formula
  include Language::Python::Virtualenv

  desc "Progressive technical coaching MCP server for Claude Code and Claude Desktop"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "{pkg_url}"
  sha256 "{pkg_sha}"
  version "{version}"
  license "Apache-2.0"

  depends_on "python@{python_version}"

  def install
    venv = virtualenv_create(libexec, Formula["python@{python_version}"].opt_bin/"python3")
    system venv.root/"bin/pip", "install",
           "--no-cache-dir", "--prefer-binary",
           buildpath
    bin.install_symlink venv.root/"bin/devcoach"
  end

  test do
    system bin/"devcoach", "--help"
  end
end
"""


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--pyproject", default="pyproject.toml")
    args = parser.parse_args()

    python_version = max_python_version(args.pyproject)
    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha, python_version), end="")


if __name__ == "__main__":
    main()
