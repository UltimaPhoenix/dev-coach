"""Anonymize a devcoach backup zip for safe public sharing.

Replacements applied to lessons.json:
  - Absolute paths (/root/username/...)        → /home/user/...
  - Repository owner prefix (owner/repo)       → developer/repo
  - Commit hashes (full 40-char SHA-1)         → random 40-char hex

Usage:
    python .github/scripts/anonymize_backup.py <input.zip> [output.zip]

If output.zip is omitted the anonymized file is written next to the input
with "-anon" appended to the stem (e.g. devcoach-backup-anon.zip).
"""

import json
import re
import secrets
import sys
import zipfile
from pathlib import Path


SHA1_RE = re.compile(r"\b[0-9a-f]{40}\b", re.IGNORECASE)
REPO_USER_RE = re.compile(r"^[^/\s]+/")

ANON_REPO_PREFIX = "developer/"


def _random_sha1() -> str:
    return secrets.token_hex(20)


def _anonymize_path(path: str) -> str:
    """Replace username in any absolute path /root/username/... → /home/user/..."""
    parts = path.split("/")
    # Absolute path: ['', '<root>', '<username>', ...]
    if len(parts) >= 3 and parts[0] == "" and parts[1] and parts[2]:
        parts[1] = "home"
        parts[2] = "user"
    return "/".join(parts)


def _has_personal_path(value: str) -> bool:
    """True if value contains an absolute path whose username is not 'user'."""
    parts = value.split("/")
    return (
        len(parts) >= 3
        and parts[0] == ""
        and parts[1] != ""
        and parts[2] not in ("", "user")
        and "/" in value[1:]  # at least one slash after the leading one
    )


def anonymize_lesson(lesson: dict, original_hashes: set[str]) -> dict:
    out = dict(lesson)

    if out.get("folder"):
        out["folder"] = _anonymize_path(out["folder"])

    if out.get("repository"):
        out["repository"] = REPO_USER_RE.sub(ANON_REPO_PREFIX, out["repository"])

    if out.get("commit_hash"):
        original_hashes.add(out["commit_hash"].lower())
        out["commit_hash"] = _random_sha1()

    if out.get("task_context"):
        ctx = out["task_context"]

        def _replace_hash(m: re.Match) -> str:
            original_hashes.add(m.group().lower())
            return _random_sha1()

        ctx = SHA1_RE.sub(_replace_hash, ctx)
        tokens = ctx.split()
        ctx = " ".join(_anonymize_path(t) if _has_personal_path(t) else t for t in tokens)
        out["task_context"] = ctx

    return out


def anonymize_zip(src: Path, dst: Path) -> None:
    original_hashes: set[str] = set()

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in zin.namelist():
            raw = zin.read(name)

            if name == "lessons.json":
                lessons = json.loads(raw.decode())
                lessons = [anonymize_lesson(l, original_hashes) for l in lessons]
                raw = json.dumps(lessons, indent=2, ensure_ascii=False).encode()

            zout.writestr(name, raw)

    print(f"Anonymized backup written to: {dst}")
    _verify(dst, original_hashes)


def _verify(path: Path, original_hashes: set[str]) -> None:
    with zipfile.ZipFile(path) as z:
        lessons = json.loads(z.read("lessons.json").decode())
    issues: list[str] = []
    for lesson in lessons:
        for field in ("folder", "repository", "commit_hash", "task_context"):
            val = lesson.get(field) or ""
            if _has_personal_path(val):
                issues.append(f"  {lesson['id']}.{field}: personal path still present")
            for match in SHA1_RE.finditer(val):
                if match.group().lower() in original_hashes:
                    issues.append(f"  {lesson['id']}.{field}: original SHA-1 hash still present")
    if issues:
        print("Verification warnings:")
        for w in issues:
            print(w)
    else:
        print(f"Verification passed ({len(lessons)} lessons, no personal data detected).")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(f"Usage: python {sys.argv[0]} <input.zip> [output.zip]")

    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit(f"File not found: {src}")

    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_stem(src.stem + "-anon")

    anonymize_zip(src, dst)


if __name__ == "__main__":
    main()
