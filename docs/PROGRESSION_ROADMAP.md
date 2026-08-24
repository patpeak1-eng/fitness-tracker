# Smart Progression — Staged Roadmap

Captured S27. Each stage depends on the one before it being trustworthy.
Do not skip stages: confident advice built on bad data is worse than none.

## Why staging matters (the S27 lesson)

The progression engine (WorkoutContext.jsx finishWorkout) was fully built and
correct for months, and never fired once. GuidedWorkoutView's set checkbox
wrote `completed: true` but never wrote `reps`, so every set in app history
recorded reps = 0. The engine compared 0 >= targetReps on every set ever
logged. Volume, e1RM, PRs, and the Progress charts all computed confidently
on zeros. Nobody noticed.

The failure was silent because every layer above the broken one kept
producing plausible output. Any proactive system built on unverified data
repeats this at higher cost — it would have told users to deload lifts they
were actually progressing on.

## Stage 1 — Data integrity  [LARGELY COMPLETE, S26/S27]

- ACTUAL reps capture (S26) — inline numeric input, empty is not zero, 0 valid
- Work timer scoped to duration exercises only (S26)
- Template save from prep with real weights (S26)
- Sliding session so auth cannot expire mid-workout (S27)
- SyncQueue dead-letter — no silent discard of finished workouts (S27)
- PWA prompt-mode updates + build SHA in Settings (S26)
- DOB selects and IME dismissal on reps entry (S27)

Remaining: template save must update in place; reps verified end-to-end on
real hardware.

## Stage 2 — Recommendations that actually work  [NEXT]

Detection is correct. Everything downstream of detection is broken or missing.

Known defects:
- applyProgression (WorkoutContext.jsx:1923) guards on activeWorkout, but
  finishWorkout sets it to null. The Apply button on WorkoutSummary is dead
  on every path. Silent no-op.
- Applying writes one set index via syncToTemplate using the LAST working
  set's id. Sets 1..n-1 never move. Repeated application makes the final set
  diverge from the rest indefinitely.
- Only one branch exists: hit target -> add weight. Missing a target produces
  nothing. No hold, no deload.
- Recommendations surface once on the summary and are otherwise reachable
  only inside a specific history entry.

Decisions made (Patrick, S27):
- Apply writes ALL working sets to the new weight, not just the last.
- Single missed target -> hold at current weight.
- Two consecutive missed targets -> suggest a deload (~10%).
- Progression stays a user tap. Never automatic.

Planned additions:
- Rep ranges (targetRepsMin / targetRepsMax) so double progression can
  recommend "add a rep" before "add weight" — the smallest viable step, and
  the correct answer to "the jump might be too big at once".
- Equipment-aware increments. Equipment profiles already exist; the app must
  not recommend +2.5 lbs on dumbbells that only come in 5 lb steps. Barbell,
  dumbbell, and machine each have different real-world granularity. This is a
  genuine differentiator vs. Hevy and Strong.
- Surface recommendations on the Progress page, not only post-workout.

## Stage 3 — Coach reads progression data  [SMALL, HIGH LEVERAGE]

The AI Coach is already backend-proxied with workout context. Progression
recommendations are one more field in that payload.

Unlocks: "Why add weight on curls but not bench?" "Am I stalling?" "Should I
deload?" — answered against real training data instead of generic advice.

Cheapest item here relative to what it delivers.

## Stage 4 — Proactive monitoring  [FUTURE — gated on 1-3]

The app reaches out unprompted: stall detection, trend analysis, deload
suggestions, volume warnings, a notification surface.

Do not start until Stages 1-3 are verified with real data across more than
one user. Proactive advice on unverified data is actively harmful — it
destroys trust in a way silent wrong numbers do not, because the user is told
something specific and false.

Requires: stall/trend detection rules, a notification surface, tuning so it is
not noisy, and enough logged history per user to be meaningful.

## Product intent

Patrick's stated goal: the app should do most or all of the heavy lifting for
the user's training decisions — more advanced and more intelligent than
anything currently available. Stage 4 is where that becomes literal. Stages
1-3 are what make it safe to attempt.
