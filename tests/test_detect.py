"""Tests for core/detect.py — file-based stack detection."""

from __future__ import annotations

import json

from devcoach.core.detect import detect_stack


class TestDetectStack:
    def test_empty_folder_returns_empty(self, tmp_path):
        assert detect_stack(str(tmp_path)) == {}

    def test_detects_python_from_pyproject(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\nname = 'test'\n")
        result = detect_stack(str(tmp_path))
        assert "python" in result

    def test_detects_python_from_requirements(self, tmp_path):
        (tmp_path / "requirements.txt").write_text("requests==2.31\n")
        result = detect_stack(str(tmp_path))
        assert "python" in result

    def test_detects_javascript_from_package_json(self, tmp_path):
        (tmp_path / "package.json").write_text('{"name": "test", "dependencies": {}}')
        result = detect_stack(str(tmp_path))
        assert "javascript" in result

    def test_detects_typescript_from_tsconfig(self, tmp_path):
        (tmp_path / "tsconfig.json").write_text("{}")
        result = detect_stack(str(tmp_path))
        assert "typescript" in result

    def test_detects_docker_from_dockerfile(self, tmp_path):
        (tmp_path / "Dockerfile").write_text("FROM python:3.12\n")
        result = detect_stack(str(tmp_path))
        assert "docker" in result
        assert result["docker"] == 7  # higher confidence

    def test_detects_docker_compose(self, tmp_path):
        (tmp_path / "docker-compose.yml").write_text("version: '3'\n")
        result = detect_stack(str(tmp_path))
        assert "docker_compose" in result

    def test_detects_git(self, tmp_path):
        (tmp_path / ".git").mkdir()
        result = detect_stack(str(tmp_path))
        assert "git" in result

    def test_detects_github_actions(self, tmp_path):
        workflows = tmp_path / ".github" / "workflows"
        workflows.mkdir(parents=True)
        (workflows / "ci.yml").write_text("name: CI\n")
        result = detect_stack(str(tmp_path))
        assert "github_actions" in result

    def test_detects_terraform(self, tmp_path):
        (tmp_path / "main.tf").write_text('provider "aws" {}\n')
        result = detect_stack(str(tmp_path))
        assert "terraform" in result

    def test_detects_go(self, tmp_path):
        (tmp_path / "go.mod").write_text("module example.com/app\ngo 1.21\n")
        result = detect_stack(str(tmp_path))
        assert "go" in result

    def test_detects_rust(self, tmp_path):
        (tmp_path / "Cargo.toml").write_text("[package]\nname = 'test'\n")
        result = detect_stack(str(tmp_path))
        assert "rust" in result

    def test_keeps_highest_confidence(self, tmp_path):
        # Both package.json (confidence 6) and Dockerfile (confidence 7)
        (tmp_path / "package.json").write_text('{"dependencies": {}}')
        (tmp_path / "Dockerfile").write_text("FROM node:20\n")
        result = detect_stack(str(tmp_path))
        assert result["docker"] == 7

    def test_detects_react_from_package_json(self, tmp_path):
        pkg = {"dependencies": {"react": "^18.0.0", "react-dom": "^18.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        result = detect_stack(str(tmp_path))
        assert "react" in result

    def test_detects_nextjs_from_package_json(self, tmp_path):
        pkg = {"dependencies": {"next": "^14.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        result = detect_stack(str(tmp_path))
        assert "nextjs" in result

    def test_detects_fastapi_from_requirements(self, tmp_path):
        (tmp_path / "requirements.txt").write_text("fastapi>=0.100\nuvicorn\n")
        result = detect_stack(str(tmp_path))
        assert "fastapi" in result

    def test_detects_django_from_pyproject(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\ndependencies = ['django>=4.0']\n")
        result = detect_stack(str(tmp_path))
        assert "django" in result

    def test_malformed_package_json_does_not_crash(self, tmp_path):
        (tmp_path / "package.json").write_text("not valid json {{")
        result = detect_stack(str(tmp_path))
        # Should still detect javascript from file presence, just no framework
        assert "javascript" in result

    def test_sql_detected_from_sql_file(self, tmp_path):
        (tmp_path / "schema.sql").write_text("CREATE TABLE users (id INTEGER);\n")
        result = detect_stack(str(tmp_path))
        assert "sql" in result
        assert result["sql"] == 5  # lower default confidence
