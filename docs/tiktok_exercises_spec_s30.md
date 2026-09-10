# Spec — Video-sourced exercises and templates, first video (S30)

> **STATUS: DRAFT — awaiting owner confirmation of §3 identifications and the
> §7 decisions, then plan-stage cross-review.** No code written.

**Zone:** MEDIUM. Edits `src/context/WorkoutContext.jsx` (the single-writer
file) and adds assets under `public/illustrations/`. No auth, schema, user
data, or `ApiService.js`. Spec-first and plan review apply; the two literal
clearance phrases do not, but the owner still signs off before commit.

**Owner's intent (2026-09-10):** add exercises found in short workout videos
as (a) individual library exercises and (b) a pre-loaded template per video,
matching the existing data format and illustration style exactly. **Never
use the creator's footage or likeness** — take only the form and positions,
and render them as AI illustrations in the house style. One video at a time,
this one first.

---

## 1. Source

`https://www.tiktok.com/@starboy_camair/video/7676897102261193998` —
"Dumbbell full body workout", 29 s, 1080×1920, no speech (music only). All
detail is on-screen text plus a Fitbod app overlay visible on some segments.
Watched via the `/watch` skill: 28 frames at 1 s intervals, transcript
confirmed empty.

Fitbod overlay (where visible): **4 sets × 10 reps at 25 lb, 1:15 rest**.

## 2. How the existing data is shaped (verified)

**Exercise** — `DEFAULT_EXERCISES`, `WorkoutContext.jsx:50-125`, 73 entries:

```
{ "id": "wt_ohp", "name": "Overhead Press", "category": "Weights",
  "primary_muscle": "Shoulders", "equipment": "Barbell/Dumbbells",
  "instructions": "<one sentence, imperative, cue-focused>",
  "illustration": "/illustrations/wt_ohp.jpg" }
```

Optional flags: `"isBodyweight": true` (22 entries — gates the exercise out
of weight recommendations, per S27), `"isDurationBased": true` (Plank, Side
Plank, Bear Crawl, Hollow Hold, Wall Sit — the guided view then treats the
set's rep target as seconds).

Id prefixes: `wt_` weights, `cal_` calisthenics. Category values in use:
Weights / Calisthenics / Cardio / Yoga. Primary-muscle values: Abs, Arms,
Back, Cardio, Chest, Full Body, Legs, Recovery, Shoulders. Equipment is a
free string; `"Dumbbells"` is used by 8 entries.

**Template** — `DEFAULT_TEMPLATES`, `WorkoutContext.jsx:172-270`:

```
{ id: 'powerhouse', name: 'The Powerhouse',
  exercises: [ 'wt_deadlift', ... ],   // bare id, OR
               { id, sets: N },        // set count, OR
               { id, sets: [ { targetReps, weight }, ... ] } ],  // per-set
  sets: 3, equipmentTier: 'full_gym', estimatedDuration: 55 }
```

Per-exercise rep schemes are therefore expressible without any schema
change (`startWorkoutFromTemplate`, `:1477-1512`). For a duration-based
exercise, `targetReps` is read as seconds (`GuidedWorkoutView.jsx:263`).

**Illustration** — `public/illustrations/<id>.jpg`, **1400×700**, and every
surface renders through the single `ExerciseIllustration.jsx` component.
`docs/skills/exercise-visual-contract.md` governs the contract.

### House illustration style (from viewing `cal_v_up.jpg`, `wt_lunge.jpg`)

- Landscape triptych: three equal vertical panels, thin dark dividers.
- Pure black studio background; dark rubber gym mat beneath the subject.
- One photorealistic athletic man, same person in every image: short dark
  hair, trimmed beard, fitted black t-shirt, black shorts, black trainers
  with white soles (black socks, no shoes, for floor work).
- Soft directional studio light from the side; subject shown side-on or
  three-quarter; consistent camera height across panels.
- Each panel is one phase of the movement, labelled bottom-centre in white
  uppercase sans-serif: e.g. START / RISE / TOP, START / STEP / BOTTOM.
- Equipment rendered as black hex dumbbells.

## 3. The workout, as read from the frames

| # | Time | On-screen | Overlay label | What the frames show | Library status |
|---|---|---|---|---|---|
| 1 | 0:01–0:05 | 4 × 10-12 (5-6 each side) | Dumbbell Thruster | Dumbbells racked at shoulders, front squat, drive up and press **one** dumbbell overhead; alternate sides each rep | **New** |
| 2 | 0:06–0:09 | 4 × 6-10 | Gorilla Rows | Wide stance, deep hinge, both dumbbells on the floor; row one dumbbell to the hip while the other stays planted; alternate | **New** — existing Single Arm Row is bench-supported, a different movement |
| 3 | 0:10–0:15 | 4 × 8-10 | *(none)* | Hinge with dumbbells at shins → clean to shoulders → front squat → stand → lower and repeat | **New — identification uncertain.** Best read: *Dumbbell Squat Clean* (clean-to-front-squat complex). Owner to confirm |
| 4 | 0:16–0:18 | 4 × 20 | V-Up | V-up holding **one dumbbell in both hands**, touching it to the feet at the top | **Exists** as `cal_v_up` (bodyweight). See §7 Q2 |
| 5 | 0:19–0:24 | 4 × 8-10 | *(none)* | Push-up with hands on dumbbells → feet hop in → stand with dumbbells → alternating reverse lunge → back to the floor | **New — identification uncertain.** Best read: *Dumbbell Push-up to Reverse Lunge* (a Man Maker variant without the row and press). Owner to confirm |
| 6 | 0:25–0:28 | 4 × 30 secs | *(none)* | Both dumbbells locked out overhead, wide stance, isometric hold | **New**, `isDurationBased` |

Two identifications are flagged uncertain because the video gives no label
for them and the movements are compound. Everything else is read directly
from on-screen text or the Fitbod label.

## 4. Proposed additions

Five new exercises (ids provisional; `wt_` because all are dumbbell work):

| id | name | primary_muscle | flags |
|---|---|---|---|
| `wt_db_thruster` | Dumbbell Thruster | Full Body | — |
| `wt_gorilla_row` | Gorilla Row | Back | — |
| `wt_db_squat_clean` | Dumbbell Squat Clean | Full Body | — |
| `wt_pushup_lunge` | Dumbbell Push-up to Reverse Lunge | Full Body | — |
| `wt_overhead_hold` | Overhead Dumbbell Hold | Shoulders | `isDurationBased` |

Plus, depending on §7 Q2, `wt_v_up` "Weighted V-Up" (Abs).

All `category: "Weights"`, `equipment: "Dumbbells"`, one-sentence imperative
`instructions` in the existing voice, `illustration` at
`/illustrations/<id>.jpg`.

One new template:

```
{ id: 'dumbbell_full_body', name: 'Dumbbell Full Body',
  exercises: [
    { id: 'wt_db_thruster',    sets: [ {targetReps: 12}, ×4 ] },
    { id: 'wt_gorilla_row',    sets: [ {targetReps: 10}, ×4 ] },
    { id: 'wt_db_squat_clean', sets: [ {targetReps: 10}, ×4 ] },
    { id: <v-up id>,           sets: [ {targetReps: 20}, ×4 ] },
    { id: 'wt_pushup_lunge',   sets: [ {targetReps: 10}, ×4 ] },
    { id: 'wt_overhead_hold',  sets: [ {targetReps: 30}, ×4 ] }   // seconds
  ],
  sets: 4, equipmentTier: <see Q4>, estimatedDuration: 40 }
```

Rep targets take the top of each on-screen range. Weight left unset so the
app's smart-load from history applies (§7 Q3).

Six illustrations to generate in the house style, one per new exercise.

## 5. Verification plan

- `DEFAULT_EXERCISES` count and `public/illustrations/` file count both
  increase by the same number; every new `illustration` path resolves to a
  file (the visual-contract check).
- `npm run dev`, then a Python Playwright script (installed: 1.49.1 with
  Chromium) screenshots the library entry, the template card, the
  preparation screen, and the guided view for the hold — proving the
  duration path renders seconds, not reps.
- Start the template, confirm six exercises load with the right set counts.
- Deploy poll via `scripts/poll_deploy.sh`, then the same screenshots on the
  live URL.

## 6. Risks

| Risk | Mitigation |
|---|---|
| A generated illustration drifts from the house style and the library looks inconsistent | Side-by-side check against two existing images before commit; regenerate rather than accept |
| Wrong identification of #3 or #5 gets a wrong name and illustration into the library | Owner confirms §3 before any image is generated |
| `isDurationBased` + template `targetReps` semantics are inferred from one line of the guided view | Verify on dev before commit (§5) |
| `WorkoutContext.jsx` is 2972 lines and single-writer | Two contiguous insertions only; no other terminal on the file |

## 7. Decisions

1. **Confirm or correct #3 and #5.** Watching the video yourself takes 30
   seconds and settles both.
2. **The weighted V-up.** Reuse `cal_v_up` and lose the dumbbell (its
   bodyweight flag suppresses weight tracking), or add `wt_v_up` "Weighted
   V-Up" as a distinct exercise? **Recommend the new variant** — it is a
   genuinely different exercise and the flag makes reuse lossy.
3. **Preload 25 lb** from the creator's log, or leave weight unset and let
   smart-load use your own history? **Recommend unset.**
4. **Equipment tier** for a dumbbells-only template — see the value list
   the plan review will confirm.
5. **Credit the source?** A `source` field or a line in the template
   description naming the creator costs nothing and is honest; the owner
   said no creator imagery, which this respects. Recommend yes, text only.
6. **Who generates the illustrations.** Previous ones came from an AI image
   model driven by the owner. The plan review will establish whether the
   Codex reviewer can generate them directly; if not, this spec's §2 style
   block is the prompt for the owner to run.

## 8. Not in scope

Video or animated illustrations (owner: lower priority, separate
investigation). Other videos. Any change to how exercises or templates are
stored.
