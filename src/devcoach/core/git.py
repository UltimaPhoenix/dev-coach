"""Git context auto-detection for devcoach."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Optional


def _run(*args: str) -> Optional[str]:
    """Run a git command and return stdout, or None on any error."""
    try:
        result = subprocess.run(
            list(args),
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode == 0:
            return result.stdout.strip() or None
    except Exception:
        pass
    return None


def _parse_remote(remote: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Parse a git remote URL into (repository, platform).

    Handles:
      git@github.com:org/repo.git  →  ("org/repo", "github")
      https://github.com/org/repo  →  ("org/repo", "github")
      https://gitlab.com/org/repo.git  →  ("org/repo", "gitlab")
      https://bitbucket.org/org/repo  →  ("org/repo", "bitbucket")
      anything else with a remote  →  (remote, "local")
      no remote  →  (None, None)
    """
    if not remote:
        return None, None

    _PLATFORM_MAP = {
        "github.com": "github",
        "gitlab.com": "gitlab",
        "bitbucket.org": "bitbucket",
    }

    # SSH: git@host:org/repo.git
    ssh_match = re.match(r"git@([^:]+):(.+?)(?:\.git)?$", remote)
    if ssh_match:
        host = ssh_match.group(1).lower()
        path = ssh_match.group(2)
        platform = _PLATFORM_MAP.get(host, "local")
        return path, platform

    # HTTPS: https://host/org/repo[.git]
    https_match = re.match(r"https?://([^/]+)/(.+?)(?:\.git)?$", remote)
    if https_match:
        host = https_match.group(1).lower()
        path = https_match.group(2)
        platform = _PLATFORM_MAP.get(host, "local")
        return path, platform

    return remote, "local"


def detect_git_context() -> dict[str, str | None]:
    """Detect git metadata from the current working directory.

    Returns a dict with keys: project, repository, branch, commit_hash,
    folder, repository_platform. Any field that cannot be determined is None.
    All subprocess calls have a 3-second timeout and never raise.
    """
    folder = str(Path.cwd())
    branch = _run("git", "rev-parse", "--abbrev-ref", "HEAD")
    commit = _run("git", "rev-parse", "HEAD")
    remote = _run("git", "remote", "get-url", "origin")

    repository, platform = _parse_remote(remote)

    if repository:
        # Use last path component as project name
        project: Optional[str] = repository.rstrip("/").split("/")[-1]
    else:
        # Fall back to cwd folder name
        project = Path(folder).name or None

    # HEAD detached check
    if branch == "HEAD":
        branch = None

    return {
        "project": project,
        "repository": repository,
        "branch": branch,
        "commit_hash": commit,
        "folder": folder,
        "repository_platform": platform,
    }
