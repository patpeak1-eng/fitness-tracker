# AI Coach Handoff Polish — S25.2

## Purpose

Make the two transitions immediately after a photo-assisted Coach interaction
feel continuous on a phone: return the conversation to view as the Coach
answers, and open a Coach-created workout at its preparation screen.

## Approach and decisions

1. When a Coach chat request containing attached photos is accepted for SSE
   streaming, close the equipment panel before reading the response stream.
   This unmounts the camera preview, releases its stream, and makes the Coach's
   reply visible without the user needing to dismiss the panel.
2. Do not close the panel when the request fails or when streaming is
   unavailable. The attached photos remain available so the user can retry.
3. Retain the existing privacy lifecycle: object URLs and raw image data are
   cleared only after a successful Coach reply. Closing the panel does not save
   or discard images by itself.
4. After the user explicitly starts a Coach-proposed plan, continue using the
   existing `startWorkoutFromTemplate` mutation, then route to `/track` rather
   than the dashboard. `/track` is the existing workout preparation surface.

## Scope

- `CoachView` handoff behavior only.
- Documentation for the temporary photo flow and architecture freshness.
- No AI API, model, database, authentication, Coach-history, or workout-data
  contract changes.

## Done looks like

- A successful photo-bearing Coach send immediately returns the user to the
  chat transcript while the response streams.
- Failed sends retain the current photos and leave the panel available for a
  retry.
- The Coach plan's **Start workout** action opens the preparation page directly.
- Build, lint, tests, and mobile layout checks remain clean.
