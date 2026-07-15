# Spec: Date of Birth → auto-updating Age (S21)

**Status:** SPEC ONLY — awaiting coordinator clearance ("Cleared, proceed with implementation")
**Zone:** HIGH — `user_stats` table (new column + migration)
**Author:** S21 session, 2026-07-15

## Problem

`UserStats.age` is a plain String, manually typed, static — it silently goes
stale every birthday. Requested: tap the Age field → date picker → store date
of birth once → displayed age computes itself and stays correct year over
year. Additive and opt-in: users who never set a DOB keep today's manual-age
behavior exactly.

## Current state (verified in code, 2026-07-15)

| Where | What |
|---|---|
| `backend/app/models.py:112` | `age = Column(String)` on `user_stats` |
| `backend/app/schemas.py:45` | `UserStatsUpdate.age: Optional[str]`; `UserStatsResponse(UserStatsUpdate)` at `:56` inherits it — **these two classes are the exact schemas involved**, there is no separate create schema |
| `backend/app/routers/profile.py:59-68` | PUT `/api/profile` upsert writes stats via generic `**stats_data` `INSERT..ON CONFLICT DO UPDATE` — per the established sync-field pattern, adding a field needs **no handler change** |
| `src/pages/Profile.jsx:326-333` | Age is a free-text `<input type="number">` in Personal Information |
| `src/pages/Profile.jsx:101-113` | Save pushes `stats: { age: userStats.age \|\| null, ... }` to `ApiService.saveProfile` |
| `src/context/WorkoutContext.jsx:404-405` | `userStats` state default includes `age: ''` |
| `src/context/WorkoutContext.jsx:646-661` | Login pull: backend stats win — maps `s.age` into state + `StorageService.saveUserStats` |
| `src/services/StorageService.js:304` | Default local `userStats` shape includes `age: ''` |

No other consumer of `age` exists in the frontend (repo-verified grep).

## Proposed change

### Backend

**Migration** — current alembic HEAD is `add_nutrition` (`0007`). The avatar
color spec (also S21, not yet implemented) proposes `avatar_color_default`
as `0008`. **Verify actual HEAD at implementation time** and chain to it;
assuming both land in spec order:

- File: `backend/alembic/versions/0009_add_date_of_birth.py`
- `revision = "add_date_of_birth"` (≤32 chars, house convention)
- `down_revision = <verified HEAD at implementation time>`

```python
def upgrade() -> None:
    op.add_column("user_stats", sa.Column("date_of_birth", sa.Date(), nullable=True))

def downgrade() -> None:
    op.drop_column("user_stats", "date_of_birth")
```

Nullable, no default, no backfill — NULL means "user hasn't opted in", which
is the correct state for every existing row. `age` column is kept untouched
(it remains the fallback for non-DOB users).

**models.py** — add to `UserStats` (after `age`, `models.py:112`):
```python
date_of_birth = Column(Date)  # nullable; NULL = user still on manual age
```
(`Date` added to the existing sqlalchemy import.)

**schemas.py** — add to `UserStatsUpdate` (`:44`):
```python
date_of_birth: Optional[date] = None   # from datetime import date
```
`UserStatsResponse` inherits it automatically. Pydantic serializes as ISO
`"YYYY-MM-DD"` and validates inbound strings into real dates (malformed input
→ 422, which is the trust-boundary validation).

**profile.py** — no change (generic upsert).

### Frontend

**State + storage** — add `dateOfBirth: ''` to the `userStats` defaults in
`WorkoutContext.jsx:404` and `StorageService.js:304`.

**Sync** —
- Pull (`WorkoutContext.jsx:649`): add `dateOfBirth: s.date_of_birth || ''`.
- Push (`Profile.jsx:101`): add `date_of_birth: userStats.dateOfBirth || null`.

**Age computation** — small helper in `Profile.jsx` (sole consumer; no util
file needed for one function):
```js
const computeAge = (dobStr) => {
    const dob = new Date(dobStr + 'T00:00:00');
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    // Subtract one if this year's birthday hasn't happened yet
    if (now.getMonth() < dob.getMonth() ||
        (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) {
        age--;
    }
    return age;
};
```
Display priority: `userStats.dateOfBirth ? computeAge(dateOfBirth) : userStats.age`.
DOB always wins when present; manual `age` string is neither migrated nor
deleted.

**UI (Profile.jsx Personal Information, `:325-334`)** — the Age box becomes
tap-to-pick instead of free-text, using the **native** `<input type="date">`
(platform feature — native calendar UI on mobile, no dependency, free
accessibility & keyboard support):

- The visible box shows just the number (computed age, or the manual age if
  no DOB, or the "Years" placeholder if neither).
- Tapping the box opens the native date picker (`input.showPicker()` where
  supported, falling back to focusing the date input; the date input sits in
  the same box, visually styled per `docs/DESIGN_TOKENS.md` form-field tokens
  — the *picker chrome itself* is OS-native and intentionally not themed).
- `max` attribute = today (client-side guard against future DOBs; server
  already 422s non-dates).
- Picking a date sets `userStats.dateOfBirth`, autosaves through the existing
  `handleSave('personal')` flow unchanged.
- Users with a manual age who never tap the picker: zero behavior change.

## Zone classification & risk

**HIGH** — `user_stats` schema migration + a new synced user-data field.
Risk: low — purely additive nullable column, no backfill, no change to the
upsert handler, existing `age` untouched. Full HIGH-zone discipline applies:
coordinator sign-off, diff in chat before commit, Railway migration + deploy
verification.

## Files touched (implementation session)

- `backend/alembic/versions/0009_add_date_of_birth.py` (new — number per verified HEAD)
- `backend/app/models.py` (UserStats + Date import)
- `backend/app/schemas.py` (UserStatsUpdate + date import)
- `src/context/WorkoutContext.jsx` (state default `:404`, pull mapping `:649`) — **WorkoutContext + backend in one task; explicitly flagged per HUMAN_VALIDATION_ZONES**
- `src/services/StorageService.js` (default shape `:304`)
- `src/pages/Profile.jsx` (age field UI, computeAge, push payload)

## Acceptance criteria (future implementation session)

1. `alembic upgrade head` clean on Railway; `user_stats.date_of_birth` exists, nullable, all existing rows NULL.
2. Existing account with manual age and no DOB: Profile page shows the manual age, editable via the picker only after they choose a date — no forced change, no data loss.
3. Tap Age box → native date picker opens (mobile 375px verified via Playwright); future dates unselectable.
4. Pick a DOB → displayed age equals correct computed age, both before and after a birthday boundary case (unit-check computeAge with a birthday-later-this-year date and a birthday-already-passed date).
5. DOB round-trips: save on device A → `/api/profile` GET returns `date_of_birth` → login pull on device B shows the same computed age.
6. `npm run build` passes; backend starts clean.
7. Users with neither DOB nor age still see the "Years" placeholder.
