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
  desc "Progressive technical coaching MCP server for Claude Code and Claude Desktop"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "{pkg_url}"
  sha256 "{pkg_sha}"
  version "{version}"
  license "Apache-2.0"

  depends_on "python@{python_version}"
  depends_on "uv"

  def install
    uv = Formula["uv"].opt_bin/"uv"
    python = Formula["python@{python_version}"].opt_bin/"python{python_version}"
    # uv venv is a Rust implementation — never calls python -m venv.
    # uv pip install is also Rust — no pip subprocess, no build-isolation venv.
    # Both avoid the silent python -m venv failure in Homebrew's formula
    # build environment on GitHub Actions runners.
    system uv, "venv", "--python", python, "--python-preference", "only-system", libexec
    system uv, "pip", "install",
           "--python", libexec,
           "--no-cache",
           "--python-preference", "only-system",
           buildpath
    bin.install_symlink libexec/"bin/devcoach"
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
