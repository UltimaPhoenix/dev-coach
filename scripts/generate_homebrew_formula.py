#!/usr/bin/env python3
"""Generate a Homebrew Language::Python::Virtualenv formula from uv.lock.

All dependency versions and wheel URLs are sourced from uv.lock — fully
reproducible, no live PyPI queries for dependencies. Pre-built wheels are
preferred in this order to avoid any compilation at install time:
  1. py3-none-any  (pure Python, platform-independent)
  2. macosx universal2  (compiled, one wheel for arm64 + x86_64)
  3. macosx arm64 + x86_64 pair  (compiled, via on_arm / on_intel blocks)
  4. sdist fallback  (adds rust => :build if needed)

Usage:
    python scripts/generate_homebrew_formula.py --version 0.3.28
"""
import argparse
import json
import re
import sys
import urllib.request


EXCLUDE = {"pywin32"}  # Windows-only; env markers skip it on macOS
DIRECT_PROD_DEPS = ["fastapi", "fastmcp", "jinja2", "pydantic", "rich", "uvicorn"]
RUST_PACKAGES = {"pydantic-core", "watchfiles", "rpds-py", "cryptography"}


# ── pyproject.toml helpers ────────────────────────────────────────────────────

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


# ── uv.lock helpers ───────────────────────────────────────────────────────────

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
            chunk, re.MULTILINE,
        )
        sdist_url = sdist_m.group(1) if sdist_m else None
        all_entries = [
            {"url": u, "hash": h}
            for u, h in re.findall(r'\{ url = "([^"]+)"[^}]*hash = "sha256:([^"]+)"', chunk)
        ]
        wheels = [e for e in all_entries if e["url"] != sdist_url]
        deps = [d for d in re.findall(r'\{ name = "(.+?)"', chunk) if d != name]
        pkg_data[name] = {
            "sdist_url": sdist_url,
            "sdist_hash": sdist_m.group(2) if sdist_m else None,
            "wheels": wheels,
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


# ── wheel selection ───────────────────────────────────────────────────────────

def is_compat_wheel(filename: str, py_ver: int) -> bool:
    if re.search(r"py3-none-any", filename):
        return True
    py_m = re.search(r"py(\d+)-none-any", filename)
    if py_m and int(py_m.group(1)) <= py_ver:
        return True
    abi3_m = re.search(r"cp(\d+)-abi3", filename)
    if abi3_m and int(abi3_m.group(1)) <= py_ver:
        return True
    if f"cp{py_ver}-cp{py_ver}" in filename:
        return True
    return False


def pick_resource(pkg_data: dict, py_ver: int) -> tuple | None:
    """
    Returns one of:
      ("single",   url, sha256)                              — py3-none-any or universal2
      ("platform", arm_url, arm_sha, intel_url, intel_sha)  — arm64 + x86_64
      ("sdist",    url, sha256)                              — source fallback
      None  — nothing usable
    """
    wheels = pkg_data.get("wheels", [])

    # 1. py3-none-any
    for w in wheels:
        fn = w["url"].split("/")[-1]
        if "none-any" in fn and is_compat_wheel(fn, py_ver):
            return ("single", w["url"], w["hash"])

    # 2. universal2 macOS
    for w in wheels:
        fn = w["url"].split("/")[-1]
        if "macosx" in fn and "universal2" in fn and is_compat_wheel(fn, py_ver):
            return ("single", w["url"], w["hash"])

    # 3. arm64 + x86_64 pair
    arm = intel = None
    for w in wheels:
        fn = w["url"].split("/")[-1]
        if not is_compat_wheel(fn, py_ver) or "macosx" not in fn:
            continue
        if "arm64" in fn and arm is None:
            arm = (w["url"], w["hash"])
        elif "x86_64" in fn and intel is None:
            intel = (w["url"], w["hash"])
    if arm and intel:
        return ("platform", arm[0], arm[1], intel[0], intel[1])

    # 4. sdist fallback
    if pkg_data.get("sdist_url"):
        return ("sdist", pkg_data["sdist_url"], pkg_data["sdist_hash"])

    return None


# ── PyPI helpers ──────────────────────────────────────────────────────────────

def fetch_pypi_sdist(package: str, version: str) -> tuple[str, str]:
    url = f"https://pypi.org/pypi/{package}/{version}/json"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    for f in data["urls"]:
        if f["packagetype"] == "sdist":
            return f["url"], f["digests"]["sha256"]
    raise RuntimeError(f"No sdist found for {package}=={version} on PyPI")


# ── formula rendering ─────────────────────────────────────────────────────────

def render_resource(name: str, res: tuple) -> list[str]:
    kind = res[0]
    if kind in ("single", "sdist"):
        _, url, sha = res
        return [f'  resource "{name}" do', f'    url "{url}"', f'    sha256 "{sha}"', "  end", ""]
    _, arm_url, arm_sha, intel_url, intel_sha = res
    return [
        "  on_arm do",
        f'    resource "{name}" do',
        f'      url "{arm_url}"',
        f'      sha256 "{arm_sha}"',
        "    end",
        "  end",
        "",
        "  on_intel do",
        f'    resource "{name}" do',
        f'      url "{intel_url}"',
        f'      sha256 "{intel_sha}"',
        "    end",
        "  end",
        "",
    ]


def render(
    version: str,
    pkg_url: str,
    pkg_sha: str,
    python_version: str,
    resources: list[tuple],
    needs_rust: bool,
) -> str:
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
        f'  depends_on "python@{python_version}"',
    ]
    if needs_rust:
        lines.append('  depends_on "rust" => :build')
    lines.append("")

    for name, res in resources:
        lines.extend(render_resource(name, res))

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


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="devcoach release version")
    parser.add_argument("--pyproject", default="pyproject.toml")
    parser.add_argument("--uv-lock", default="uv.lock")
    args = parser.parse_args()

    python_version = max_python_version(args.pyproject)
    py_ver = int(python_version.replace(".", ""))

    pkg_data = parse_uv_lock(args.uv_lock)
    prod_deps = transitive_closure(pkg_data)

    resources: list[tuple] = []
    needs_rust = False
    for name in sorted(prod_deps):
        if name in EXCLUDE:
            continue
        res = pick_resource(pkg_data.get(name, {}), py_ver)
        if res is None:
            print(f"WARNING: no usable source for {name}, skipping", file=sys.stderr)
            continue
        if res[0] == "sdist" and name in RUST_PACKAGES:
            needs_rust = True
        resources.append((name, res))

    pkg_url, pkg_sha = fetch_pypi_sdist("devcoach", args.version)
    print(render(args.version, pkg_url, pkg_sha, python_version, resources, needs_rust), end="")


if __name__ == "__main__":
    main()
