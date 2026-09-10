# Skill: Plan-Stage Cross-Review

## Purpose

Have a second, independent agent attack a spec **before any code exists**,
and re-verify its load-bearing claims against source rather than accepting
them. Catches wrong premises while changing them is still free.

## When to Use

Every MEDIUM or HIGH zone task, at the plan stage — required by
`AGENTS.md` CROSS_REVIEW_RULE. Also worth it for any change whose blast
radius is bigger than its diff.

## Method

1. **Write the spec first**, commit it alone. The reviewer reviews an
   artifact, not a conversation.
2. **Give the reviewer its own worktree.** Create one, then bring it to the
   real head — a fresh worktree forks from the *local* `main`, which is
   usually behind `origin/main`:
   ```bash
   git -C "$W" fetch origin && git -C "$W" reset --hard origin/main
   ```
   Separation is not only about safety. Once the builder starts editing, a
   shared checkout means the reviewer reviews half-finished work.
3. **Brief it with a contract, not a request.** What worked:
   - zone, and READ-ONLY stated explicitly ("do not edit, stage, commit or
     push; paste diffs instead of applying them")
   - which files to read first, `AGENTS.md` among them — the rules govern
     the reviewer too
   - the claims to verify, as numbered items with `file:line`, phrased as
     *"verify this yourself, do not take my word for it"*
   - **at least one item where you ask to be refuted**, naming the
     hypothesis you rejected and why it matters if you are wrong
   - a `DONE MEANS` block: one-word verdict, findings ranked most severe
     first, explicit rulings on each numbered item
   - "be adversarial; say so if you think the work is not worth doing"
4. **Verify the findings yourself** before acting (CODEX_TRUST_RULE). Check
   the cited lines. For anything that changes the plan, verify a second way —
   source *and* the live system.
5. **Feed the owner's answers back** as a second pass. Product decisions
   change which findings matter; the reviewer that has the context should
   re-rank them rather than a fresh agent starting cold.
6. **Record the outcome in the spec**, and name the reviewer agent id in a
   provenance section so the next session can reuse its context.

## Gotchas

- **A fresh Traycer worktree is behind.** It forks from local `main`, not
  `origin/main`. Reset it or the reviewer reviews stale source and reports
  confidently about code that has changed.
- **The reviewer's worktree goes stale between passes too.** Tell it to
  fetch and reset at the start of each pass.
- **`responseId` belongs to the receiver's thread.** You cannot reuse the id
  from a reply to follow up on your own earlier request — send a fresh
  message with `expectReply: true`.
- **Never poll for the reply.** It arrives as its own message and the
  session is re-invoked. Do not hold a turn open.
- **A reviewer that only agrees is not a control.** If two passes come back
  clean with no findings, suspect the brief, not the code.
- **Do not launder the review through your own summary.** Give the reviewer
  the spec and the original task statement. Its transcript is the proof
  artifact; a narration of it is not.
- Permission mode: a Codex chat agent stops on every shell command and every
  outbound message under both `auto_accept_edits` and `supervised`. A
  read-only LOW-zone reviewer that must run commands and reply needs
  `full_access` — which the agent-selection guide permits for exactly this
  case. Never give a full-access agent HIGH-zone build work.

## Worked example — S29, 2026-09-09

A P3 backlog item, "cloud login orphans local profiles," with a spec
proposing a single upsert helper.

- **Pass 1** returned CHANGES-REQUIRED and overturned the premise: the
  backend `Token` carries no `user_id`, so the "fallback" timestamp id was
  the *only* path and every password sign-in landed on a new data scope. A
  P3 multi-profile edge case was actually a P1 hitting ordinary users.
  Verified independently three ways before acceptance — schema source, route
  source, and the live deployed `/openapi.json`.
- **Pass 2**, after the owner's product decision, corrected a framing both
  the builder and the owner held — the backend already has one profile per
  account, so the frontend feature was device-sharing, not per-user
  profiles — and caught a rollout trap: adding `user_id` to the response is
  not a safe backend-only deploy, because deployed clients already read that
  field and would switch data scopes the moment it appeared.

Neither finding was reachable from the diff, because there was no diff. Both
would have shipped.
