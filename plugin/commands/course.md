---
description: Start (or continue) a step-by-step course from a lesson you couldn't follow, or on any concept
argument-hint: [last | <lesson id> | about <topic> | <a concept>] [continue]
allowed-tools: mcp__plugin_devcoach_devcoach__create_course, mcp__devcoach__create_course, mcp__plugin_devcoach_devcoach__add_course_step, mcp__devcoach__add_course_step, mcp__plugin_devcoach_devcoach__update_course_progress, mcp__devcoach__update_course_progress, mcp__plugin_devcoach_devcoach__get_courses, mcp__devcoach__get_courses, mcp__plugin_devcoach_devcoach__get_lessons, mcp__devcoach__get_lessons, mcp__plugin_devcoach_devcoach__get_briefing, mcp__devcoach__get_briefing, mcp__plugin_devcoach_devcoach__submit_feedback, mcp__devcoach__submit_feedback
---

Run a devcoach course, following the devcoach skill's `references/course.md` exactly. Resolve the
seed from $ARGUMENTS: `continue` → `get_courses` with `status: "active"` and resume at its first
`todo` step; empty or `last` → the newest lesson marked couldn't-follow (`get_lessons` with
`feedback: "dont_know"`, `limit: 1`), else the newest lesson; a lesson id → that lesson; `about
<topic>` → `get_lessons` with `search` (if several match, list title + date and ask); any other
text → a free concept with no seed lesson. Read `get_briefing` once, then explore the
prerequisites ONE yes/no question per message until you reach something the user knows, call
`create_course` with the chain, write the single HTML document at the returned `document_path`
with your file tools (self-contained, no external URLs, no fetch, no forms), register each section
with `add_course_step`, and teach one step per message, marking progress with
`update_course_progress`. At the end, if the course grew from a lesson, offer once to mark it
understood with `submit_feedback`. Do nothing else.
