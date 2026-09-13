# Skill: Provider-Level Testing, and Proving a Test Can Fail

## Purpose
Test a `WorkoutContext` behaviour through the real provider — mounting it and
calling the function the UI calls — and then prove the test would actually fail
if the behaviour broke.

This exists because of a specific, repeated failure on this repo: **tests that
pass against deliberately broken code**. During S32 Fix 1b, a reviewer stubbed
the body of `deleteWorkout` so it did nothing at all, and every one of the 54
helper-level tests stayed green. Helper tests only show that a helper agrees
with the assumptions of whatever calls it in the test; they never show the app
is wired to it.

## When to Use
- Any change to `WorkoutContext.jsx` behaviour a user can trigger.
- Anything touching deletion, sync, persistence, or profile scoping — the
  places where a silent no-op looks identical to success.
- Any bug fix where you cannot state, concretely, which assertion would go red
  if the fix were reverted.

Not needed for pure helpers with no provider wiring, or for copy and CSS.

## Method

**1. Mount the real provider.** `jsdom` is already a dependency; there is
deliberately no `@testing-library/react` — `react-dom/client` plus `React.act`
is enough, and a new dependency for one file is not worth the supply-chain
surface (see THIRD_PARTY_SKILL_AUDIT_RULE).

```jsx
// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let ctx = null;
const Probe = () => { ctx = useContext(WorkoutContext); return null; };
// render <WorkoutProvider timerApiRef={{current:{}}}><Probe/></WorkoutProvider>
```

Take the function off the **context**, not from the module. A change that stops
exporting it through the provider then fails the test too.

**2. Mock only the trust boundary.** Mock `ApiService`; leave `StorageService`
and `SyncQueue` real, so assertions are about what actually lands in storage.
Derive the mock from the real module's exports rather than listing them by
hand — a hand-written list goes stale as `ApiService` grows, and the resulting
"no export is defined on the mock" error looks like a bug in the code
under test:

```js
vi.mock('../services/ApiService', async (importOriginal) => {
    const actual = await importOriginal();
    const mocked = {};
    for (const name of Object.keys(actual)) mocked[name] = vi.fn(async () => undefined);
    mocked.isAvailable = vi.fn(() => true);
    return mocked;
});
```

**3. Mutation-check every new test.** Revert the fix — or stub the handler —
and confirm the test goes red. Record the mutation you ran in the commit
message. A test that has never been observed failing is not evidence.

Check *both* directions when the obvious wrong fix is to over-apply something.
The pull-ordering fix is the example: removing the generation check fails 1
test, but making it discard everything fails 11. Only running the first
mutation would have hidden a broken over-fix.

**4. Assert preconditions when the setup could silently no-op.** If the test
depends on a switch, a mode change, or a queue write failing, assert that it
happened. Otherwise a setup that quietly does nothing produces a green test.

## Gotchas

- **`clearAllMocks` keeps spy implementations.** Use `vi.restoreAllMocks()` in
  `beforeEach`. A `localStorage.setItem` spy that throws will otherwise leak
  into every later test in the file and quietly change what they exercise.
- **Node's experimental `localStorage` shadows jsdom's** ("--localstorage-file
  was not provided"), so `localStorage` is `undefined` even with a proper jsdom
  URL. Install a small in-memory shim; it is a key/value map, so nothing is lost.
- **`switchProfile` reads the provider's React `profiles` state**, which
  `refreshGlobalState` seeds from storage *on mount*. Seed `fitness_profiles`
  **before** mounting or the switch silently does nothing.
- **`refreshProfileData` is not on the context.** Calling
  `ctx.refreshProfileData?.(...)` is a no-op that passes unconditionally. Drive
  a pull by changing the `currentProfile` object instead.
- **No true cold start in-process.** `SyncQueue` is a module singleton whose
  `init()` is guarded by an `initialized` flag, and `vi.resetModules()` does
  **not** clear the `vi.mock` factory cache — the re-import returns the same
  mocked module. Pin boot recovery as two separate facts instead: the provider
  calls `init()`, and a replay issues a *new* request with call history cleared
  at the restart boundary.
- **Don't `expect()` on a mocked module object.** The pretty-printer probes it
  for `$$typeof` and the mock throws on undefined exports. Compare as a boolean:
  `expect(a === b).toBe(false)`.
- **Don't assert a test-count or mutation-count in `ARCHITECTURE.md`.** It is
  stale the moment anyone adds a test — the same drift that put an exercise
  count in the Coach prompt. Numbers belong in the commit message, which is
  dated by construction.

## Precedent
Five assertions on this repo turned out to be incapable of failing, each
passing against deliberately broken code:

| Vacuous assertion | Why it could not fail |
|---|---|
| `expect(true).toBe(true)` at the end of a retry test | asserts nothing |
| `ctx.refreshProfileData?.(...)` in a stale-pull test | not on the context; optional chaining no-ops |
| `getState().deadLetterCount \|\| 0` | `getState()` never exposes that field |
| `{}` fixture for a two-part guard | the *other* half already rejected it |
| a profile-switch ownership test | `switchProfile` silently did nothing |

Three were found by mutation-checking, two by review. None by reading the test.
