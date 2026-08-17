# S25.1 AI Coach Photo-Flow Maintenance

## Purpose

The still-photo workflow is field-proven: a person can capture several pieces
of available equipment, ask the AI Coach for a workout, review the proposed
session, and begin training. This maintenance release makes the two legitimate
uses of those photos clear without adding live video, a new AI provider, or any
new persisted data.

## Decisions

1. Still photos remain the current visual input. Live or continuous video is
   explicitly deferred until normal use demonstrates a need that photos cannot
   meet.
2. Attached photos have two separate, user-controlled paths:
   - **Discuss with Coach:** send the photos with the next Coach message.
   - **Identify and save equipment:** analyze the photos into an editable list,
     then save the confirmed list as a named environment.
3. Raw photo data remains temporary. After a successful Coach reply, the app
   clears the attachments and explicitly explains why. This preserves the S25
   privacy contract while preventing the disabled detector state from looking
   broken.
4. When no photos are attached, the UI teaches the prerequisite instead of
   displaying an unexplained disabled action.
5. No automatic equipment save occurs. The user continues to review detected
   equipment and explicitly chooses **Use this equipment**.

## Scope

- `CoachView` copy and state feedback only.
- Existing `EquipmentPhotoCapture` component and existing API contracts are
  reused unchanged.
- Architecture, handoff, and technical reference documents record the deferred
  video decision and the clarified photo lifecycle.
- Remove two lint suppressions that ESLint reports as obsolete.

## Done when

- A user with attached photos can clearly choose whether to identify equipment
  before saving it or send the photos to the Coach for discussion.
- A user who has already sent photos sees an explanation that they were cleared
  for privacy and how to identify/save equipment next time.
- The detector is not presented as a non-functional control when there are no
  attachments.
- Documentation agrees that video is deferred, raw photos are transient, and
  S25.1 is reflected in the architecture maintenance history.
- Lint, unit tests, production build, and mobile browser checks pass.
