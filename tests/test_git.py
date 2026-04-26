"""Tests for core/git.py — remote URL parsing and context detection."""

from __future__ import annotations

from unittest.mock import patch

from devcoach.core.git import _parse_remote, detect_git_context

# ── _parse_remote ──────────────────────────────────────────────────────────


class TestParseRemote:
    def test_none_returns_none_none(self):
        assert _parse_remote(None) == (None, None)

    def test_empty_string_returns_local(self):
        repo, platform = _parse_remote("")
        assert repo is None
        assert platform is None

    def test_ssh_github(self):
        repo, platform = _parse_remote("git@github.com:org/repo.git")
        assert repo == "org/repo"
        assert platform == "github"

    def test_ssh_gitlab(self):
        repo, platform = _parse_remote("git@gitlab.com:org/repo.git")
        assert repo == "org/repo"
        assert platform == "gitlab"

    def test_ssh_bitbucket(self):
        repo, platform = _parse_remote("git@bitbucket.org:org/repo.git")
        assert repo == "org/repo"
        assert platform == "bitbucket"

    def test_ssh_no_git_suffix(self):
        repo, platform = _parse_remote("git@github.com:org/repo")
        assert repo == "org/repo"
        assert platform == "github"

    def test_https_github(self):
        repo, platform = _parse_remote("https://github.com/org/repo.git")
        assert repo == "org/repo"
        assert platform == "github"

    def test_https_gitlab(self):
        repo, platform = _parse_remote("https://gitlab.com/org/repo")
        assert repo == "org/repo"
        assert platform == "gitlab"

    def test_https_bitbucket(self):
        repo, platform = _parse_remote("https://bitbucket.org/org/repo")
        assert repo == "org/repo"
        assert platform == "bitbucket"

    def test_https_unknown_host_is_local(self):
        repo, platform = _parse_remote("https://git.mycompany.com/org/repo")
        assert platform == "local"

    def test_ssh_unknown_host_is_local(self):
        repo, platform = _parse_remote("git@git.internal:org/repo.git")
        assert platform == "local"

    def test_unrecognised_url_falls_back(self):
        repo, platform = _parse_remote("svn://example.com/repo")
        assert repo == "svn://example.com/repo"
        assert platform == "local"


# ── detect_git_context ────────────────────────────────────────────────────


class TestDetectGitContext:
    def _run_side_effect(self, *args):
        """Return mock values based on the git subcommand."""
        if "--abbrev-ref" in args:
            return "main"
        if "rev-parse" in args and "HEAD" in args:
            return "abc1234def5678"
        if "get-url" in args:
            return "git@github.com:org/myrepo.git"
        return None

    def test_returns_all_keys(self):
        with patch("devcoach.core.git._run", side_effect=self._run_side_effect):
            ctx = detect_git_context()
        assert set(ctx.keys()) == {
            "project",
            "repository",
            "branch",
            "commit_hash",
            "folder",
            "repository_platform",
        }

    def test_branch_detected(self):
        with patch("devcoach.core.git._run", side_effect=self._run_side_effect):
            ctx = detect_git_context()
        assert ctx["branch"] == "main"

    def test_project_extracted_from_remote(self):
        with patch("devcoach.core.git._run", side_effect=self._run_side_effect):
            ctx = detect_git_context()
        assert ctx["project"] == "myrepo"

    def test_platform_detected(self):
        with patch("devcoach.core.git._run", side_effect=self._run_side_effect):
            ctx = detect_git_context()
        assert ctx["repository_platform"] == "github"

    def test_detached_head_branch_is_none(self):
        def _run_detached(*args):
            if "--abbrev-ref" in args:
                return "HEAD"
            return None

        with patch("devcoach.core.git._run", side_effect=_run_detached):
            ctx = detect_git_context()
        assert ctx["branch"] is None

    def test_no_remote_uses_folder_name(self):
        def _run_no_remote(*args):
            if "--abbrev-ref" in args:
                return "main"
            if "get-url" in args:
                return None
            return None

        with patch("devcoach.core.git._run", side_effect=_run_no_remote):
            ctx = detect_git_context()
        assert ctx["repository"] is None
        assert ctx["project"] is not None  # falls back to cwd name

    def test_all_none_when_git_unavailable(self):
        with patch("devcoach.core.git._run", return_value=None):
            ctx = detect_git_context()
        assert ctx["branch"] is None
        assert ctx["commit_hash"] is None
        assert ctx["repository"] is None
        assert ctx["repository_platform"] is None
