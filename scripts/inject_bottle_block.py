#!/usr/bin/env python3
"""Inject a bottle do block into a Homebrew formula from brew bottle --json output.

Reads one or more JSON files produced by `brew bottle --json`, merges the
platform tags, and inserts (or replaces) the bottle do block in the formula.

Usage:
    python scripts/inject_bottle_block.py \
        --formula tap/Formula/devcoach.rb \
        --root-url https://github.com/UltimaPhoenix/dev-coach/releases/download/v0.3.30 \
        *.bottle.json
"""
import argparse
import json
import re
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--formula", required=True, help="path to the formula .rb file")
    parser.add_argument("--root-url", required=True, help="GitHub release download URL")
    parser.add_argument("json_files", nargs="+", help="brew bottle --json output files")
    args = parser.parse_args()

    # Collect platform tags + sha256 + cellar from all JSON files.
    # In Homebrew's bottle JSON the cellar is stored per-tag, not at the
    # bottle level. Each entry: {sha256, cellar} where cellar is a Ruby
    # symbol (:any, :any_skip_relocation) or an absolute path string.
    tags: dict[str, dict[str, str]] = {}
    for path in args.json_files:
        data = json.load(open(path))
        pkg = next(iter(data.values()))
        bottle = pkg["bottle"]
        for tag, info in bottle["tags"].items():
            tags[tag] = {
                "sha256": info["sha256"],
                "cellar": info.get("cellar", ":any_skip_relocation"),
            }

    if not tags:
        print("ERROR: no bottle tags found in JSON files", file=sys.stderr)
        sys.exit(1)

    # Build bottle do block. Each sha256 line carries its own cellar value.
    # Ruby symbols start with ':' and need no quotes; paths need quotes.
    lines = ["  bottle do", f'    root_url "{args.root_url}"']
    for tag in sorted(tags):
        cellar = tags[tag]["cellar"]
        sha256 = tags[tag]["sha256"]
        cellar_ruby = cellar if cellar.startswith(":") else f'"{cellar}"'
        lines.append(f'    sha256 cellar: {cellar_ruby}, {tag}: "{sha256}"')
    lines.append("  end")
    block = "\n".join(lines) + "\n"

    formula = open(args.formula).read()

    if "bottle do" in formula:
        # Replace existing block
        formula = re.sub(r"  bottle do\n.*?  end\n", block, formula, flags=re.DOTALL)
    else:
        # Insert after the license line
        formula = re.sub(r'(  license ".+?"\n)', rf'\1\n{block}', formula)

    open(args.formula, "w").write(formula)
    print(f"Injected bottle block: {', '.join(sorted(tags))}")


if __name__ == "__main__":
    main()
