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
    sorted_knowledge = sorted(knowledge.items(), key=lambda x: -x[1])
    return templates.TemplateResponse(
        "profile.html",
        {"request": request, "knowledge": sorted_knowledge},
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
) -> HTMLResponse:
    conn = _get_conn()
    lessons = db.get_lessons(conn, period=period, category=category)
    all_categories = db.get_all_categories(conn)
    conn.close()
    return templates.TemplateResponse(
        "lessons.html",
        {
            "request": request,
            "lessons": lessons,
            "all_categories": all_categories,
            "selected_period": period or "all",
            "selected_category": category or "",
        },
    )


@app.get("/lessons/{lesson_id}", response_class=HTMLResponse)
async def lesson_detail_page(request: Request, lesson_id: str) -> HTMLResponse:
    conn = _get_conn()
    lesson = db.get_lesson_by_id(conn, lesson_id)
    conn.close()
    if lesson is None:
        return HTMLResponse("<h1>Lesson not found</h1>", status_code=404)
    return templates.TemplateResponse(
        "lesson_detail.html",
        {"request": request, "lesson": lesson},
    )


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request) -> HTMLResponse:
    conn = _get_conn()
    settings = db.get_settings(conn)
    conn.close()
    return templates.TemplateResponse(
        "settings.html",
        {"request": request, "settings": settings},
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
