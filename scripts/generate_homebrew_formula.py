#!/usr/bin/env python3
"""Generate a Homebrew Language::Python::Virtualenv formula from uv.lock.

Reads uv.lock to extract production dependency sdist URLs and hashes, fetches
the devcoach sdist info from the PyPI JSON API, and prints a complete devcoach.rb
to stdout.

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.21
"""
import argparse
import json
import re
import sys
import urllib.request

EXCLUDE = {"pywin32"}  # Windows-only, no sdist; pip skips via env markers
DIRECT_PROD_DEPS = ["fastapi", "fastmcp", "jinja2", "pydantic", "rich", "uvicorn"]


def parse_uv_lock(path: str) -> dict[str, dict]:
    content = open(path).read()
    chunks = re.split(r"^\[\[package\]\]\n", content, flags=re.MULTILINE)
    pkg_data: dict[str, dict] = {}
    for chunk in chunks[1:]:
        name_m = re.search(r'^name = "(.+?)"', chunk, re.MULTILINE)
        if not name_m:
            continue
        name = name_m.group(1)
        sdist_m = re.search(
            r'^sdist = \{ url = "(.+?)".*hash = "sha256:(.+?)"',
            chunk,
            re.MULTILINE,
        )
        deps = [d for d in re.findall(r'\{ name = "(.+?)"', chunk) if d != name]
        pkg_data[name] = {
            "sdist_url": sdist_m.group(1) if sdist_m else None,
            "sdist_hash": sdist_m.group(2) if sdist_m else None,
            "deps": list(set(deps)),
        }
    return pkg_data


def transitive_closure(pkg_data: dict) -> set[str]:
    visited: set[str] = set()
    queue = list(DIRECT_PROD_DEPS)
    while queue:
        dep = queue.pop(0)
        if dep in visited or dep == "devcoach":
            continue
        visited.add(dep)
        queue.extend(pkg_data.get(dep, {}).get("deps", []))
    return visited


def fetch_pypi_sdist(package: str, version: str) -> tuple[str, str]:
    url = f"https://pypi.org/pypi/{package}/{version}/json"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    for f in data["urls"]:
        if f["packagetype"] == "sdist":
            return f["url"], f["digests"]["sha256"]
    raise RuntimeError(f"No sdist found for {package}=={version} on PyPI")


def render(version: str, pkg_url: str, pkg_sha: str, resources: list[tuple]) -> str:
    lines = [
        "class Devcoach < Formula",
        "  include Language::Python::Virtualenv",
        "",
        '  desc "Progressive technical coaching MCP server for Claude Code and Claude Desktop"',
        '  homepage "https://github.com/UltimaPhoenix/dev-coach"',
        f'  url "{pkg_url}"',
        f'  sha256 "{pkg_sha}"',
        f'  version "{version}"',
        '  license "Apache-2.0"',
        "",
        '  depends_on "python@3.12"',
        "",
    ]
    for name, url, sha in resources:
        lines += [f'  resource "{name}" do', f'    url "{url}"', f'    sha256 "{sha}"', "  end", ""]
    lines += [
        "  def install",
        "    virtualenv_install_with_resources",
        "  end",
        "",
        "  test do",
        '    system bin/"devcoach", "--help"',
        "  end",
        "end",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="devcoach release version, e.g. 0.3.21")
    parser.add_argument("--uv-lock", default="uv.lock", help="path to uv.lock (default: uv.lock)")
    args = parser.parse_args()

    pkg_data = parse_uv_lock(args.uv_lock)
    prod_deps = transitive_closure(pkg_data)

    resources: list[tuple] = []
    for name in sorted(prod_deps):
        if name in EXCLUDE:
            continue
        d = pkg_data.get(name, {})
        if not d.get("sdist_url"):
            print(f"WARNING: no sdist for {name}, skipping", file=sys.stderr)
            continue
        resources.append((name, d["sdist_url"], d["sdist_hash"]))

    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha, resources), end="")


if __name__ == "__main__":
    main()
