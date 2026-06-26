# Skill: Ref-Bridge Context Dependency Pattern

## Purpose
Pass a live callback from a parent context (WorkoutContext) into a child context
(TimerContext) without causing stale closure bugs or infinite re-render loops.

## When to Use
- Two nested React contexts where the child needs to call a function owned by the parent
- The parent function reads frequently-changing state (e.g. canSyncToBackend)
- You cannot use useContext in the parent because the child is nested inside it

## Method
1. Create a `useRef(null)` in the parent (WorkoutProvider): `const timerApiRef = useRef(null)`
2. Pass the ref down as a prop to the child provider: `<TimerProvider apiRef={timerApiRef}>`
3. In the child provider, populate the ref with its imperative API on mount:
   `useEffect(() => { apiRef.current = { startRest, stopRest, ... }; }, [])`
4. In the parent, call the child's methods via `timerApiRef.current?.startRest()`
5. For the reverse direction (child reading parent state): pass a stable callback prop,
   store it in a ref inside the child: `const canSyncRef = useRef(cb); canSyncRef.current = cb`
   Call it as `canSyncRef.current?.()` — always reads the latest value, no stale closure.

## Gotchas
- Never put the callback directly in a useEffect dependency array — use the ref pattern
- The ref population useEffect in the child must have an empty dependency array
- Test that the ref is populated before calling: `timerApiRef.current?.method()`

## Project Usage
- `src/context/WorkoutContext.jsx` → `timerApiRef` passed to TimerProvider
- `src/context/TimerContext.jsx` → populates `apiRef.current`, reads `canSyncRef`
- Introduced in Session 7, commit d814b33
