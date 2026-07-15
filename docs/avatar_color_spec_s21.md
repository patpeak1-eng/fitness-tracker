# Spec: Avatar Color Fix — retire stale #bfff00 default (S21)

**Status:** SPEC ONLY — awaiting coordinator clearance ("Cleared, proceed with implementation")
**Zone:** HIGH — `users` table (migration + one-time data backfill + auth.py)
**Author:** S21 session, 2026-07-15

## Problem

The avatar's default color is still `#bfff00` (neon green from the retired S11
theme, pre-"Ember on Graphite"). Confirmed on a live account: existing user
rows hold the **literal** stale value, so fixing the defaults alone is not
enough — a one-time data backfill is required.

## Definitive occurrence list (repo-wide grep for `#bfff00`, case-insensitive, 2026-07-15)

### In scope — avatar color

| Location | Current behavior |
|---|---|
| `backend/alembic/versions/0001_initial_schema.py:32` | `users.color` column created with `server_default '#bfff00'` — every INSERT that omits color (all of them: register and OAuth never send color) gets the stale value **stored literally in the row** |
| `backend/app/models.py:30` | `color = Column(String, server_default="#bfff00")` — ORM mirror of the same default; governs `create_all()` dev databases and is the model-level source of truth |
| `backend/app/routers/auth.py:319` | `/me` returns `user.color or "#bfff00"` — fallback for NULL rows re-injects the stale value into the frontend |

### Out of scope for this fix (stale theme remnants, but NOT avatar color — separate backlog items)

| Location | What it is |
|---|---|
| `public/manifest.json:9` | PWA `theme_color` still `#bfff00` (browser chrome tint) |
| `public/icon.svg:5,7,9,11,13` | App icon artwork still neon green |
| `FULL_APP_ASSESSMENT.md:112`, `PROJECT_CONTEXT.md:20`, `docs/FABLE5_SESSION12_BRIEF.md:47`, `SESSION_START.md:181-184` | Historical/context docs — no action |

The manifest + icon are user-visible stale-theme debt and deserve their own
LOW-zone task, but they are frontend static assets with zero relation to the
`users.color` column; bundling them here would blur the HIGH-zone diff.

## New default color — decision

**`#ff5c2a`** — the Design Tokens v2 `--primary` (accent/ember) hex, per
`docs/DESIGN_TOKENS.md` ("THE brand color: primary CTAs, selection states").

Why this token: the frontend already unanimously agrees —
- `WorkoutContext.jsx:487` falls back to `'#ff5c2a'` when `/me` returns no color
- `StorageService.js:257` seeds the default local profile with `'#ff5c2a'`
- `ProfileSelector.jsx:32` lists `'#ff5c2a'` as the first color swatch

The DB stores the **literal lowercase hex** `#ff5c2a`, not a CSS var — avatar
color is per-user data rendered via inline `--profile-color` style, and the
backend has no knowledge of frontend tokens. Note: if the brand accent ever
changes, rows backfilled to `#ff5c2a` will not follow it; acceptable — same
trade-off every user-chosen swatch already has.

## Is there any UI today where a user chooses their avatar color?

**Yes, but it never reaches the backend.**

- `ProfileSelector.jsx:32,99-107` renders a 6-swatch color picker
  (`#ff5c2a #bd00ff #00ff9d #ff3366 #33ccff #ff9900` — note `#bfff00` is NOT
  among them) and passes the choice to `createProfile(name, color)`.
- `WorkoutContext.jsx:1203` `createProfile` and `:1252` `updateProfile` write
  **only to localStorage** (`StorageService.saveProfiles`) — no API call.
- Every backend `saveProfile` (PUT `/api/profile`) call site was audited:
  `WorkoutContext.jsx:1050,1066,1082,1098,1114,1130`, `TimerContext.jsx:224`,
  `Profile.jsx:101` — none includes a `color` field. `ProfileUpdate`
  (`schemas.py:91`) *accepts* color, but nothing sends it.

Therefore no user can have deliberately set `users.color` through the UI. All
rows holding `#bfff00` hold it because the server default put it there. The
backfill is still scoped to the literal old value (belt-and-braces): a
hypothetical hand-crafted API call that chose `#bfff00` on purpose is
indistinguishable from the default, but since the old default IS the wrong,
retired theme color, replacing it is the correct outcome in that case too;
any other hand-set value is untouched by construction.

## Migration plan

Current alembic HEAD (verified from file, not assumed): **`add_nutrition`**
(`0007_add_nutrition.py`). New migration:

- File: `backend/alembic/versions/0008_avatar_color_default.py`
- `revision = "avatar_color_default"` (≤32 chars, matching 0007's convention)
- `down_revision = "add_nutrition"`

### upgrade()
```python
# 1. Change the column default for future inserts
op.alter_column("users", "color", server_default=sa.text("'#ff5c2a'"))
# 2. One-time backfill of rows still on the literal old default
op.execute("UPDATE users SET color = '#ff5c2a' WHERE color = '#bfff00'")
```

### downgrade()
```python
op.alter_column("users", "color", server_default=sa.text("'#bfff00'"))
# Deliberately NO reverse backfill: we cannot distinguish which rows the
# upgrade touched from rows that were already #ff5c2a; reverting data would
# corrupt. Default-only downgrade.
```

### Why the backfill WHERE clause is safe
`WHERE color = '#bfff00'` touches only rows carrying the exact retired
default. NULL rows are untouched (NULL ≠ '#bfff00'), which is fine — the
updated auth.py fallback covers them. Rows with any user-set value are
untouched. Single UPDATE, single column, no FK/index/constraint involvement,
trivially idempotent (re-running matches zero rows).

## Code changes (same implementation session)

| File | Change |
|---|---|
| `backend/app/models.py:30` | `server_default="#ff5c2a"` |
| `backend/app/routers/auth.py:319` | `"color": user.color or "#ff5c2a"` |
| `backend/alembic/versions/0008_avatar_color_default.py` | new migration above |

No frontend changes: `WorkoutContext.jsx:487` already falls back to
`#ff5c2a`; it starts receiving the right value automatically.
No schema-shape change: `schemas.py` untouched (color already Optional[str]).

## Zone classification & risk

**HIGH** — `users` table migration + data write. Risk assessment: about as
low-risk as a users-table change gets — one nullable cosmetic String column,
no auth logic, no cascade, reversible default, idempotent backfill scoped to
the literal retired value. Gets full HIGH-zone discipline regardless:
coordinator sign-off before implementation, migration reviewed as diff in
chat, deploy verified via Railway dashboard.

## Acceptance criteria (future implementation session)

1. `alembic upgrade head` runs clean on production (Railway); new HEAD is `avatar_color_default`.
2. Live check on the confirmed-stale account: `/api/me` returns `"color": "#ff5c2a"`.
3. Fresh register (disposable account per established procedure): new row gets `#ff5c2a` without the client sending color.
4. No row with a non-`#bfff00`, non-NULL color changed (spot-check if any exist; per audit above none should).
5. `models.py` default, migration default, and auth.py fallback all agree on `#ff5c2a`.
6. Frontend avatar renders ember, not neon green, for the previously-stale account.
