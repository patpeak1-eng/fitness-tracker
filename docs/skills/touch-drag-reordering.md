# Touch drag-to-reorder without a dependency

## Purpose

Build a list where an item can be dragged to a new position with a finger, on a
phone, using Pointer Events and no drag-and-drop library. Captures the two
mistakes that shipped broken in S34.

## When to use

Any reorderable list in this app. The prep screen (`TrackWorkout.jsx` +
`ExerciseResult.jsx`) is the worked example.

## Method

1. **A dedicated handle, with `touch-action: none` on it.** That single CSS
   declaration is what stops the page scrolling when the drag starts, and it is
   why no press-and-hold delay is needed: a press on a grip can only mean
   "move this". A hold delay on a dedicated handle is latency for nothing.

2. **Key rows by a stable instance id, never by array position.** An index key
   makes React discard and rebuild the row when the order changes, which
   destroys the element the gesture is attached to.

3. **Preview, then commit. Do not reorder the list while the pointer is down.**
   The dragged row carries the live pointer offset as an inline
   `translateY`; rows it would displace translate by one row pitch; the real
   mutation runs once, on `pointerup`. See the gotcha below for why this is not
   optional.

4. **Measure row geometry once, when the drag arms**, not on every move. Rows
   vary in height, so assumed heights drift — but re-measuring mid-gesture reads
   your own preview transforms back in.

5. **Arm after ~6px of movement**, so a tap on the handle is not a drag.

6. **`pointercancel` is an abort, not a drop.** Commit nothing on it.

7. **Keep a keyboard path.** Arrow Up/Down on the focused handle, doing the same
   mutation. It is three lines and it is the only path a screen reader has.

8. **Guard the mutation in both the context and the service**, like every other
   active-workout mutation here: refuse outside `preparing`, on an unknown id,
   on an out-of-range index, and on a no-op, returning `prev` by identity.

## Gotchas

- **Reordering the live array during the drag kills the gesture on touch.**
  This is the one that shipped. React moves the row's DOM node; moving the node
  that holds pointer capture releases the capture and fires `pointercancel`; on
  touch the pointer is then gone, so no further `pointermove` arrives. The drag
  dies within a few pixels. On a mouse it partially survives, which is exactly
  why desktop testing did not catch it.

- **A suite that only drives the keyboard path proves nothing about the drag.**
  S34's reorder tests were all `KeyboardEvent`s, so a completely non-functional
  drag sat behind a green suite. Dispatch real pointer events: `pointerdown` on
  the handle, `pointermove` on `window`, then `pointerup`. In jsdom,
  `getBoundingClientRect` returns zeros — stub it per card to give the rows
  real geometry, and construct `PointerEvent` with a `MouseEvent` fallback.

- **Never call the mutation from inside a `setState` updater.** StrictMode
  invokes updaters twice, so the reorder would apply twice. Keep the target
  index in the drag ref and commit from the event handler.

- **Scrolling mid-drag skews the target**, since the rects are from drag start.
  Touch cannot hit this while the handle carries `touch-action: none`; a mouse
  wheel can. Known and accepted in the prep screen.

## Related

Long lists: a compact mode that collapses rows to a single line makes a
multi-position move one short drag. Collapse the rows — do not scale the page,
which shrinks the type and the touch targets with it.
