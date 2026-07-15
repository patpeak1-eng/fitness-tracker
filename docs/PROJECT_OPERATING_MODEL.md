# Fitness Tracker — Project Operating Model

**What this document is:** a standalone description of *how work gets planned,
reviewed, and shipped* on the Fitness Tracker project. It is deliberately
written for a reader with **zero prior context** — a brand-new session, a
different AI platform, or the project owner returning after months away. It
does not assume you know anything about the specific AI tooling this project
happens to use. Where a practice originates in one vendor's tooling, the
*principle* is described portably so it still makes sense elsewhere.

**How to use it:** read this once to understand the working model, then rely on
the two running-state documents it points to — `docs/ARCHITECTURE.md` (how the
app is built) and `SESSION_START.md` (what happened last and what is open).

**A note on accuracy:** every factual claim below was checked against the actual
repository (commits, migration files, source, and the project's own session
log) before being written. Where something could not be verified, it is flagged
explicitly rather than guessed. See the end of Section 6 and Section 12
(Known gaps in this document).

---

## 1. The Three-Role Model

Work on this project is split across three roles. The split is the single most
important thing to understand, because every other rule follows from it.

| Role | Who, currently | Does | Never does |
|---|---|---|---|
| **Coordinator** | An AI chat assistant that holds the project's planning context | Plans work, writes specifications and task prompts, reviews the actual diffs produced, makes go/no-go ("clearance") decisions | Writes or commits code directly |
| **Executor** | An AI coding agent working in a terminal against a checkout of the repo (currently a Claude Code terminal) | Implements the task, verifies its own work, reports back in a fixed format, and **stops at every high-risk gate to wait for clearance** | Proceeds past a HIGH-zone gate without explicit approval; works outside the task's defined scope |
| **Relay / Approver** | The human (the project owner) | Carries prompts and reports between coordinator and executor, and holds **final sign-off** on all high-risk work | — |

**Why the split exists (the portable principle):** an execution agent working
alone tends to *over-trust its own completion claims*. It will report "done, zero
regressions" on work that has drifted from intent, because the same reasoning
that produced the drift also writes the report. Inserting a distinct review step
— performed by a party that did **not** write the code and re-checks against
ground truth — catches that drift early, before it compounds across later work.
This is a general principle of reliable delivery, not a feature of any particular
tool: *separate the doing from the approving, and make the approver verify rather
than trust.*

Nothing here depends on the roles being filled by any specific product. The
coordinator could be a different AI, or a human tech lead. The executor could be
any coding agent. The model is the point, not the tooling.

---

## 2. Zone Classification

Every task is classified by **risk of what it touches**, into three zones. These
definitions are the ones actually used on this project:

- **LOW** — documentation, CSS, copy, layout, test files, adding a *new*
  non-auth API endpoint, deploy health checks, browser visual verification.
  Reversible, no user data, no auth, no schema. Executor may complete
  autonomously.
- **MEDIUM** — application logic, existing route behavior, state handling that
  isn't auth/schema. Requires a written specification before code (see the
  SPEC_FIRST rule, Section 4).
- **HIGH** — database schema (models and migrations), authentication and session
  logic, any read or write of user data, production environment changes, or any
  change touching the central state file **and** the backend at the same time.
  Also: **any irreversible action** (deleting data, destructive operations).
  Requires the full two-stage pattern in Section 3 and human sign-off.

**A claimed zone is advisory only.** A task prompt may *say* it is LOW, but the
real zone is decided by what the work actually touches. If the executor discovers
mid-task that scope has grown into a higher zone — for example, a "one-line CSS
fix" turns out to require editing the authentication router — it must **stop and
escalate**, not push through. Escalation is the executor's own responsibility.
The rule on this project is stated bluntly: *a prompt labeled LOW that touches
the auth router is HIGH — full stop.* The prompt cannot reclassify what the code
actually is.

---

## 3. The Two-Stage HIGH-Zone Pattern

Any schema change, auth change, or irreversible action goes through a
**two-clearance** sequence. Nothing is skipped, regardless of how small the diff
looks.

1. **Spec first.** A written specification is produced and **committed alone**,
   with no implementation code. It defines the approach, the key decisions, the
   files that will be touched, the risks, and what "done" looks like.
2. **Full-text review.** The coordinator reads the **entire spec text**, not a
   summary of it. (Summaries hide exactly the details that matter in HIGH-zone
   work.)
3. **First clearance.** The coordinator gives an explicit go-ahead — the literal
   phrase used is *"Cleared, proceed with implementation."* Absent that phrase,
   no code is written.
4. **Implementation + self-review.** The executor implements, then re-reads its
   own **full diff** as an inline self-review (checking for data loss, null/edge
   cases, logic errors, dead imports; rating any findings by priority) before
   asking to commit.
5. **Second clearance.** The coordinator reviews the actual diff and gives a
   *second* explicit go-ahead — the literal phrase *"Cleared, proceed with
   commit"* — before the commit is made.

So a HIGH-zone feature is gated **twice**: once on the plan, once on the
realized code. A single approval is never enough.

**Real precedent on this project — three worked examples:**

- **Experience-level column (Session 16).** Added a per-user `experience_level`
  database column so the AI coach could calibrate its response depth. Full cycle:
  spec → clearance → migration `0006` written to match the model → deploy →
  live verification with a disposable account → clearance → commit. This is the
  canonical example of the pattern applied to a schema change end to end.
- **Account deletion (spec Session 17, implemented Session 18).** The spec was
  written and committed alone in S17 (`docs/account_deletion_spec_s17.md`,
  commit `e62fccf`), reviewed, and only implemented in a later dedicated session
  (commit `5c3e52c`, S18). A key spec finding — that all eight user-owned tables
  already cascade-delete at the database level, so **no migration was needed** —
  was itself independently re-verified against the migration files before the
  build proceeded (see Section 4).
- **OAuth hardening (spec Session 17).** Spec committed alone
  (`docs/oauth_hardening_spec_s17.md`, commit `372e028`), awaiting its
  implementation session as of this writing. The audit found the pre-existing
  documentation was *partially stale* (it claimed the OAuth `state` parameter was
  never implemented; direct code inspection showed it **was** implemented and
  validated). Only the PKCE piece is genuinely missing. This example shows the
  spec stage doing real work — correcting the record — before any code is touched.

---

## 4. Independent Verification, Not Trust-by-Default

The coordinator does **not** sign off on a completion report by reading the
report alone. It re-checks the claims against the **actual live repository** and,
where relevant, the **actual deployed service** (backend schema endpoint,
deployment status, live app behavior).

**Why:** a completion report is the executor's own account of its own work. An
account written by the party that did the work will faithfully reproduce that
party's blind spots. An independent second read — against ground truth, by
someone who didn't write the code — is what catches claims that don't hold up.

This project has caught real examples of exactly this failure mode:

- **A "convention" that turned out to be inaccurate.** In Session 15 a report
  claimed design-review screenshots were "untracked per convention" and could be
  discarded. Session 16 checked this against the actual git history and found it
  **false** — earlier sessions' screenshots *were* committed; screenshots are
  tracked deliverables. The incorrect claim had already caused a set of
  screenshots to be lost. The correction is recorded in the project's session log.
- **A schema-invariant claim worth double-checking.** The account-deletion spec
  asserted that every user-owned table already had database-level cascade
  deletion, so deleting a user would atomically remove all their data with no new
  migration. Because that assertion single-handedly determined whether a
  migration was needed, it was re-verified directly against the migration files
  (`0001_initial_schema.py` for seven tables, `0003_add_coach_messages.py` for
  the eighth) before implementation. In this case the claim **held** — but it was
  confirmed, not trusted.
- **A living doc gone stale.** The architecture document drifted out of date for
  five consecutive sessions despite a standing rule to keep it current (see
  Section 6).

**This verification is expensive** in time and tokens, so it is applied
**proportional to risk**: HIGH-zone work is always independently verified; LOW-zone
work (a copy tweak, a doc edit) rarely warrants it. The principle is not "distrust
everything" — it is "trust in proportion to the cost of being wrong."

---

## 5. Git Ceremony

A small set of git disciplines is mandatory on every unit of work:

- **Sync before starting.** Fetch and rebase onto the latest mainline
  (`git fetch origin && git rebase origin/main`) at the start of every task, so
  work is built on current state rather than a stale base.
- **Explicit pathspec on every commit.** Commits name the exact files being
  committed (e.g. `git commit -- docs/thing.md`). A blanket "stage everything"
  (`git add -A` / `git add .`) is **never** used. This matters especially when
  more than one executor shares a checkout — a blanket add can sweep another
  terminal's in-progress files into your commit.
- **Verify what is staged before committing.** Check the staged file list
  (`git diff --cached --name-only`) and confirm it contains only your intended
  files.
- **Isolated worktrees for parallel work.** When two executors work at once, each
  is *supposed* to operate in its own isolated worktree rather than a shared
  checkout. This requirement is **not yet fully met in practice** — see Section 8
  for the gap found this session and the fix.

Mainline is updated directly (fetch/rebase/push to `main`); there is no
long-lived branch-and-PR flow for routine work. The safety comes from the review
gates (Section 3) and pathspec discipline, not from branch protection.

---

## 6. The Living Architecture Document

`docs/ARCHITECTURE.md` exists so that **no session has to reverse-engineer the
app** before changing it. It documents the stack, routing, component tree,
backend routes, data model, persistence patterns, and known tech debt, with
per-claim confidence markers (verified against source / from session notes /
provisional).

**A failure mode that already happened here — worth understanding, because the
fix generalizes.** The architecture doc carries an explicit self-instruction in
its own header: *any session that changes architecture updates this document in
the same commit.* Despite that, the doc **went stale for five consecutive
sessions** (S12 through S16). It took a dedicated full catch-up pass in Session 17
(commit `bf1454c`) to make it authoritative again.

**Why the standing instruction failed:** it was *passive text in a document*. It
relied on each executor remembering to act on a rule that lived somewhere they
might not re-read. Passive rules decay.

**The fix — make it an active, required field.** The remedy is to move the
obligation out of passive prose and into the mandatory structure of every
completion report. Every task now must state, as a required line:

> **ARCHITECTURE.md:** `updated — <what changed>` **or** `no architectural change this task`

Because the field is *required*, "I forgot" stops being possible — a report is
incomplete without an explicit answer, and answering forces the author to
consciously decide whether the doc needs updating. This is the general lesson:
*to make a cross-cutting rule stick, bind it to a required field in a process
step, not to a sentence someone is supposed to remember.*

**Honest status of this field (verified):** as of this writing, the
completion-report template recorded in the project's build-rules file
(`CLAUDE.md`, `COMPLETION_REPORT_FORMAT`) does **not yet list** this
ARCHITECTURE.md line. This document formalizes it as required; the template in
`CLAUDE.md` should be updated to match. Section 10 reproduces the template with
the field included.

---

## 7. Session Close Protocol

The project keeps its **own** running memory, independent of any AI platform's
internal memory, in `SESSION_START.md` at the repository root. (It is named for
being pasted in at session *start*, but it is *written* at session *close*.)

At the end of every session:

- The **previous** session's detailed state is collapsed to a one-line reference
  (e.g. "Session 15 closed at `<sha>` — <one line>; full commit list:
  `git log A..B`"). The detail lives in git history; the summary stays scannable.
- The **current** session's commits and findings are recorded, each with its
  commit SHA and a short description of what shipped.
- Anything **found but not fixed** becomes a **numbered, priority-ranked open
  item** for a future session (the file uses P2/P3-style priorities), with enough
  context to act on without re-discovering it. For example, S18 recorded that
  cloud login can silently orphan local profiles, with the root cause and an
  explicit "do not fix ad hoc — needs its own scoped task" instruction.

**This file is the project's durable memory.** Read it at the start of any new
session **regardless** of what any AI tool claims to remember internally — the
tool's memory may be absent, partial, or from a different machine, but this file
is in the repository and is authoritative. The session-start brief itself
instructs the reader to begin by reading `docs/ARCHITECTURE.md`,
`docs/DESIGN_TOKENS.md`, and two session-operations references (see note below).

> **Note on `MASTER_CONTEXT.md`:** `SESSION_START.md` points to a file
> `MASTER_CONTEXT.md` for "how sessions operate." It is **not** in this
> repository by design — it is a real, intentionally separate document living in
> a different repo (`patpeak1-eng/peak-ops-standards`) and shared cross-project
> with Mission Control, covering **generic** cross-project rules. It is read via
> its raw URL. `docs/PROJECT_OPERATING_MODEL.md` (this document) is a **second,
> complementary** required read covering **this project's specific** operating
> history and process. The two do not overlap and both are needed;
> `SESSION_START.md` now references both.

---

## 8. Parallel-Terminal Rules (including the gap found this session)

Multiple executors may work **simultaneously only on genuinely non-overlapping
files.** The rules, as practiced:

- One executor owns a given file at a time; ownership is coordinated up front
  (the project's own skill note assigns, e.g., "T1 owns backend files, T2 owns
  specific frontend files").
- The central state file (`src/context/WorkoutContext.jsx`) is **one executor at
  a time, always** — it is the highest-risk file in the app.
- Pushes are serialized: the first executor pushes, the next rebases onto that
  new mainline SHA before pushing its own work, and so on.

**The gap found this session (Session 18), stated plainly.** During S18, two
executors ran in a **shared checkout** of the repository rather than in isolated
worktrees. One implemented the account-deletion feature; the other wrote
specifications. It *worked out* — no work was lost — but only because both
executors used explicit pathspec on every commit and verified their staged file
list before committing. Concretely: a `git rebase` in one terminal was blocked by
the *other* terminal's uncommitted changes sitting in the shared working tree,
and the shared index meant a careless `git add` could have swept the sibling's
files into the wrong commit. Nothing broke — but that was **discipline, not
protection.** Discipline fails eventually; a structural guarantee does not.

**The fix, going forward:** parallel executors each work in an **isolated
worktree** (a separate working directory backed by the same repository), so that
one terminal's uncommitted changes and staging area are physically invisible to
the other. Isolation by construction replaces reliance on every executor
remembering to be careful. Shared-checkout discipline alone is **not** an
acceptable long-term substitute.

---

## 9. Testing Discipline

**Never test against the real (owner's) account.** All live verification of
authentication or data-destructive features is done with **disposable throwaway
accounts**, created for the test and cleaned up within the same session —
deleted *through the feature itself* wherever the feature makes that possible.

The **account-deletion** feature is the clean example: the correct way to verify
"delete my account and all my data" is to register a throwaway account, exercise
the deletion, and confirm both that the account can no longer authenticate and
that all of its data rows are gone — a feature that **verifies itself** by being
used to clean up its own test fixture. This is safe precisely because it never
touches real data.

> **Verified caveat (real-world messiness).** This discipline depends on
> retaining the throwaway credentials long enough to clean up. Two disposable
> test accounts created in Session 16 still sit on the live backend, because the
> account-deletion feature requires the account's own password and nobody
> retained those S16 credentials. This is recorded as accepted tech debt (the
> accounts hold only a few harmless calibration rows) — and it is a concrete
> reminder that "create disposable, delete within the session" is the rule for a
> reason: skip the cleanup and the fixture becomes permanent.

---

## 10. Completion Report Format

Every completed task returns a fixed-structure report. Reproduced below is the
template actually in use (from the project's build-rules file), **plus** the
required ARCHITECTURE.md line established in Section 6:

```
TASK COMPLETE — [Task Name]
Files modified:     [list, with line delta]
ARCHITECTURE.md:    [updated — <what changed>  |  no architectural change this task]
Zero regressions:   [CONFIRMED / issues found]
Verification method:[how it was checked — live browser, build, lint, endpoint probe]
Commit SHA:         [sha]
Deployed SHA:       [sha] — status=[ok/failed] deploy=[green/red]
Surprises / gotchas:[list or NONE]
Ready for next task:[suggested next item from the open backlog]
```

The report is a structured claim, not a proof. It is the **input** to the
coordinator's independent verification (Section 4), which is what actually closes
a HIGH-zone task.

---

## 11. Glossary

Plain definitions of the recurring terms, as used on this project:

- **Zone (LOW / MEDIUM / HIGH)** — a task's risk classification, decided by what
  the work touches (docs/style vs. logic/routes vs. auth/schema/user-data/
  irreversible). Determines how much process and sign-off the task needs
  (Section 2).
- **"Cleared, proceed with implementation" / "Cleared, proceed with commit"** —
  the two literal approval phrases that gate HIGH-zone work. The first releases
  the executor to write code against an approved spec; the second releases it to
  commit a reviewed diff. Absent the exact phrase, the executor waits (Section 3).
- **SPEC_FIRST** — the rule that any MEDIUM-or-higher task must have a written
  specification (approach, key decisions, definition of done) before any code is
  written. For HIGH-zone work the spec is committed on its own, ahead of
  implementation (Sections 2–3).
- **Disposable / throwaway account** — a temporary user account created solely to
  test an auth- or data-affecting feature on the live system, and removed within
  the same session, never the owner's real account (Section 9).
- **Session number (S-prefix, e.g. S16, S18)** — a sequential label for a unit of
  coordinated work. Commit messages and docs are tagged with the session that
  produced them, so history can be read session by session. "Session close"
  (Section 7) is the boundary between them.
- **Terminal naming (T1 / T2 / …)** — labels for concurrent executor sessions
  when more than one runs at once, used to assign non-overlapping file ownership
  and to serialize pushes (T1 pushes, T2 rebases onto T1, etc.). See Section 8.
- **Coordinator / Executor / Relay-Approver** — the three roles of Section 1: the
  planner-and-reviewer (writes no code), the coding agent (writes and
  self-verifies, stops at gates), and the human (relays and holds final sign-off).
- **Living document** — a reference file kept continuously current as the project
  changes, rather than written once and abandoned. `docs/ARCHITECTURE.md` and
  `SESSION_START.md` are the two primary ones (Sections 6–7).

---

## 12. Known Gaps in This Document

Stated explicitly, per the project's own "verify or flag, don't guess" rule:

1. **`MASTER_CONTEXT.md` lives in a separate repo (resolved).** It is not missing
   — it is an intentionally separate, cross-project document in
   `patpeak1-eng/peak-ops-standards`, shared with Mission Control, covering
   generic rules. It simply lacked a resolvable path from this repo.
   `SESSION_START.md` now references it by raw URL and lists this document
   alongside it as the project-specific complement (Section 7). No longer an open
   gap.
2. **The ARCHITECTURE.md completion-report field is now in the template
   (resolved).** It was formalized in this document (Sections 6, 10) and added to
   the `CLAUDE.md` `COMPLETION_REPORT_FORMAT` template in the same commit, so the
   two now agree. No longer an open gap.
3. **Isolated-worktree parallelism is a stated requirement, not yet a guaranteed
   practice** — S18 ran in a shared checkout and relied on discipline (Section 8).
4. Role assignments ("currently an AI coding agent running such-and-such model")
   reflect the tooling in use at the time of writing and are expected to change;
   the *roles* are stable, the *occupants* are not.
