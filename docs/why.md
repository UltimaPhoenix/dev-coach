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

## The thing we quietly stand to lose

The headline worry about AI is that it will be *wrong*. The deeper worry is that we will gradually lose the
ability to *tell when it is wrong*. Validation — reading a diff and knowing it's subtly off, smelling a
design that will not scale, recognizing the security hole the model didn't mention — is a skill, and skills
decay when they go unused. As more work is delegated, fewer people exercise the judgment that catches the
mistakes. The failure mode isn't a dramatic one; it's a slow erosion where the human in the loop is still
*present* but no longer actually *able* to evaluate what they're approving.

A field that stops learning loses its safety net. The thing that makes AI-assisted development safe is not
the model's confidence — it's a human who still understands the fundamentals well enough to review, push
back, and override. Keeping that human sharp is not nostalgia for doing things by hand; it is the control
that makes delegation trustworthy in the first place.

## Teacher today, hedge for tomorrow

devcoach plays both roles at once. Day to day it is a teacher — a patient maestro that grows your
competence a little with every task, so you understand more of what you ship rather than less. Over the
long run it is a hedge: a steady, low-friction way to keep developers fluent enough to validate AI output,
precisely as that ability becomes harder to maintain and more valuable to have.

It is deliberately small and unobtrusive — one lesson at a time, rate-limited, entirely local, nothing to
open. The bet is simple: a few minutes of genuine learning, delivered in context and spaced out over the
work you already do, compounds. The developers who keep learning while the tools get stronger are the ones
who stay in control of the result.

→ See [How it works](./how-it-works.md) for the decision flow, or [Get started](./getting-started.md) to
connect devcoach to your agent.
