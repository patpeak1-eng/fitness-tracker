# AI Coach Expansion Specification — S24

Status: approved for implementation by Patrick on 2026-08-16.

## 1. Outcome

Turn the AI Coach from a conversational advisor into a safe, app-aware
assistant that can:

1. reason over long-term fitness and nutrition progress without sending years
   of raw rows to the model on every turn;
2. propose a workout from a spoken or typed request using only exercises that
   exist in the app and equipment that is currently available;
3. hand the proposal back to the app as a reviewable workout that the user can
   start immediately or save as a template; and
4. inspect a photo of available equipment, let the user correct the result,
   and use the confirmed equipment for the current environment.

The Coach may propose actions. The React app remains the authority that
validates and performs mutations after explicit user confirmation.

## 2. Long-term data policy

- Workout history, weight history, assessments, and food logs remain stored
  until the user deletes individual data or their account.
- Cloud hydration must pull complete food and workout history. The former
  90-day food window and single 50-workout page are removed; they were device-
  sync limits, not retention policies.
- The Coach receives recent detail plus compact long-term aggregates:
  - workouts: 10 newest workouts in detail, with 28/90/365-day and all-time
    frequency, completed-workout, exercise-set, and training-volume summaries;
  - nutrition: 7-day detail-free average plus 28/90/365-day and all-time
    calorie/protein averages;
  - weight: current/latest value, change over 28/90/365 days, and all-time;
  - assessments, custom templates, and custom exercises: compact current
    summaries, not unrestricted raw database dumps.
- The existing nutrition safety boundary remains: estimates are not medical
  advice and the Coach does not pretend that photo-derived nutrition is exact.

## 3. Coach app context

`POST /api/coach/chat` accepts an optional `app_context` snapshot from the
authenticated frontend. It is capped and validated, and contains only the
current app state the backend cannot otherwise derive cheaply:

- compatible exercise catalog (id, name, muscle, category, equipment);
- active equipment profile and confirmed equipment list;
- current nutrition targets and selected app preferences when relevant.

The backend remains authoritative for durable user records and assembles the
long-term summaries from PostgreSQL.

## 4. Structured workout proposal

The Coach receives a `propose_workout` Anthropic tool. When the user asks it to
build or revise a workout, it may return:

- workout name and short rationale;
- ordered exercises identified by existing app exercise id;
- set count, target reps or duration, rest time, and optional coaching note.

Server validation drops unknown exercise ids and clamps unsafe or nonsensical
numeric ranges. The SSE response emits a `workout_plan` event. The frontend
renders a preview with two explicit actions:

- **Start workout** — converts the proposal to the existing template shape and
  calls `startWorkoutFromTemplate`;
- **Save template** — calls the existing cloud-aware `saveCustomTemplate`.

No workout is created merely because the model emitted a proposal.

## 5. Equipment photo workflow

`POST /api/coach/equipment/analyze` accepts the same downscaled base64 image
shape used by nutrition photo analysis. Claude Vision returns only canonical
equipment terms understood by the app. The image is transient and is never
stored.

The Coach page provides camera/file capture, a review list, manual additions
and removals, and an environment name. Confirming the review activates the
equipment as the session override and makes it available to subsequent Coach
requests. The existing saved Full Gym/Home Gym/Fire Station/Bodyweight/Custom
profiles remain unchanged and available.

Named photo environments are stored profile-locally in this iteration. Their
confirmed equipment is sent with every Coach request, so the Coach has current
access even though the image itself is discarded. Cross-device named-
environment persistence is a follow-up; it is deliberately not coupled to the
first workout-action release.

## 6. Safety and privacy

- All Coach and equipment-analysis endpoints require the current authenticated
  user and retain existing per-user cost limits.
- Equipment images are not persisted.
- Model output cannot directly mutate app state.
- Only existing exercise ids may be started or saved.
- The UI discloses that photo detection can be incomplete and requires review.
- Medical/injury questions retain the existing professional-care boundary.

## 7. Files and architecture impact

Expected changes:

- `backend/app/routers/coach.py`: long-term context, tool output, equipment
  vision endpoint, and colocated typed request/response models matching the
  existing Coach route pattern;
- `src/services/ApiService.js`: expanded Coach request and equipment analysis;
- `src/context/WorkoutContext.jsx`: complete food pull and named local equipment
  environments;
- `src/services/StorageService.js`: profile-scoped environment persistence;
- `src/pages/CoachView.jsx` and `.css`: plan preview/actions and equipment photo
  review;
- tests for summary aggregation and plan validation where practical;
- `docs/ARCHITECTURE.md` and `SESSION_START.md`: update in the implementation
  commits.

No database migration is required for this release.

## 8. Done means

1. The Coach can receive compact all-time/365/90/28-day progress summaries.
2. A spoken or typed workout request can produce a validated plan card.
3. The plan can start a workout or save a template only after confirmation.
4. A camera/file photo can produce editable equipment detection; confirming it
   affects the next plan request.
5. Cloud hydration no longer excludes food entries older than 90 days or
   workouts beyond the newest API page.
6. Existing chat streaming, voice playback, workout tracking, nutrition entry,
   offline use, and cloud sync continue to work.
7. Lint, unit tests, production build, backend compile/tests, live health, and
   live Coach UI verification pass after deployment.
