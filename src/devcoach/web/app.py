"""FastAPI web dashboard for devcoach."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from devcoach.core import coach, db
from devcoach.core.db import get_initialized_connection

app = FastAPI(title="devcoach", docs_url=None, redoc_url=None)

_HERE = Path(__file__).parent
templates = Jinja2Templates(directory=str(_HERE / "templates"))
app.mount("/static", StaticFiles(directory=str(_HERE / "static")), name="static")


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def profile_page(request: Request) -> HTMLResponse:
    conn = get_initialized_connection()
    knowledge = db.get_all_knowledge(conn)
    conn.close()

    categorised: dict[str, list[tuple[str, int]]] = {}
    seen: set[str] = set()
    for category, topics in db.KNOWLEDGE_CATEGORIES.items():
        entries = [(t, knowledge[t]) for t in topics if t in knowledge]
        if entries:
            categorised[category] = entries
            seen.update(t for t, _ in entries)
    other = sorted(
        [(t, c) for t, c in knowledge.items() if t not in seen],
        key=lambda x: -x[1],
    )
    if other:
        categorised["Other"] = other

    return templates.TemplateResponse(
        request,
        "profile.html",
        {"categorised": categorised},
    )


@app.post("/knowledge/{topic}", response_class=HTMLResponse)
async def adjust_knowledge(
    request: Request, topic: str, delta: int = Form(...)
) -> RedirectResponse:
    conn = get_initialized_connection()
    coach.apply_knowledge_delta(conn, topic, delta)
    conn.close()
    return RedirectResponse(url="/", status_code=303)


@app.get("/lessons/export")
async def export_lessons_route() -> Response:
    conn = get_initialized_connection()
    records = db.export_lessons(conn)
    conn.close()
    payload = json.dumps(records, indent=2, ensure_ascii=False)
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=devcoach-lessons.json"},
    )


@app.post("/lessons/import")
async def import_lessons_route(file: UploadFile = File(...)) -> RedirectResponse:
    content = await file.read()
    records = json.loads(content)
    conn = get_initialized_connection()
    count = db.import_lessons(conn, records)
    conn.close()
    return RedirectResponse(url=f"/settings?imported={count}", status_code=303)


@app.get("/lessons", response_class=HTMLResponse)
async def lessons_page(
    request: Request,
    period: Optional[str] = None,
    category: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit: Optional[str] = None,
    starred: Optional[str] = None,
    search: Optional[str] = None,
    feedback: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> HTMLResponse:
    conn = get_initialized_connection()
    starred_filter = True if starred == "1" else None
    # Custom date range takes precedence over period presets
    effective_period = None if (date_from or date_to) else (period or None)
    lessons = db.get_lessons(
        conn,
        period=effective_period,
        category=category or None,
        project=project or None,
        repository=repository or None,
        branch=branch or None,
        commit=commit or None,
        starred=starred_filter,
        search=search or None,
        feedback=feedback or None,
        date_from=date_from or None,
        date_to=date_to or None,
    )
    all_categories = db.get_all_categories(conn)
    all_projects = db.get_distinct_column(conn, "project")
    all_repositories = db.get_distinct_column(conn, "repository")
    all_branches = db.get_distinct_column(conn, "branch")
    all_commits = db.get_distinct_column(conn, "commit_hash")
    conn.close()
    return templates.TemplateResponse(
        request,
        "lessons.html",
        {
            "lessons": lessons,
            "all_categories": all_categories,
            "all_projects": all_projects,
            "all_repositories": all_repositories,
            "all_branches": all_branches,
            "all_commits": all_commits,
            "selected_period": period or "all",
            "selected_category": category or "",
            "selected_project": project or "",
            "selected_repository": repository or "",
            "selected_branch": branch or "",
            "selected_commit": commit or "",
            "selected_starred": starred == "1",
            "selected_search": search or "",
            "selected_feedback": feedback or "",
            "selected_date_from": date_from or "",
            "selected_date_to": date_to or "",
        },
    )


@app.post("/lessons/{lesson_id}/star")
async def star_lesson(
    lesson_id: str, next: str = Form(default="/lessons")
) -> RedirectResponse:
    conn = get_initialized_connection()
    db.toggle_star(conn, lesson_id)
    conn.close()
    return RedirectResponse(url=next, status_code=303)


@app.post("/lessons/{lesson_id}/feedback")
async def submit_feedback(
    lesson_id: str,
    feedback: str = Form(...),
    next: str = Form(default="/lessons"),
) -> RedirectResponse:
    conn = get_initialized_connection()
    feedback_value = None if feedback in ("", "clear") else feedback
    coach.record_feedback(conn, lesson_id, feedback_value)
    conn.close()
    return RedirectResponse(url=next, status_code=303)


@app.get("/lessons/{lesson_id}", response_class=HTMLResponse)
async def lesson_detail_page(request: Request, lesson_id: str) -> HTMLResponse:
    conn = get_initialized_connection()
    lesson = db.get_lesson_by_id(conn, lesson_id)
    conn.close()
    if lesson is None:
        return HTMLResponse("<h1>Lesson not found</h1>", status_code=404)
    return templates.TemplateResponse(
        request,
        "lesson_detail.html",
        {"lesson": lesson},
    )


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request) -> HTMLResponse:
    conn = get_initialized_connection()
    settings = db.get_settings(conn)
    conn.close()
    return templates.TemplateResponse(
        request,
        "settings.html",
        {
            "settings": settings,
            "gap_hours": settings.min_gap_minutes // 60,
            "gap_minutes": settings.min_gap_minutes % 60,
        },
    )


@app.post("/settings", response_class=HTMLResponse)
async def update_settings(
    max_per_day: int = Form(...),
    min_gap_minutes: int = Form(...),
) -> RedirectResponse:
    conn = get_initialized_connection()
    db.set_setting(conn, "max_per_day", str(max_per_day))
    db.set_setting(conn, "min_gap_minutes", str(min_gap_minutes))
    conn.close()
    return RedirectResponse(url="/settings", status_code=303)


@app.get("/settings/export")
async def export_settings_route() -> Response:
    """Export full backup as zip: settings.json + lessons.json + knowledge.json."""
    conn = get_initialized_connection()
    data = db.create_backup_zip(conn)
    conn.close()
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=devcoach-backup.zip"},
    )


@app.post("/settings/import")
async def import_settings_route(file: UploadFile = File(...)) -> RedirectResponse:
    """Restore from a backup zip. Restores settings, knowledge map, and imports lessons."""
    content = await file.read()
    conn = get_initialized_connection()
    result = db.restore_backup_zip(conn, content)
    conn.close()
    return RedirectResponse(url=f"/settings?imported={result['lessons']}", status_code=303)
