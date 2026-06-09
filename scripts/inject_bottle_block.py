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

    # Collect platform tags + sha256 from all JSON files
    tags: dict[str, str] = {}
    cellar = ":any"
    for path in args.json_files:
        data = json.load(open(path))
        pkg = next(iter(data.values()))
        bottle = pkg["bottle"]
        if "cellar" in bottle:
            cellar = bottle["cellar"]
        for tag, info in bottle["tags"].items():
            tags[tag] = info["sha256"]

    if not tags:
        print("ERROR: no bottle tags found in JSON files", file=sys.stderr)
        sys.exit(1)

    # Build bottle do block
    lines = ["  bottle do", f'    root_url "{args.root_url}"']
    for tag in sorted(tags):
        lines.append(f'    sha256 cellar: {cellar}, {tag}: "{tags[tag]}"')
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
