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
from devcoach.core.models import KnowledgeEntry

app = FastAPI(title="devcoach", docs_url=None, redoc_url=None)

_HERE = Path(__file__).parent
templates = Jinja2Templates(directory=str(_HERE / "templates"))
app.mount("/static", StaticFiles(directory=str(_HERE / "static")), name="static")


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def profile_page(request: Request) -> HTMLResponse:
    with db.connection() as conn:
        profile = coach.get_profile(conn)

    topic_group = {t: g.name for g in profile.groups for t in g.topics}
    categorised: dict[str, list[KnowledgeEntry]] = {g.name: [] for g in profile.groups}
    for entry in profile.knowledge:
        key = topic_group.get(entry.topic, "Other")
        categorised.setdefault(key, []).append(entry)

    all_groups = [g.name for g in profile.groups]

    return templates.TemplateResponse(
        request,
        "profile.html",
        {"categorised": categorised, "all_groups": all_groups},
    )


@app.post("/knowledge", response_class=HTMLResponse)
async def add_knowledge(
    topic: str = Form(...),
    confidence: int = Form(5),
    group: str = Form(""),
) -> RedirectResponse:
    topic = topic.strip()
    if topic:
        with db.connection() as conn:
            db.upsert_knowledge(conn, topic, confidence)
            if group.strip() and group.strip() != "Other":
                db.assign_topic_to_group(conn, topic, group.strip())
    return RedirectResponse(url="/", status_code=303)


@app.post("/knowledge/{topic}/delete", response_class=HTMLResponse)
async def delete_knowledge(topic: str) -> RedirectResponse:
    with db.connection() as conn:
        db.delete_knowledge(conn, topic)
    return RedirectResponse(url="/", status_code=303)


@app.post("/knowledge/{topic}/group", response_class=HTMLResponse)
async def set_topic_group(topic: str, group: str = Form(...)) -> RedirectResponse:
    with db.connection() as conn:
        if group.strip() and group.strip() != "Other":
            db.assign_topic_to_group(conn, topic, group.strip())
        else:
            db.unassign_topic_from_group(conn, topic)
    return RedirectResponse(url="/", status_code=303)


@app.post("/groups", response_class=HTMLResponse)
async def add_group(group_name: str = Form(...)) -> RedirectResponse:
    group_name = group_name.strip()
    if group_name and group_name != "Other":
        with db.connection() as conn:
            db.add_group(conn, group_name)
    return RedirectResponse(url="/", status_code=303)


@app.post("/groups/{group_name}/delete", response_class=HTMLResponse)
async def delete_group(group_name: str) -> RedirectResponse:
    with db.connection() as conn:
        db.delete_group(conn, group_name)
    return RedirectResponse(url="/", status_code=303)


@app.post("/knowledge/{topic}", response_class=HTMLResponse)
async def adjust_knowledge(
    request: Request, topic: str, delta: int = Form(...)
) -> RedirectResponse:
    with db.connection() as conn:
        coach.apply_knowledge_delta(conn, topic, delta)
    return RedirectResponse(url="/", status_code=303)


@app.get("/lessons/export")
async def export_lessons_route() -> Response:
    with db.connection() as conn:
        records = db.export_lessons(conn)
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
    with db.connection() as conn:
        inserted, duplicated, invalid = db.import_lessons(conn, records)
    return RedirectResponse(url=f"/settings?imported={inserted}&skipped={duplicated}&invalid={invalid}", status_code=303)


_PER_PAGE = 25


@app.get("/lessons", response_class=HTMLResponse)
async def lessons_page(
    request: Request,
    period: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit: Optional[str] = None,
    starred: Optional[str] = None,
    search: Optional[str] = None,
    feedback: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort: Optional[str] = None,
    order: Optional[str] = None,
    page: int = 1,
) -> HTMLResponse:
    starred_filter = True if starred == "1" else None
    effective_period = None if (date_from or date_to) else (period or None)
    valid_levels = {"junior", "mid", "senior"}
    filter_kwargs = dict(
        period=effective_period,
        category=category or None,
        level=level if level in valid_levels else None,
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
    selected_sort = sort or "timestamp"
    selected_order = order if order in ("asc", "desc") else "desc"
    page = max(1, page)
    with db.connection() as conn:
        total = db.count_filtered_lessons(conn, **filter_kwargs)
        lessons = db.get_lessons(
            conn, **filter_kwargs,
            sort=selected_sort, order=selected_order,
            page=page, per_page=_PER_PAGE,
        )
        all_categories = db.get_all_categories(conn)
        all_projects = db.get_distinct_column(conn, "project")
        all_repositories = db.get_distinct_column(conn, "repository")
        all_branches = db.get_distinct_column(conn, "branch")
        all_commits = db.get_distinct_column(conn, "commit_hash")

    import math
    total_pages = max(1, math.ceil(total / _PER_PAGE))
    page = min(page, total_pages)

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
            "selected_level": level if level in valid_levels else "",
            "selected_project": project or "",
            "selected_repository": repository or "",
            "selected_branch": branch or "",
            "selected_commit": commit or "",
            "selected_starred": starred == "1",
            "selected_search": search or "",
            "selected_feedback": feedback or "",
            "selected_date_from": date_from or "",
            "selected_date_to": date_to or "",
            "selected_sort": selected_sort,
            "selected_order": selected_order,
            "page": page,
            "per_page": _PER_PAGE,
            "total": total,
            "total_pages": total_pages,
        },
    )


@app.post("/lessons/{lesson_id}/star")
async def star_lesson(
    lesson_id: str, next: str = Form(default="/lessons")
) -> RedirectResponse:
    with db.connection() as conn:
        db.toggle_star(conn, lesson_id)
    return RedirectResponse(url=next, status_code=303)


@app.post("/lessons/{lesson_id}/feedback")
async def submit_feedback(
    lesson_id: str,
    feedback: str = Form(...),
    next: str = Form(default="/lessons"),
) -> RedirectResponse:
    feedback_value = None if feedback in ("", "clear") else feedback
    with db.connection() as conn:
        coach.record_feedback(conn, lesson_id, feedback_value)
    return RedirectResponse(url=next, status_code=303)


@app.get("/lessons/{lesson_id}", response_class=HTMLResponse)
async def lesson_detail_page(request: Request, lesson_id: str) -> HTMLResponse:
    with db.connection() as conn:
        lesson = db.get_lesson_by_id(conn, lesson_id)
    if lesson is None:
        return HTMLResponse("<h1>Lesson not found</h1>", status_code=404)
    return templates.TemplateResponse(
        request,
        "lesson_detail.html",
        {"lesson": lesson},
    )


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(
    request: Request,
    imported: Optional[int] = None,
    skipped: Optional[int] = None,
    invalid: Optional[int] = None,
    groups: Optional[int] = None,
) -> HTMLResponse:
    with db.connection() as conn:
        settings = db.get_settings(conn)
    return templates.TemplateResponse(
        request,
        "settings.html",
        {
            "settings": settings,
            "gap_hours": settings.min_gap_minutes // 60,
            "gap_minutes": settings.min_gap_minutes % 60,
            "imported": imported,
            "skipped": skipped,
            "invalid": invalid,
            "groups": groups,
        },
    )


@app.post("/settings", response_class=HTMLResponse)
async def update_settings(
    max_per_day: int = Form(...),
    min_gap_minutes: int = Form(...),
) -> RedirectResponse:
    with db.connection() as conn:
        db.set_setting(conn, "max_per_day", str(max_per_day))
        db.set_setting(conn, "min_gap_minutes", str(min_gap_minutes))
    return RedirectResponse(url="/settings", status_code=303)


@app.get("/settings/export")
async def export_settings_route() -> Response:
    """Export full backup as zip: settings.json + lessons.json + knowledge.json."""
    with db.connection() as conn:
        data = db.create_backup_zip(conn)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=devcoach-backup.zip"},
    )


@app.post("/settings/import")
async def import_settings_route(file: UploadFile = File(...)) -> RedirectResponse:
    """Restore from a backup zip. Restores settings, knowledge map, and imports lessons."""
    content = await file.read()
    with db.connection() as conn:
        result = db.restore_backup_zip(conn, content)
    return RedirectResponse(url=f"/settings?imported={result['lessons']}&skipped={result['skipped']}&invalid={result['invalid']}&groups={result['groups']}", status_code=303)
