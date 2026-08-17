# AI Coach Visual Equipment and Cloud Environments Specification — S25

Status: approved for implementation by Patrick on 2026-08-17.

## 1. Outcome

Complete the visual-equipment workflow introduced in S24 so a user can capture
or upload several equipment photos, let the AI Coach actually inspect those
photos, confirm the detected inventory, and reuse a named environment such as
Station 12 on another signed-in device.

This release does not add continuous live video. The future Gemini Live
walkthrough remains a separately evaluated phase after the still-photo flow is
proven on real phones.

## 2. Mobile capture experience

- The Coach provides separate, familiar actions for **Open camera** and
  **Choose photos**.
- The in-app camera requests `facingMode: environment` first so the outward
  camera is the default. A visible flip control switches between outward and
  selfie cameras.
- If live camera access is unsupported or denied, the app exposes the native
  rear-camera capture input as a fallback and always retains photo-library
  upload.
- Up to six photos can be attached in one review. Each attachment has a
  thumbnail and remove action; repeated camera captures append instead of
  replacing earlier photos.
- Photos are normalized in the browser to JPEG, at most 1280 pixels on the
  longest edge, before transmission.

## 3. Direct Coach vision

`POST /api/coach/chat` accepts up to six transient image attachments alongside
the text message and app context. On the current user turn, the backend sends
Claude image content blocks followed by the user's text. Prior conversation
history remains text-only.

The Coach system instructions explicitly state that attached images are
visible for that turn. The Coach must describe visible equipment and
uncertainty, must not claim that images were absent when attachments were
accepted, and must use the structured `propose_workout` tool when the user asks
for a workout.

Only the text caption (or a neutral "Shared N equipment photos" caption when
the user sends images without typed text) is written to `coach_messages`. Raw
image bytes, thumbnails, and model image content are never persisted by the
app.

## 4. Multi-photo equipment analysis

`POST /api/coach/equipment/analyze` accepts one to six images and retains
backward compatibility with the S24 single-image request shape. Claude reviews
all images in one request and returns a combined, deduplicated set using the
app's canonical equipment vocabulary plus a confidence level and short note.

The user reviews and corrects the inventory before activating or saving it.
Photo detection never mutates the active environment by itself.

## 5. Cloud-synced named environments

Add nullable `users.equipment_environments` JSONB storage through Alembic. Each
record contains a stable client id, name, canonical equipment list, source, and
updated timestamp. The profile API validates a maximum of 30 environments,
with bounded names and equipment arrays.

Migration and reconciliation policy:

1. Existing cloud rows begin with `NULL`, meaning the server has never received
   the field.
2. When a signed-in device sees `NULL`, it keeps any device-local environments
   and backfills them to the profile API once.
3. Once the server field is a JSON array, including an empty array, that cloud
   value is authoritative on login. This preserves cross-device deletions and
   prevents stale local data from resurrecting removed stations.
4. Offline or unauthenticated local profiles continue using profile-scoped
   local storage. Signed-in edits save locally immediately and sync through the
   existing profile update and retry-queue path.

## 6. Safety, privacy, and limits

- All visual endpoints remain authenticated and rate-limited.
- Allowed media types are JPEG, PNG, WebP, and non-animated GIF input.
- Maximum attachment count is six; per-image and total encoded-size limits are
  enforced before any provider call.
- Browser object URLs are revoked when attachments are removed, sent, or the
  page unmounts.
- The app persists only confirmed equipment metadata, never raw visual media.
- The UI explains that detection can miss equipment and requires review.
- The React app remains the authority for starting or saving workouts.

## 7. Definition of done

- A real phone opens the outward camera by default when browser support allows,
  with a working flip control and native fallback.
- The user can capture and/or upload several photos, remove individual photos,
  analyze all of them, and send them with a Coach message.
- The Coach's reply demonstrates that the accepted images were actually sent
  to the model.
- A confirmed Station 12 inventory appears after signing into the same account
  on a second device; deleting it syncs as an empty/updated array.
- Existing single-photo API callers continue working.
- Automated tests, lint, production build, Python compilation, API probes, and
  390-pixel responsive browser verification pass.
- `docs/ARCHITECTURE.md`, `SESSION_START.md`, and the S24/S25 feature documents
  accurately describe the final behavior.
