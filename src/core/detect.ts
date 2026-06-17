// File-based tech stack detection from project files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// (glob_pattern, topic_id, default_confidence)
const STACK_SIGNALS: ReadonlyArray<readonly [string, string, number]> = [
  ["package.json", "javascript", 6],
  ["tsconfig*.json", "typescript", 6],
  ["requirements*.txt", "python", 6],
  ["pyproject.toml", "python", 6],
  ["setup.py", "python", 6],
  ["go.mod", "go", 6],
  ["Cargo.toml", "rust", 6],
  ["pom.xml", "java", 6],
  ["build.gradle", "java", 6],
  ["build.gradle.kts", "java", 6],
  ["*.csproj", "csharp", 6],
  ["Gemfile", "ruby", 6],
  ["composer.json", "php", 6],
  ["Dockerfile", "docker", 7],
  ["Dockerfile.*", "docker", 7],
  ["docker-compose.yml", "docker_compose", 7],
  ["docker-compose.yaml", "docker_compose", 7],
  ["docker-compose.*.yml", "docker_compose", 7],
  [".github/workflows/*.yml", "github_actions", 6],
  [".github/workflows/*.yaml", "github_actions", 6],
  [".gitlab-ci.yml", "gitlab_ci", 6],
  ["Jenkinsfile", "ci_cd", 6],
  ["*.tf", "terraform", 6],
  ["*.sql", "sql", 5],
  [".git", "git", 7],
  ["kubernetes/*.yaml", "kubernetes", 6],
  ["kubernetes/*.yml", "kubernetes", 6],
  ["k8s/*.yaml", "kubernetes", 6],
  ["*.bicep", "azure", 6],
  ["serverless.yml", "aws", 6],
  ["serverless.yaml", "aws", 6],
  ["template.yaml", "aws", 5],
  ["angular.json", "angular", 6],
  ["svelte.config.*", "svelte", 6],
  ["nuxt.config.*", "vue", 6],
  ["vite.config.*", "javascript", 6],
];

const JS_FRAMEWORK_MAP: Record<string, string> = {
  react: "react",
  "react-dom": "react",
  vue: "vue",
  "@angular/core": "angular",
  svelte: "svelte",
  next: "nextjs",
  nuxt: "vue",
  fastify: "fastify",
  express: "express",
  koa: "express",
  "@nestjs/core": "node_js",
};

const PYTHON_FRAMEWORK_MAP: Record<string, string> = {
  django: "django",
  flask: "flask",
  fastapi: "fastapi",
  starlette: "fastapi",
  tornado: "python",
  aiohttp: "python",
  sqlalchemy: "postgresql",
  celery: "python",
};

function globToRegex(glob: string): RegExp {
  let re = "";
  for (const ch of glob) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Mirror Path.glob(pattern): match a single directory level (cwd or one explicit subdir). */
function matchesGlob(folder: string, pattern: string): boolean {
  const slash = pattern.lastIndexOf("/");
  const dir = slash >= 0 ? join(folder, pattern.slice(0, slash)) : folder;
  const filePattern = slash >= 0 ? pattern.slice(slash + 1) : pattern;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  const re = globToRegex(filePattern);
  return entries.some((e) => re.test(e));
}

export function detectStack(folder: string): Record<string, number> {
  const result: Record<string, number> = {};
  const add = (topic: string, confidence: number): void => {
    // keep the highest confidence seen for a topic
    if ((result[topic] ?? -1) < confidence) result[topic] = confidence;
  };

  for (const [pattern, topic, confidence] of STACK_SIGNALS) {
    if (matchesGlob(folder, pattern)) add(topic, confidence);
  }

  // Deeper inspection: package.json → JS frameworks
  const pkgPath = join(folder, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const deps = new Set<string>([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]);
      for (const [dep, topic] of Object.entries(JS_FRAMEWORK_MAP)) {
        if (deps.has(dep)) add(topic, 6);
      }
    } catch {
      // unreadable / invalid package.json — skip
    }
  }

  // Deeper inspection: requirements / pyproject → Python frameworks
  for (const reqFile of ["requirements.txt", "requirements-dev.txt", "requirements/base.txt"]) {
    const reqPath = join(folder, reqFile);
    if (existsSync(reqPath)) {
      try {
        const text = readFileSync(reqPath, "utf8").toLowerCase();
        for (const [pkgName, topic] of Object.entries(PYTHON_FRAMEWORK_MAP)) {
          if (text.includes(pkgName)) add(topic, 6);
        }
      } catch {
        // skip unreadable file
      }
    }
  }

  const pyprojectPath = join(folder, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const text = readFileSync(pyprojectPath, "utf8").toLowerCase();
      for (const [pkgName, topic] of Object.entries(PYTHON_FRAMEWORK_MAP)) {
        if (text.includes(pkgName)) add(topic, 6);
      }
    } catch {
      // skip unreadable file
    }
  }

  return result;
}
