---
title: Why devcoach
description: AI writes more of our code, so the scarce skill is checking what it ships. devcoach keeps it alive with short lessons on your own work.
keywords: [why devcoach, AI and developer skills, skill erosion, validating AI code, continuous learning for developers]
---

# Why devcoach

import { Card, Cards } from "@site/src/components/Cards";
import ValidationGap from "@site/src/components/ValidationGap";
import TwoSpeeds from "@site/src/components/TwoSpeeds";

**In short**

<Cards columns={3}>
<Card title="The risk" to="#the-thing-we-quietly-stand-to-lose">

AI writes more and more of our code. Lean on it without learning, and you slowly lose the judgment to
check what it ships.

</Card>
<Card title="Why now" to="#you-cant-cram-competence">

Competence is built slowly. You can't cram it the night of the outage.

</Card>
<Card title="What devcoach does">

Short lessons drawn from your agent's own tasks, on what you don't know yet, at your level. The pace
is yours to set.

[How it works →](./how-it-works.md)<br />
[How it compares ↓](#devcoach-vs-other-approaches)

</Card>
</Cards>

AI agents now write a large share of the code we ship. They scaffold features, fix bugs, choose libraries,
and explain themselves convincingly while doing it. The productivity is real — but so is a quieter cost:
when the machine does the thinking, it is easy to accept the result and learn nothing from it. Velocity
goes up; understanding slowly goes down. You can spend a year shipping faster than ever and come out the
other side knowing less about your own stack than when you started.

devcoach exists to break that trade-off. Instead of sending you off to "find time" for a course you will
never take, it treats the work you are *already doing* as the curriculum. After your agent completes a
real task, and when a lesson is due, devcoach delivers one short, targeted lesson about something that
task touched and you don't know yet — pitched at your level, in the context where it actually matters.
It is learning on the job,
automated: the lesson arrives at the exact moment the concept is concrete, then gets out of your way.

## We're learning differently now

There is a behavioural shift underneath all of this. We used to learn a thing *before* we used it — skim
the docs, work an example, build the mental model first. Increasingly we don't: if the agent can already
do it, studying it up front feels like wasted effort. It is the same trade we made when search engines
replaced the trip to the library — why hold in your head what you can look up on demand?

And most days that is fine. You skip the deep dive, the task ships, the tests pass, you move on. Each
skipped dive is harmless on its own; together they quietly cost you.

## The thing we quietly stand to lose

The headline worry about AI is that it will be *wrong*. The deeper worry is that we will gradually lose the
ability to *tell when it is wrong*.

<ValidationGap />

Validation — reading a diff and knowing it's subtly off, smelling a
design that will not scale, recognizing the security hole the model didn't mention — is a skill, and skills
decay when they go unused. As more work is delegated, fewer people exercise the judgment that catches the
mistakes. The failure is quiet, a slow erosion: the human in the loop is still *present* but no
longer actually *able* to evaluate what they're approving.

The expertise we stop maintaining is exactly the safety net that catches what the machine gets wrong. What
makes AI-assisted development safe is a human who still understands the fundamentals well enough to
review, push back, and override. Keeping that human sharp is the control that makes delegation
trustworthy in the first place.

## Fast judgment runs on slow thinking

The psychologist Daniel Kahneman describes two ways we think, in his research[^kahneman-2002] and in the
book that made it widely known, *Thinking, Fast and Slow*.[^kahneman-2011] **Fast thinking** is
automatic and takes almost no effort: you glance at a diff and something looks off. **Slow thinking** is
deliberate and takes effort: you trace the code path, hold the edge cases in your head and work out why.
He calls the two "fictitious characters":[^winerman-2012] a way to talk about how the mind works.

<TwoSpeeds />

The two are linked. Fast judgment in a field is what long, effortful practice[^ericsson-1993] leaves
behind: skill makes the useful response come to mind by itself.[^kahneman-2002] Kahneman and Gary Klein,
who studied expert intuition from opposite sides, agreed on when a gut feeling deserves
trust:[^kahneman-klein-2009] when the field is regular enough to learn from, and when you have had the
chance to learn it. They also concluded that how sure a judgment feels says little about how accurate it
is.[^kahneman-klein-2009]

An agent changes who does which part. It does the slow work: it reads the code, weighs the options and
finds the bug. You keep the fast part: a look at the diff, then "approve". Nothing warns you when this
starts to cost you. The review can feel as sure as ever while the practice that trained it now happens
somewhere else.

The pattern is older than AI, and controlled experiments with AI assistants now point the same way.

<Cards columns={3}>
<Card title="Factory operators" label="1983">

Operators left to watch an automated process stop practicing the skills they need when they have to
step in.[^bainbridge-1983]

</Card>
<Card title="Students" label="2025">

Students who practiced math with a standard chatbot did worse once it was taken away than students who
never had it. A tutor built to protect learning largely avoided that.[^bastani-2025]

</Card>
<Card title="Developers" label="2026">

Developers who learned a new library with AI assistance came away with weaker understanding, code
reading and debugging. Those who stayed engaged with the problem kept their learning.[^shen-tamkin-2026]

</Card>
</Cards>

No study has tested devcoach itself. What it does follows from these: it hands a little of the slow part
back. When [a lesson](./usage/coaching.md#your-first-lesson) is due, it asks for a short stretch of slow
thinking on something the task just touched: why it is right, how it goes wrong, and, with the question
at the end, whether you followed.

## You can't cram competence

Skipping the deep dive works right up until the day it doesn't. Sooner or later you hit the thing the model
can't carry for you — a correctness bug hiding behind passing tests, a 2 a.m. outage, an architectural call
the AI gets confidently wrong — and you have to go deep yourself. In that moment the competence either
exists or it doesn't, and it is not something you can summon on demand.

Real understanding is built slowly: time spent on the problem, mistakes made and felt, the work of figuring
out *why* they were mistakes, and the small growth that follows. You can't compress that into the hour you
suddenly need it. That is the case for learning a little continuously now — so the depth is already there
when the stakes are high, instead of missing exactly when it counts most.

When a lesson is more than one session can carry, answer ❌ *couldn't follow* and devcoach offers to
turn it into a step-by-step [course](./usage/courses.md) that starts from what you already know.

## The why, and the wrong answers too

This is also why devcoach teaches more than the right answer. Knowing *what* to do is brittle; knowing
*why* is what carries over to the next problem — so the lessons explain the reasoning, not just the fix.

It covers the wrong answers on purpose, too. One quiet effect of capable AI is that it spares you mistakes
you never even see — it simply doesn't write the race condition, the N+1 query, the insecure default. That
feels like a gift, but you also never learn why those are wrong, so you can't recognise them when one does
slip through.

Having understood a failure mode — ideally by having met it — is what lets you catch it
later. devcoach surfaces the anti-patterns deliberately, because the mistakes you understand are the ones
you can prevent.

## Teacher today, hedge for tomorrow

Day to day devcoach is a teacher. Over the long run it is a hedge: a steady, low-friction way to keep
developers fluent enough to validate AI output, precisely as that ability becomes harder to maintain and
more valuable to have.

It is deliberately small and unobtrusive — one lesson at a time, rate-limited, running on your machine,
nothing to open. The bet is simple: a few minutes of genuine learning, delivered in context and spaced out over the
work you already do, compounds. The developers who keep learning while the tools get stronger are the ones
who stay in control of the result.

---

## devcoach vs. other approaches

| Approach | Pros and cons |
|----------|---------------|
| **devcoach** | **Pros:** in context, after real work (or when you ask); skips what you already know; paced, and calibrated to your stack and level; runs on your machine.<br />**Cons:** needs an AI agent with MCP support; automatic lessons only in Claude Code, Gemini CLI and Codex CLI (elsewhere you ask); a lesson only when one is due, at most 2 a day by default; written by your agent's model, so a lesson can be wrong too. |
| **Online courses** | **Pros:** comprehensive, structured, often free.<br />**Cons:** deferred, generic, easy to procrastinate on. |
| **Reading docs / StackOverflow** | **Pros:** fast lookup; official docs are the authoritative source.<br />**Cons:** you only read what you think to look up; nothing tracks what you learned. |
| **Asking your agent to explain** | **Pros:** immediate, in context.<br />**Cons:** only when you think to ask; the why and the pitfalls only if you ask for them; no memory of what you already know. |
| **Books & deep dives** | **Pros:** deep, thorough, timeless.<br />**Cons:** require sustained time you don't have; easy to skip. |
| **Doing nothing** | **Pros:** no friction.<br />**Cons:** skill erosion; can't validate what ships. |

devcoach targets the gap: sustained learning at low friction, spaced and calibrated, without opening another tab.

---

→ See [How it works](./how-it-works.md) for the decision flow, or [install devcoach](./install/index.md)
to connect it to your agent.

{/* References: the site lists these notes, cited above as [^…], at the end of the page under "References".
    Each one was checked at its source (Crossref, PubMed, arXiv, the publisher's or author's page) and says
    whether it is free to read. Keep that up when you add one. */}

[^kahneman-2002]: Kahneman, D. (2002). [Maps of bounded rationality: A perspective on intuitive judgment and choice](https://www.nobelprize.org/uploads/2018/06/kahnemann-lecture.pdf). Nobel Prize lecture, 8 December 2002. Free to read (PDF). The journal article on the same ground: Kahneman, D. (2003). A perspective on judgment and choice: Mapping bounded rationality. *American Psychologist*, 58(9), 697–720. [doi:10.1037/0003-066X.58.9.697](https://doi.org/10.1037/0003-066X.58.9.697). Behind a paywall; [the abstract is free](https://pubmed.ncbi.nlm.nih.gov/14584987/).

[^kahneman-2011]: Kahneman, D. (2011). *Thinking, Fast and Slow*. Farrar, Straus and Giroux. ISBN 978-0-374-27563-1. A book, not free to read; [about it on Wikipedia](https://en.wikipedia.org/wiki/Thinking,_Fast_and_Slow).

[^winerman-2012]: Winerman, L. (2012). [A machine for jumping to conclusions](https://www.apa.org/monitor/2012/02/conclusions). *Monitor on Psychology*, 43(2), 24. Free to read. An interview with Kahneman, who says of the two systems: "They are expository fictions, and I write the book as a psychodrama between two fictitious characters."

[^ericsson-1993]: Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). The role of deliberate practice in the acquisition of expert performance. *Psychological Review*, 100(3), 363–406. [doi:10.1037/0033-295X.100.3.363](https://doi.org/10.1037/0033-295X.100.3.363). Behind a paywall.

[^kahneman-klein-2009]: Kahneman, D., & Klein, G. (2009). Conditions for intuitive expertise: A failure to disagree. *American Psychologist*, 64(6), 515–526. [doi:10.1037/a0016755](https://doi.org/10.1037/a0016755). Behind a paywall; [the abstract is free](https://pubmed.ncbi.nlm.nih.gov/19739881/).

[^bainbridge-1983]: Bainbridge, L. (1983). Ironies of automation. *Automatica*, 19(6), 775–779. [doi:10.1016/0005-1098(83)90046-8](https://doi.org/10.1016/0005-1098(83)90046-8). Behind a paywall; [summary on Wikipedia](https://en.wikipedia.org/wiki/Ironies_of_Automation).

[^shen-tamkin-2026]: Shen, J. H., & Tamkin, A. (2026). [How AI impacts skill formation](https://arxiv.org/abs/2601.20245). arXiv:2601.20245. Free to read. A preprint.

[^bastani-2025]: Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). [Generative AI without guardrails can harm learning: Evidence from high school mathematics](https://doi.org/10.1073/pnas.2422633122). *Proceedings of the National Academy of Sciences*, 122(26), e2422633122. Free to read.
