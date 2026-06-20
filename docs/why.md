# Why devcoach

AI agents now write a large share of the code we ship. They scaffold features, fix bugs, choose libraries,
and explain themselves convincingly while doing it. The productivity is real — but so is a quieter cost:
when the machine does the thinking, it is easy to accept the result and learn nothing from it. Velocity
goes up; understanding slowly goes down. You can spend a year shipping faster than ever and come out the
other side knowing less about your own stack than when you started.

devcoach exists to break that trade-off. Instead of sending you off to "find time" for a course you will
never take, it treats the work you are *already doing* as the curriculum. After your agent completes a
real task, devcoach delivers one short, targeted lesson about something that task touched — calibrated to
what you already know, in the context where it actually matters. It is learning on the job, automated:
the lesson arrives at the exact moment the concept is concrete, then gets out of your way.

That is the everyday value. But there is a larger reason the project exists, and it gets more important
with every model release.

## We're learning differently now

There is a behavioural shift underneath all of this. We used to learn a thing *before* we used it — skim
the docs, work an example, build the mental model first. Increasingly we don't: if the agent can already
do it, studying it up front feels like wasted effort. It is the same trade we made when search engines
replaced the trip to the library — why hold in your head what you can look up on demand?

And most days that is fine. You skip the deep dive, the task ships, the tests pass, you move on. The
problem is not any single skipped dive; it is what their accumulation quietly costs you.

## The thing we quietly stand to lose

The headline worry about AI is that it will be *wrong*. The deeper worry is that we will gradually lose the
ability to *tell when it is wrong*. Validation — reading a diff and knowing it's subtly off, smelling a
design that will not scale, recognizing the security hole the model didn't mention — is a skill, and skills
decay when they go unused. As more work is delegated, fewer people exercise the judgment that catches the
mistakes. The failure mode isn't a dramatic one; it's a slow erosion where the human in the loop is still
*present* but no longer actually *able* to evaluate what they're approving.

The expertise we stop maintaining is exactly the safety net that catches what the machine gets wrong. The
thing that makes AI-assisted development safe is not
the model's confidence — it's a human who still understands the fundamentals well enough to review, push
back, and override. Keeping that human sharp is not nostalgia for doing things by hand; it is the control
that makes delegation trustworthy in the first place.

## You can't cram competence

Skipping the deep dive works right up until the day it doesn't. Sooner or later you hit the thing the model
can't carry for you — a correctness bug hiding behind passing tests, a 2 a.m. outage, an architectural call
the AI gets confidently wrong — and you have to go deep yourself. In that moment the competence either
exists or it doesn't, and it is not something you can summon on demand.

Real understanding is built slowly: time spent on the problem, mistakes made and felt, the work of figuring
out *why* they were mistakes, and the small growth that follows. You can't compress that into the hour you
suddenly need it. That is the case for learning a little continuously now — so the depth is already there
when the stakes are high, instead of missing exactly when it counts most.

## The why, and the wrong answers too

This is also why devcoach teaches more than the right answer. Knowing *what* to do is brittle; knowing
*why* is what carries over to the next problem — so the lessons explain the reasoning, not just the fix.

It covers the wrong answers on purpose, too. One quiet effect of capable AI is that it spares you mistakes
you never even see — it simply doesn't write the race condition, the N+1 query, the insecure default. That
feels like a gift, but you also never learn why those are wrong, so you can't recognise them when one does
slip through. Having understood a failure mode — ideally by having met it — is what lets you catch it
later. devcoach surfaces the anti-patterns deliberately, because the mistakes you understand are the ones
you can prevent.

## Teacher today, hedge for tomorrow

devcoach plays both roles at once. Day to day it is a teacher — a patient maestro that grows your
competence a little with every task, the *why* behind the fix and the failure modes to watch for, so you
understand more of what you ship rather than less. Over the long run it is a hedge: a steady, low-friction
way to keep developers fluent enough to validate AI output, precisely as that ability becomes harder to
maintain and more valuable to have.

It is deliberately small and unobtrusive — one lesson at a time, rate-limited, entirely local, nothing to
open. The bet is simple: a few minutes of genuine learning, delivered in context and spaced out over the
work you already do, compounds. The developers who keep learning while the tools get stronger are the ones
who stay in control of the result.

---

## devcoach vs. other approaches

| Approach | Pros | Cons |
|----------|------|------|
| **devcoach** | On-demand, in-context, zero friction, local, calibrated to your stack | Requires AI agent with MCP support |
| **Online courses** | Comprehensive, structured, often free | Deferred, generic, easy to procrastinate on |
| **Reading docs / StackOverflow** | Fast lookup | Surface-level, no learning architecture, no retention |
| **AI explanations (Copilot inline)** | Immediate, contextual | Often just answers the question, not the "why" or anti-patterns |
| **Books & deep dives** | Deep, thorough, timeless | Require sustained time you don't have; easy to skip |
| **Doing nothing** | No friction | Skill erosion; can't validate what ships |

devcoach targets the gap: sustained learning at low friction, spaced and calibrated, without opening another tab.

---

→ See [How it works](./how-it-works.md) for the decision flow, or [install devcoach](./install/index.md)
to connect it to your agent.
