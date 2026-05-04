# How it works

devcoach is a silent technical coach that hooks into every Claude response.
The diagrams below show the three main flows: session startup, the coaching loop,
and how a lesson topic is selected.

---

## Session startup

At the start of each Claude session devcoach checks whether the user is set up,
loads prior coaching context, and primes lesson selection before any task is done.

```mermaid
flowchart TD
    A([Session starts]) --> B[Read devcoach://onboarding]
    B --> C{needs_onboarding?}
    C -- Yes --> D{Existing backup\nto restore?}
    D -- Yes --> E[Restore backup\n→ mark onboarding done]
    D -- No --> F[Detect stack\nautomatically or manually]
    F --> G[Confirm topics + confidence\nPropose groups]
    G --> H[complete_onboarding]
    E & H --> I
    C -- No --> I[Read ~/.devcoach/learning-state.md]
    I --> J{Notebook\nnon-empty?}
    J -- Yes --> K[Load patterns, hypotheses\nand recommended angles]
    J -- No --> L[No prior context\nstart fresh]
    K & L --> M([Ready to coach])
```

---

## Coaching loop

After every technical task Claude evaluates whether to deliver a lesson.
The loop is silent when nothing is worth teaching or when the rate limit is reached.

```mermaid
flowchart TD
    A([Technical task\ncompleted]) --> B[Read devcoach://rate-limit]
    B --> C{Allowed?}
    C -- No\nnormal task --> Z([Silent —\nno lesson])
    C -- No\nexplicit request --> D
    C -- Yes --> D[Read profile\ntaught topics\ncoaching notebook]
    D --> E[Analyse task for\nteachable concepts]
    E --> F[Select topic\nsee Lesson selection]
    F --> G{Topic\nfound?}
    G -- No --> Z
    G -- Yes --> H[Compose lesson\ncalibrate depth per-topic]
    H --> I[log_lesson to MCP]
    I --> J([Lesson appears\nat end of response])
    J --> K{User\nfeedback}
    K -- ✅ know --> L{Confidence\nbelow level band?}
    L -- Yes --> M[submit_feedback\nconfidence +1]
    L -- No --> N[Skip — already calibrated]
    K -- ❌ don't know --> O[submit_feedback\nconfidence −1]
    K -- ⏭ skip --> P[No change]
    M & N & O & P --> Q{New observation\nworth saving?}
    Q -- Yes --> R[Write ~/.devcoach/\nlearning-state.md]
    Q -- No --> S
    R --> S([Loop ends])
```

---

## Lesson selection

When a teachable concept is found, devcoach picks the highest-priority angle
and calibrates the lesson level to the **per-topic** confidence score — not an average.

```mermaid
flowchart TD
    A([Concepts identified\nin current task]) --> B{Notebook flags\na follow-up angle\nrelevant to this task?}
    B -- Yes --> P1["① Deliver notebook\nfollow-up"]

    B -- No --> C{Pitfall on a\nprofile topic?}
    C -- Yes --> P2["② Profile pitfall"]

    C -- No --> D{Interesting pattern\non a profile topic?}
    D -- Yes --> P3["③ Profile pattern"]

    D -- No --> E{Off-profile concept\nprominent in task?}
    E -- Yes --> P4["④ Off-profile pitfall"]

    E -- No --> F{Profile topic with\nconfidence < 5?}
    F -- Yes --> P5["⑤ Knowledge gap"]

    F -- No --> G{Profile topic at\nconfidence 4–6?}
    G -- Yes --> P6["⑥ Deep-dive"]

    G -- No --> Z([Nothing to teach\n— stay silent])

    P1 & P2 & P3 & P4 & P5 & P6 --> L[Check taught-topics\nno repeats]
    L --> M{Already taught\nor confidence ≥ 10?}
    M -- Already taught\nnot confidence 10 --> Z
    M -- OK or\nconfidence = 10 --> N[Calibrate level\nper-topic confidence]
    N --> O([Compose and\ndeliver lesson])
```

---

## Depth calibration

The lesson level is determined by the confidence score for the **specific topic being taught**,
adjusted by observations in the coaching notebook.

| Confidence | Level | Lesson angle |
|---|---|---|
| 0 – 3 | Junior | Introduce correct practice, explain from scratch, use analogies |
| 4 – 6 | Mid | Explain the why, mention trade-offs and alternatives |
| 7 – 9 | Senior | Edge cases, historical context, architectural implications |
| 10 | Cutting-edge | Latest developments — ignores level floor and taught-topics filter |
