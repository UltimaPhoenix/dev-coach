#!/usr/bin/env python3
"""Generate a Homebrew formula for devcoach.

Dependency versions are pinned from uv.lock and embedded as a requirements.txt
in the formula's install block. pip downloads the appropriate pre-built wheel
for the target platform at install time — no per-package resource blocks needed.

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.30
"""
import argparse
import json
import re
import urllib.request


EXCLUDE = {"pywin32"}
DIRECT_PROD_DEPS = ["fastapi", "fastmcp", "jinja2", "pydantic", "rich", "uvicorn"]


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


# ── uv.lock ───────────────────────────────────────────────────────────────────

def parse_uv_lock(path: str) -> dict[str, dict]:
    content = open(path).read()
    chunks = re.split(r"^\[\[package\]\]\n", content, flags=re.MULTILINE)
    pkg_data: dict[str, dict] = {}
    for chunk in chunks[1:]:
        name_m = re.search(r'^name = "(.+?)"', chunk, re.MULTILINE)
        version_m = re.search(r'^version = "(.+?)"', chunk, re.MULTILINE)
        if not name_m:
            continue
        name = name_m.group(1)
        deps = [d for d in re.findall(r'\{ name = "(.+?)"', chunk) if d != name]
        pkg_data[name] = {
            "version": version_m.group(1) if version_m else None,
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

def render(
    version: str,
    pkg_url: str,
    pkg_sha: str,
    python_version: str,
    requirements: list[str],
) -> str:
    reqs = "\n".join(f"      {r}" for r in requirements)
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
    venv = virtualenv_create(libexec, "python{python_version}")
    (buildpath/"requirements.txt").write <<~REQ
{reqs}
    REQ
    system venv.root/"bin/pip", "install",
           "--no-cache-dir", "--prefer-binary",
           "-r", buildpath/"requirements.txt"
    system venv.root/"bin/pip", "install",
           "--no-cache-dir", "--no-deps",
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
    parser.add_argument("--uv-lock", default="uv.lock")
    args = parser.parse_args()

    python_version = max_python_version(args.pyproject)
    pkg_data = parse_uv_lock(args.uv_lock)
    prod_deps = transitive_closure(pkg_data)

    requirements = [
        f"{name}=={pkg_data[name]['version']}"
        for name in sorted(prod_deps)
        if name not in EXCLUDE and pkg_data.get(name, {}).get("version")
    ]

    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha, python_version, requirements), end="")


if __name__ == "__main__":
    main()
