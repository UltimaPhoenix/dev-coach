"""Take devcoach UI screenshots for documentation.

Flow:
  1. Restore DB from .github/scripts/fixtures/devcoach-backup.zip via `devcoach restore`
  2. Start `devcoach ui` on a fixed port
  3. Capture light + dark screenshots of each page
  4. Stop the server
"""

import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

SCREENSHOTS_DIR = Path("docs/screenshots")
FIXTURES_DIR = Path(".github/scripts/fixtures")
BACKUP_ZIP = FIXTURES_DIR / "devcoach-backup.zip"
PORT = 7862
BASE_URL = f"http://localhost:{PORT}"
VIEWPORT = {"width": 1440, "height": 900}

PAGES = [
    ("knowledge-map", "/"),
    ("lessons", "/lessons"),
    ("settings", "/settings"),
]

LESSON_PAGES = [
    ("lesson-docker-layer-cache", "/lessons/lesson-docker-layer-cache-001"),
    ("lesson-postgresql-explain-analyze", "/lessons/lesson-postgresql-explain-analyze-001"),
    ("lesson-git-interactive-rebase", "/lessons/lesson-git-interactive-rebase-001"),
    ("lesson-ci-cd-pipeline-stages", "/lessons/lesson-ci-cd-pipeline-stages-001"),
    ("lesson-redis-cache-stampede", "/lessons/lesson-redis-cache-stampede-001"),
]

def restore_db() -> None:
    result = subprocess.run(
        ["devcoach", "restore", str(BACKUP_ZIP)],
        check=True,
        capture_output=True,
        text=True,
    )
    print(result.stdout.strip())


def wait_for_server(url: str, timeout: int = 30) -> None:
    for _ in range(timeout):
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except Exception:
            time.sleep(1)
    raise TimeoutError(f"Server at {url} did not start within {timeout}s")


def take_screenshots(server_proc: subprocess.Popen) -> None:
    from playwright.sync_api import sync_playwright

    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        for scheme in ("light", "dark"):
            ctx = browser.new_context(viewport=VIEWPORT, color_scheme=scheme)
            page = ctx.new_page()
            for name, path in PAGES + LESSON_PAGES:
                page.goto(f"{BASE_URL}{path}")
                page.wait_for_load_state("networkidle")
                out = SCREENSHOTS_DIR / f"{name}-{scheme}.png"
                page.screenshot(path=str(out))
                print(f"  saved {out}")
            ctx.close()

        browser.close()

    server_proc.send_signal(signal.SIGTERM)
    server_proc.wait(timeout=10)


def main() -> None:
    if not BACKUP_ZIP.exists():
        sys.exit(f"Backup not found: {BACKUP_ZIP}")

    print(f"Restoring DB from {BACKUP_ZIP}…")
    restore_db()

    print(f"Starting devcoach UI on port {PORT}…")
    proc = subprocess.Popen(
        ["devcoach", "ui", "--port", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_server(BASE_URL)
        print("Taking screenshots…")
        take_screenshots(proc)
    except Exception:
        proc.terminate()
        raise

    print("Done.")


if __name__ == "__main__":
    main()
