---
description: Start (or continue) a step-by-step course from a lesson you couldn't follow, or on any concept
argument-hint: "[last | a few words of the lesson's title | a concept] [continue]"
allowed-tools: mcp__plugin_devcoach_devcoach__create_course, mcp__devcoach__create_course, mcp__plugin_devcoach_devcoach__add_course_step, mcp__devcoach__add_course_step, mcp__plugin_devcoach_devcoach__update_course_progress, mcp__devcoach__update_course_progress, mcp__plugin_devcoach_devcoach__get_courses, mcp__devcoach__get_courses, mcp__plugin_devcoach_devcoach__get_lessons, mcp__devcoach__get_lessons, mcp__plugin_devcoach_devcoach__get_briefing, mcp__devcoach__get_briefing, mcp__plugin_devcoach_devcoach__submit_feedback, mcp__devcoach__submit_feedback
---

Run a devcoach course, following the devcoach skill's `references/course.md` exactly. Resolve the
seed from $ARGUMENTS: `continue` → `get_courses` with `status: "active"` and resume at its first
`todo` step; empty or `last` → the newest lesson marked couldn't-follow (`get_lessons` with
`feedback: "dont_know"`, `limit: 1`), else the newest lesson; anything else → first look for a
lesson it describes (`get_lessons` with `search` on its 2–3 most specific words, `limit: 5`): one
match is the seed, several are offered as choices plus "none — a free concept", none means a free
concept with no seed lesson; if a course already exists for that seed (`get_courses`), ask first
whether to continue, redo or keep both. Read `get_briefing` once, then explore the prerequisites ONE question
per message — offered as Yes / Roughly / No choices when the client has a question UI — until you
reach something the user knows, call `create_course` with the chain, write the single HTML document
at the returned `document_path` with your file tools (self-contained, one step shown at a time with
a side step menu, code in the seed's language, no external URLs, no fetch, no forms), register each
section with `add_course_step`, offer once to publish it as a Claude artifact if the Artifact tool
exists, and teach one step per message, marking progress with `update_course_progress`; a check
whose answer is a pick is asked as choices, one whose answer must be typed as text. At the end, if
the course grew from a lesson, offer once (Yes / No) to mark it understood with `submit_feedback`.
Do nothing else.
