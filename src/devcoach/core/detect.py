"""File-based tech stack detection for devcoach onboarding."""

from __future__ import annotations

import json
from pathlib import Path


# (glob_pattern, topic_id, default_confidence)
# Confidence 6 = Intermediate (working knowledge); 7 = confident use.
STACK_SIGNALS: list[tuple[str, str, int]] = [
    ("package.json",          "javascript",      6),
    ("tsconfig*.json",        "typescript",      6),
    ("requirements*.txt",     "python",          6),
    ("pyproject.toml",        "python",          6),
    ("setup.py",              "python",          6),
    ("go.mod",                "go",              6),
    ("Cargo.toml",            "rust",            6),
    ("pom.xml",               "java",            6),
    ("build.gradle",          "java",            6),
    ("build.gradle.kts",      "java",            6),
    ("*.csproj",              "csharp",          6),
    ("Gemfile",               "ruby",            6),
    ("composer.json",         "php",             6),
    ("Dockerfile",            "docker",          7),
    ("Dockerfile.*",          "docker",          7),
    ("docker-compose.yml",    "docker_compose",  7),
    ("docker-compose.yaml",   "docker_compose",  7),
    ("docker-compose.*.yml",  "docker_compose",  7),
    (".github/workflows/*.yml", "github_actions", 6),
    (".github/workflows/*.yaml", "github_actions", 6),
    (".gitlab-ci.yml",        "gitlab_ci",       6),
    ("Jenkinsfile",           "ci_cd",           6),
    ("*.tf",                  "terraform",       6),
    ("*.sql",                 "sql",             5),
    (".git",                  "git",             7),
    ("kubernetes/*.yaml",     "kubernetes",      6),
    ("kubernetes/*.yml",      "kubernetes",      6),
    ("k8s/*.yaml",            "kubernetes",      6),
    ("*.bicep",               "azure",           6),
    ("serverless.yml",        "aws",             6),
    ("serverless.yaml",       "aws",             6),
    ("template.yaml",         "aws",             5),  # SAM
    ("angular.json",          "angular",         6),
    ("svelte.config.*",       "svelte",          6),
    ("nuxt.config.*",         "vue",             6),
    ("vite.config.*",         "javascript",      6),
]

# package.json devDependencies/dependencies → framework topic
_JS_FRAMEWORK_MAP: dict[str, str] = {
    "react": "react",
    "react-dom": "react",
    "vue": "vue",
    "@angular/core": "angular",
    "svelte": "svelte",
    "next": "nextjs",
    "nuxt": "vue",
    "fastify": "fastify",
    "express": "express",
    "koa": "express",
    "@nestjs/core": "node_js",
}

# requirements.txt / pyproject.toml → framework topic
_PYTHON_FRAMEWORK_MAP: dict[str, str] = {
    "django": "django",
    "flask": "flask",
    "fastapi": "fastapi",
    "starlette": "fastapi",
    "tornado": "python",
    "aiohttp": "python",
    "sqlalchemy": "postgresql",
    "celery": "python",
}


def detect_stack(folder: str) -> dict[str, int]:
    """Scan *folder* for technology signals.

    Returns {topic_id: confidence} as suggestions for the onboarding
    conversation. Values are defaults only — the user should confirm or
    adjust each one.
    """
    root = Path(folder)
    result: dict[str, int] = {}

    def _add(topic: str, confidence: int) -> None:
        # Keep the highest confidence seen for a topic
        if result.get(topic, -1) < confidence:
            result[topic] = confidence

    for pattern, topic, confidence in STACK_SIGNALS:
        if list(root.glob(pattern)):
            _add(topic, confidence)

    # Deeper inspection: package.json → JS frameworks
    pkg_path = root / "package.json"
    if pkg_path.exists():
        try:
            pkg = json.loads(pkg_path.read_text(encoding="utf-8", errors="replace"))
            all_deps: set[str] = set()
            all_deps.update(pkg.get("dependencies", {}).keys())
            all_deps.update(pkg.get("devDependencies", {}).keys())
            for dep, framework_topic in _JS_FRAMEWORK_MAP.items():
                if dep in all_deps:
                    _add(framework_topic, 6)
        except Exception:
            pass

    # Deeper inspection: pyproject.toml / requirements → Python frameworks
    for req_file in ("requirements.txt", "requirements-dev.txt", "requirements/base.txt"):
        req_path = root / req_file
        if req_path.exists():
            try:
                text = req_path.read_text(encoding="utf-8", errors="replace").lower()
                for pkg_name, framework_topic in _PYTHON_FRAMEWORK_MAP.items():
                    if pkg_name in text:
                        _add(framework_topic, 6)
            except Exception:
                pass

    pyproject_path = root / "pyproject.toml"
    if pyproject_path.exists():
        try:
            text = pyproject_path.read_text(encoding="utf-8", errors="replace").lower()
            for pkg_name, framework_topic in _PYTHON_FRAMEWORK_MAP.items():
                if pkg_name in text:
                    _add(framework_topic, 6)
        except Exception:
            pass

    return result
