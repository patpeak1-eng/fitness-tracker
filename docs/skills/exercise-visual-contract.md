# Exercise Visual Contract

## Purpose

Keep exercise visuals reliable across the library, preparation, and guided
workout surfaces without duplicating image data or adding remote dependencies.

## When to Use

- An exercise visual is missing, incorrect, or falls back unexpectedly.
- Adding or changing an exercise instruction, detail, or guided-workout view.
- Migrating legacy or custom exercise records.

## Method

1. Treat `exercise.illustration` as the canonical built-in visual path. It
   maps to an asset in `public/illustrations/` and is served at that path by
   Vite/Railway.
2. Allow `exercise.imageUrl` only as a fallback for legacy or custom records.
   Never prefer it over a known local illustration.
3. Reset image-error state whenever the resolved source changes, and provide a
   clear fallback if the resolved source cannot load.
4. Reuse the same resolved source in preparation detail and guided-workout
   instruction surfaces. Do not maintain separate visual maps per screen.
5. Before shipping, compare every declared built-in illustration path with the
   files in `public/illustrations/`, then probe at least one live asset.

## Gotchas

- `illustration` and `imageUrl` are different contracts. Checking only
  `imageUrl` makes every built-in visual appear missing even when its asset is
  present and deployed.
- A modal must call hooks before any conditional return, otherwise opening and
  closing it can violate React's hook ordering.
- Local illustration files are product assets, not external-source links. Do
  not add a misleading “View Source” link for them.
