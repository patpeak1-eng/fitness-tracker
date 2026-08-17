# Temporary AI Coach Photo Flow

## Purpose

Use this pattern when a person captures or uploads equipment photos for the AI
Coach. It supports two different user-controlled outcomes while keeping raw
visual media temporary:

1. Discuss the photos with the Coach on the next chat turn.
2. Identify equipment, review it, and save only the confirmed metadata as a
   named environment.

## When to Use

- Adding a camera, gallery-upload, or vision-analysis path to the Coach.
- Changing Coach attachments, photo previews, or location-equipment templates.
- Reviewing privacy behavior for image inputs.

## Method

1. Normalize selected images client-side and cap the attachment count before
   any provider call.
2. Keep thumbnails and image data only in component state. Do not write raw
   images to local storage, the database, Coach history, or logs.
3. Make both choices explicit while photos are attached:
   - **Identify equipment** calls `/api/coach/equipment/analyze`, displays an
     editable inventory, and requires an explicit save.
   - **Discuss with Coach** passes the same temporary images with the next
     `/api/coach/chat` message.
4. After a successful Coach reply, revoke object URLs and clear attachments.
   Show plain-language feedback that the photos were cleared for privacy.
5. When no photos are attached, teach the prerequisite instead of displaying a
   disabled detector that looks broken.
6. Persist only the confirmed environment name and canonical equipment list via
   `equipment_environments`; use the existing local-first hydration and sync
   pattern.

## Gotchas

- A `<video>` element used as a camera preview is not live-video coaching. Do
  not describe it as video streaming or remove it when live video is deferred.
- Do not auto-save AI equipment suggestions. Photo recognition can be incomplete
  or uncertain, so the user must review it first.
- Preserve the old singular image request shape when expanding a vision endpoint
  to multiple photos; existing clients may still depend on it.
- A successful Coach chat intentionally clears attachments. If a user sends
  photos before choosing Identify equipment, they must add them again to create
  a saved inventory. Make that lifecycle visible in the interface.
