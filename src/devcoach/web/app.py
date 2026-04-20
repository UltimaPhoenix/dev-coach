"""FastAPI web dashboard for devcoach."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from devcoach.core import db

app = FastAPI(title="devcoach", docs_url=None, redoc_url=None)

_HERE = Path(__file__).parent
templates = Jinja2Templates(directory=str(_HERE / "templates"))
app.mount("/static", StaticFiles(directory=str(_HERE / "static")), name="static")


def _get_conn():  # type: ignore[no-untyped-def]
    conn = db.get_connection()
    db.init_schema(conn)
    return conn


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def profile_page(request: Request) -> HTMLResponse:
    conn = _get_conn()
    knowledge = db.get_all_knowledge(conn)
    conn.close()

    # Group by predefined categories; uncategorised topics go to "Other"
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
    conn = _get_conn()
    knowledge = db.get_all_knowledge(conn)
    current = knowledge.get(topic, 5)
    db.upsert_knowledge(conn, topic, current + delta)
    conn.close()
    return RedirectResponse(url="/", status_code=303)


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
) -> HTMLResponse:
    conn = _get_conn()
    starred_filter = True if starred == "1" else None
    lessons = db.get_lessons(
        conn,
        period=period or None,
        category=category or None,
        project=project or None,
        repository=repository or None,
        branch=branch or None,
        commit=commit or None,
        starred=starred_filter,
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
        },
    )


@app.post("/lessons/{lesson_id}/star")
async def star_lesson(
    lesson_id: str, next: str = Form(default="/lessons")
) -> RedirectResponse:
    conn = _get_conn()
    db.toggle_star(conn, lesson_id)
    conn.close()
    return RedirectResponse(url=next, status_code=303)


@app.post("/lessons/{lesson_id}/feedback")
async def submit_feedback(
    lesson_id: str,
    feedback: str = Form(...),
    next: str = Form(default="/lessons"),
) -> RedirectResponse:
    conn = _get_conn()
    feedback_value = None if feedback in ("", "clear") else feedback
    topic_id = db.set_feedback(conn, lesson_id, feedback_value)
    if topic_id and feedback_value in ("know", "dont_know"):
        knowledge = db.get_all_knowledge(conn)
        current = knowledge.get(topic_id, 5)
        delta = 1 if feedback == "know" else -1
        db.upsert_knowledge(conn, topic_id, current + delta)
    conn.close()
    return RedirectResponse(url=next, status_code=303)


@app.get("/lessons/{lesson_id}", response_class=HTMLResponse)
async def lesson_detail_page(request: Request, lesson_id: str) -> HTMLResponse:
    conn = _get_conn()
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
    conn = _get_conn()
    settings = db.get_settings(conn)
    conn.close()
    return templates.TemplateResponse(
        request,
        "settings.html",
        {"settings": settings},
    )


@app.post("/settings", response_class=HTMLResponse)
async def update_settings(
    max_per_day: int = Form(...),
    min_hours_between: int = Form(...),
) -> RedirectResponse:
    conn = _get_conn()
    db.set_setting(conn, "max_per_day", str(max_per_day))
    db.set_setting(conn, "min_hours_between", str(min_hours_between))
    conn.close()
    return RedirectResponse(url="/settings", status_code=303)
