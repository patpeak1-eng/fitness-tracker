# Visual Identity Research v3 — Findings (Session 22)

**Status:** Research complete, awaiting coordinator review. NOT a spec, NOT a decision.
**Zone:** LOW (research + documentation only; nothing in `src/` or `backend/` touched).

**Scope of this pass:** what makes premium mobile interfaces *feel* premium at the
structural/technique level — typography scale, elevation/depth systems, motion, signature
devices, and color-as-meaning. This deliberately does NOT revisit the Session 9
functional/UX competitive research (equipment profiles, logging speed, previous-performance
display, rest-timer placement — that work stands). It evaluates against, but does not
extend, the LOCKED Design Tokens v2 "Ember on Graphite" system (`docs/DESIGN_TOKENS.md`).

**Method:** three parallel research agents inspected live evidence — marketing sites with
real UI screenshots, App Store listing assets (inspected at 920×1992), the makers' own
design blog posts and brand guidelines, and third-party teardowns/case studies. Every
claim below carries a source. No competitor asset is reproduced anywhere in this doc or
the mockups; techniques only.

**Apps studied (8):**
- Fitness/health, re-read for visual personality: **Whoop, Strava, Fitbod, Nike Training
  Club, Oura**
- Outside fitness, chosen for depth/typography/motion craft: **Copilot Money** (premium
  finance), **Halide** (premium camera, Lux Optics), **Linear** (premium productivity)

---

## PART 1 — PER-APP BREAKDOWNS

### 1.1 Whoop (dark instrument panel)

- **Typography:** two typefaces with split roles — **Proxima Nova for words, DINPro for
  numbers** (official brand/design guidelines, developer.whoop.com). DINPro is a tabular
  engineered grotesque: numbers read as instruments. The hero Recovery score renders at
  roughly 72pt-equivalent while labels stay deliberately small — a **~5–7× hero-to-label
  ratio**, one giant number per screen, heavy numerals over light labels
  (925studios.co/blog/whoop-design-breakdown).
- **Elevation/depth:** tonal, not shadow-based, on a near-black canvas; ~3 surface tiers
  matching a three-tier IA (glanceable score → trend card → deep-dive graph). Colored data
  "pops against black" as the content layer. Minimal gradient/glow — the black does the work.
- **Motion:** restrained and orientation-preserving; "smooth animations maintain spatial
  context" between disclosure tiers. Rings/arcs fill to their value, hero numbers count up.
  Expression is concentrated in the one hero metric; navigation stays simple.
- **Signature device:** the **color-coded circular score gauge** — since the 2025 home
  redesign, three stacked dials (Sleep / Recovery / Strain) at the top of Home
  (whoop.com/thelocker). Arc track filled 0–100%, fill and centered numeral both take the
  semantic state color. Read *number + color* in one glance.
- **Color:** almost entirely semantic, near-zero decoration. Tiny fixed vocabulary:
  recovery green / yellow / red bands + strain blue. Designer Martin Oberhaeuser (Bureau
  Oberhaeuser): a color "can be red, yellow, green only if we don't need red, yellow, or
  green anywhere else." High saturation permitted ONLY on data, never chrome. The dark
  theme is framed as functional (readable at 5:30am), not stylistic.

### 1.2 Strava (warm brand over clinical data)

- **Typography:** two-typeface split by *domain*: **Inter for app UI and all data**
  (tabular figures for stat blocks), **Boathouse** — a custom Grilli Type face from the
  2024 refresh — for branding/headlines: "friendlier, more modern, rounded"
  (sensatype.com; kristopherboyce.com/work/strava). Feed stat-to-label ratio is a moderate
  ~2–3× — feed-dense, not one-giant-number.
- **Elevation/depth:** light-canvas card feed (dark mode added June 2024, which required
  rebuilding "thousands of assets" — press.strava.com); depth via card separation on
  neutral ground; the map tile is itself a distinct elevated "window" surface inside cards.
- **Motion:** understated in the daily feed (route lines draw on, light kudos animations);
  expression is saved for **shareable recap moments** (Year in Sport, 3D flyovers).
  Restraint in the loop, expression in the highlight reel.
- **Signature device:** the **map + route line + heatmap** — every activity is
  fundamentally a line on a map; the global heatmap renders aggregate effort as glowing
  orange heat. The 2024 icon system encodes the same language (2px base strokes, 45°
  angles referencing the logo's 78° "momentum" angle — griffdesigns.com/strava).
- **Color:** one anchor equity color (Strava orange ~#FC5200) carrying identity and the
  heatmap's hottest values; the 2024 refresh broadened to an emotive palette (hyper green,
  electric blue, sand beige). Saturation here is **brand energy**, not a strict data code —
  the opposite discipline from Whoop.

### 1.3 Fitbod (one hue with semantics)

- **Typography:** one sans family, differentiated by weight + posture: **bold
  italic/oblique for every structural heading and hero numeral** (kinetic connotation).
  Body-screen hero numerals ~**4–5× their labels**; labels ~10–11pt ALL-CAPS tracked out.
  Row scale is flat (~1.25 step) — drama lives only in headings/numerals. (App Store
  listing assets inspected at 920×1992.)
- **Elevation/depth:** pure tonal steps on near-black, 3 levels (canvas → card/row →
  chip/pill with hairline border), plus a 4th used ONLY for the selected item, which lifts
  to a lighter slate **with a real drop shadow — shadow is reserved as a selection/drag
  signal, not decoration**. Floating pill tab bar. No blur, no glass, no surface gradients.
- **Motion:** functional and restrained; 3D body model rotates; selection states lift;
  a deliberate post-set "Exertion Rating" micro-interaction (screensdesign.com).
- **Signature device:** the **muscle-recovery body heatmap** — an anatomical silhouette
  with per-muscle fills on a single-hue intensity ramp (muted mauve → hot red-pink)
  encoding recovery. Crucially it is not a chart in the UI; it IS the screen, and the
  data-encoding hue and the brand accent are the SAME red — the brand color literally
  means "trained muscle" (help.fitbod.me).
- **Color:** effectively **one meaningful hue** doing triple duty — brand accent, data
  encoding, attention labels — over a gray ladder. Dark canvas + one-hue-with-semantics +
  oblique type = a complete identity on a tiny palette budget.

### 1.4 Nike Training Club (poster typography, monochrome chrome)

- **Typography:** hard split between campaign voice and product voice. Display:
  proprietary **Futura Extra Bold Condensed, ALL-CAPS, near-zero leading (~0.9–1.0)** at
  poster scale — ~**5–7× body size**, with deliberate scale contrast inside one lockup
  ("300+" smaller than "WORKOUTS" beneath it). Product UI: a plain neo-grotesque at
  conservative sizes. The condensed face almost never appears inside utility screens —
  **the restraint is the trick** (fontsinuse.com/uses/14239).
- **Elevation/depth:** radically flat — **2 levels at most** on a white canvas: background
  and full-bleed photo cards. No shadows, no borders, no tonal cards. Depth is produced by
  **photographic contrast** (dark grainy gym photography against white UI).
- **Motion:** app chrome is static; expression is **delegated to content** — the workout
  player video, and (in sibling NRC, per the COLLINS case study) generated cover art with
  "repeating and layering dynamic silhouettes" and per-run-type expressive typography.
- **Signature device:** the **oversized condensed all-caps type block over photography** —
  white or black, multi-line, stacked flush-left, with a small sentence-case subline as
  scale foil. The one element that makes any screen unmistakably Nike without the swoosh.
- **Color:** essentially zero semantic color in core UI — black/white/gray with all chroma
  imported via photography. Monochrome UI + loud type + real photography reads premium
  with no color system at all.

### 1.5 Oura (score-as-landscape, serif interpretation)

- **Typography:** confirmed **two typefaces, sans + serif** — UI/measurement in a quiet
  grotesque (Akkurat family), interpretation/coaching in a display **serif** (PP Editorial
  New on ouraring.com; in-app insight headlines and the serif-italic Home greeting).
  Role split is *affective*: **sans = measurement, serif = interpretation**. Hero scores
  are **light-weight** sans at ~3.5–4× their small-caps labels — thin numerals on dark
  read calm/clinical, the exact opposite of Fitbod's heavy obliques.
- **Elevation/depth:** tonal, 3 levels (near-black canvas → charcoal cards ~16px radius →
  floating pill tab bar), no hard shadows. Oura's real depth tools are **atmosphere**:
  full-bleed photography gradient-fading into the canvas, generative contour-line
  headers, luminous arcs with gaussian glow. Blur/glow substitutes for elevation.
- **Motion:** "progressive disclosure" with "dynamic color cues [that] direct attention"
  (Instrument case study, instrument.com/work/oura-app); gauge arcs sweep 0→100; tone
  documented as "clarity, warmth" — restrained, ambient, no celebratory bursts.
- **Signature device:** the **score-as-landscape hero** — one dominant daily number
  ("One Big Thing"), light-weight, over an atmospheric image/gradient, capped by a thin
  0–100 arc gauge, a serif interpretive line beneath, a small-caps status word. The
  circle motif recurs at every zoom level: ring hardware = score gauge = dataviz primitive.
- **Color:** the most semantically loaded studied — parts of the app change color with
  biometric state (~4–5 hues, ALL meaningful: green good, amber needs-care, teal thriving,
  glowing blue neutral). Decoration is handled by photography/gradients, never palette.

### 1.6 Copilot Money (neutral shell, saturated data, spring motion)

- **Typography:** native SF Pro base, heavily tuned ("It's all native; we just tweak it a
  lot" — developer.apple.com/articles/copilot-money/). Hierarchy carried more by **weight +
  color than by size** (hero amounts ~2–2.5× body, semibold); tabular figures for currency
  columns.
- **Elevation/depth:** ~3 levels (canvas → card → sheet/modal); tonal card fill plus soft
  low-spread shadows in light mode, **tonal-only in dark mode**. Light and dark shipped as
  first-class equals (Matt Ström-Awn case study).
- **Motion:** the best-documented strength — Apple's 2024 ADA finalist citation praises its
  "high-quality animations." Spring-based native physics on **number roll-ups, chart
  draw-in, and category pill state changes**. Expressive on purpose: motion is part of
  "makes money friendly."
- **Signature device:** the **colored category system + rounded amount pills** — every
  category gets a hue + bespoke glyph (50+ custom icons), and that hue propagates through
  pills, budget bars, chart segments, and transaction rows. Construction: saturated
  mid-tone hue on a ~10–15%-alpha tinted pill, glyph + amount in the full-strength hue.
  Color = category identity everywhere; a dense screen becomes scannable without labels.
- **Color:** meaningful color dominates (8–12 category hues + semantic chart colors);
  canvas and chrome stay neutral. The 2023 rebrand dropped "cartoon visuals" for chrome
  restraint while keeping saturation in data. **Neutral shell, saturated data.**

### 1.7 Halide (instrument metaphor, motion as absence)

- **Typography:** the most committed custom-type story in consumer apps — Mark II shipped
  **three custom typefaces** (the "Ambrotype" family: regular, bold, monospaced) designed
  "to resemble the aesthetic of the etched text on film cameras"
  (lux.camera/pro-camera-action-introducing-halide-mark-ii/). Key numeric move: a
  dedicated **monospaced variant for instrument readouts** (shutter/ISO/EV) — data never
  reflows. Compressed scale: small caps-height labels everywhere; hierarchy via position
  and light, not size.
- **Elevation/depth:** near-zero conventional elevation — the viewfinder image is the
  canvas; UI is translucent chrome floating over it (2 effective levels). Hardware-aware
  layout (histogram beside the notch; controls curve to device corners).
- **Motion:** doctrine of restraint, explicitly named **"Stay out of the way"** /
  "Intelligent Activation": "When you begin dragging the focus dial, our new Focus Loupe
  activates. When you release your finger, it deactivates." Tools animate in only when the
  gesture that needs them begins. Gestures replace chrome.
- **Signature device:** the **analog instrument metaphor**, constructed literally — an
  exposure meter "similar to a classic analog camera," and a **film window** showing the
  loaded "Look," "inspired by how some analog cameras feature a window which reminds you
  of the film you loaded" (lux.camera/halide-mark-iii/). Every element maps to a physical
  camera part.
- **Color:** UI essentially monochrome (near-black chrome, white/amber readouts); chroma
  belongs to the photograph. Their stated law: "when [every] tool has equal visual
  importance, nothing has importance."

### 1.8 Linear (tonal ladder + hairlines, one rationed accent)

- **Typography:** Inter Display for headings ("to add more expression to our headings"),
  Inter for body, custom Linear Mono for code/data. Extracted marketing scale: 80px/600
  weight/−3.0px tracking → 56 → 40 → 28 → 22 → 16 body → 12 caption — roughly a **1.4×
  step ratio at display sizes flattening to ~1.15× near body**, with negative tracking
  that scales with size (tighter-as-bigger). Weights stay in a narrow 400–600 band
  (linear.app/now/how-we-redesigned-the-linear-ui; getdesign.md extraction).
- **Elevation/depth:** the canonical dark-surface ladder, **borders-not-shadows**: canvas
  #010102 → four surface steps to #191a1b separated by **1px hairline borders** — and the
  tonal steps *shrink* as they approach black (~1 lightness unit at the top). In-product:
  five named layers (background, foreground, panels, dialogs, modals) generated from just
  **three LCH theme variables**, replacing 98 hand-set ones.
- **Motion:** speed-first restraint — high-frequency keyboard-driven interactions don't
  animate; motion reserved for spatial transitions (panel/modal enter), observed sub-200ms.
  **The restraint itself is the finding: motion never taxes the core loop.**
- **Signature device:** the **hairline-and-glow surface language** — 1px low-contrast
  borders defining every edge on near-black, the single lavender accent appearing as focus
  rings, subtle top-edge gradients, and occasional radial glows bleeding through a border.
  Depth without shadow.
- **Color:** one chromatic accent, ruthlessly rationed (brand mark, focus rings, one CTA
  per section, "no second chromatic color"); four neutral ink steps carry ALL text
  hierarchy; one semantic green. The redesign explicitly **reduced** chroma for "a more
  neutral and timeless appearance."

---

## PART 2 — SYNTHESIS: CROSS-APP TECHNIQUES

These are not opinions. Each appeared independently across multiple unrelated sources.

### T1. Split type voices: a dedicated "instrument" face for numbers (7 of 8 apps)

Whoop (Proxima Nova words / DINPro numbers — official guideline), Halide (custom
monospaced variant for readouts), Linear (Inter Display / Inter / Linear Mono), Strava
(Boathouse brand / Inter data), Oura (sans measurement / serif interpretation), NTC
(condensed campaign display / grotesque utility UI), Copilot (SF tuned, tabular figures).
The premium move is not "a nicer font" — it is **giving data its own typographic voice**,
distinct from prose, usually tabular or monospaced so values never reflow. Our current
system has half of this (Archivo display + Inter + tnum) but Archivo is scoped to titles
and hero numerals only, and there is no mono/instrument voice at all.

### T2. Hero-stat scale drama: 4–7× label size, ONE hero per screen (5 of 8)

Whoop ~5–7×, NTC ~5–7×, Fitbod ~4–5×, Oura ~3.5–4×, Linear display top ~5× body. Two
sub-rules travel with it: (a) only ONE number per screen gets the treatment — Whoop's
"one giant number," Oura's "One Big Thing"; (b) the label stays tiny, tracked-out
small-caps, creating the ratio from both ends. **Our current scale tops out at 2.67×
(2rem hero / 0.75rem label) — measurably below every studied app.** This is the single
most quantifiable gap between our system and the premium tier.

### T3. Tonal ladders + hairlines carry depth; shadows are reserved for state (6 of 8)

Linear (borders-not-shadows, shrinking steps near black), Whoop (tonal tiers on black),
Fitbod (3 tonal levels; a real drop shadow appears ONLY on the selected/dragged item),
Oura (tonal + glow, no hard shadows), Copilot (tonal-only in dark mode), Halide
(translucency over content). Convergent finding: on a dark canvas, drop shadows don't
read — lightness steps and 1px hairlines do the everyday work, and when a shadow DOES
appear it *means something* (selection, drag, pickup). Our current system has the tonal
ladder (4 graphite steps) but no z-axis rules at all: no overlay/modal treatment, no
elevation-as-state, and cards are borderless by rule with hairlines scoped to dividers.

### T4. One signature device, repeated at every zoom level (8 of 8 — unanimous)

Whoop's color-coded gauge, Strava's map line/heatmap, Fitbod's muscle heatmap, NTC's
condensed type block, Oura's arc-over-atmosphere, Copilot's colored category pills,
Halide's film window/instrument meter, Linear's hairline-and-glow edge. Every single
studied app has exactly ONE structural motif that appears across multiple screens and
carries real meaning — and identity lives there, not in the palette. **Our app currently
has zero signature devices** — the goal ring on Dashboard is a one-off that recurs
nowhere else. This is the clearest diagnosis of "functionally excellent but visually
generic."

### T5. Motion budget: spend on data moments, never on the core loop (6 of 8)

Halide ("stay out of the way" — tools appear on gesture, disappear on release), Linear
(no animation on keyboard-driven paths, sub-200ms elsewhere), Whoop (count-ups and gauge
fills on the hero metric only), Copilot (springs on number roll-ups and chart draw-ins —
the *data* animates), Strava (static feed, expressive recaps), NTC (static chrome,
expression delegated to content). The convergent rule: animate the moment a NUMBER
arrives or changes (count-up, gauge sweep, chart draw); never animate the high-frequency
interaction path (set logging, navigation). For a workout logger — where the core loop is
tapping "set complete" dozens of times — this maps perfectly: log instantly, celebrate
the summary. We currently have zero motion tokens, so even this cheap, well-bounded
motion vocabulary has nowhere to live.

### T6. Saturation = signal: neutral shell, meaningful color only (6 of 8)

Whoop (every hue semantic, none decorative), Fitbod (ONE hue = brand + data + attention),
Linear (one accent, "no second chromatic color"), Copilot (neutral chrome, saturated
category data), Oura (4–5 hues, all state-driven), Halide (chroma belongs to content).
Validation, not a gap: Design Tokens v2 already encodes exactly this discipline
(purpose-per-token, ≤10% ember, numbers never accent-colored). The redesign should NOT
add palette — the studied apps say our color system is already at the premium standard.
The gaps are structural: scale (T2), depth grammar (T3), a signature device (T4), motion (T5).

---

## PART 3 — WHAT THIS MEANS FOR "EMBER ON GRAPHITE"

The v2 token system survives this research almost entirely intact on COLOR (T6) and holds
on surface treatment basics. The confirmed gaps, in priority order:

1. **No signature device** (T4 — unanimous across 8 apps). Highest-leverage single fix.
2. **Type scale not dramatic enough** (T2 — 2.67× vs the 4–7× premium band), and no
   instrument/mono voice for data (T1).
3. **No z-axis system** (T3) — no overlay/modal/elevation-as-state grammar.
4. **No motion tokens** (T5) — even a 3-token vocabulary (duration-fast/slow + one ease)
   scoped to "data moments only" would close the gap the cheap way.

The four concept directions below each take a different, internally-consistent position
on T1–T5. They share the graphite neutrals and semantic colors (T6 says keep them) but
are otherwise deliberately different personalities.

---

## PART 4 — CONCEPT DIRECTIONS (mockups in `docs/design_research_mockups_s22/`)

Static throwaway HTML/CSS, not wired to the app. Rendered at 375×812. Mockups use Google
Fonts CDN for convenience ONLY — production would self-host per the standing no-CDN rule.

### Direction A — "Instrument Panel" (`a_instrument_panel.html`)
Whoop/Halide lineage. The dashboard as a cockpit gauge cluster.
- **Signature device:** the **arc gauge + engraved mono readout strip** — a thin 270° arc
  with tick marks around the week's hero number, echoed by a monospace data strip
  (volume / streak / PRs) that reads like etched instrument text. The arc motif would
  recur on Analytics (progress arcs) and WorkoutSummary (completion sweep).
- **Type:** giant tabular hero numeral (~6× label), JetBrains Mono for all readouts,
  tracked-out engraved small-caps labels. One hero per screen.
- **Depth:** 2 tonal levels + hairlines only; shadow reserved for the active/selected row.
- **Motion note:** gauge sweep + count-up on load; nothing else.

### Direction B — "Training Block" (`b_training_block.html`)
NTC lineage. The dashboard as a gym poster.
- **Signature device:** the **oversized condensed all-caps type block** — stats set as
  stacked flush-left poster lockups with near-zero leading; the week's status IS the
  typography. Recurs as section headers everywhere and as WorkoutSummary's shareable card.
- **Type:** Archivo Expanded/Black in the 6–7× band, deliberate scale contrast inside one
  lockup, sentence-case foil lines.
- **Depth:** radically flat, 2 levels, full-bleed blocks, no cards at all in the hero zone.
- **Motion note:** static chrome; expression delegated to the numbers themselves.

### Direction C — "Ember Atmosphere" (`c_ember_atmosphere.html`)
Oura/Copilot lineage. The dashboard as a calm briefing that "knows you."
- **Signature device:** the **score-over-atmosphere hero** — a light-weight hero number
  over a subtle ember-glow gradient fading into graphite, capped by a thin arc, with a
  **serif interpretive line** beneath ("Ahead of last week. Legs are due.").
- **Type:** thin (300-weight) hero numerals ~5× label; Fraunces serif for interpretation
  only; sans for all measurement.
- **Depth:** tonal + glow-as-atmosphere; gradients allowed ONLY in the hero band.
- **Motion note:** slow arc sweep, gentle number fade-up; ambient, no bursts.
- **DEPENDENCY FLAG:** the interpretive line needs a sentence source. A rule-based line
  (compare this week vs last from existing `history`) is computable locally today; an
  AI-written line would need a new coach call path. Flagged, not assumed.

### Direction D — "Signal Grid" (`d_signal_grid.html`)
Linear/Fitbod lineage. The dashboard as engineered software craft.
- **Signature device:** the **hairline grid with ember signal-glow** — every surface
  edged in 1px hairlines on near-black with shrinking tonal steps; ember appears only as
  a focus glow bleeding through the border of the ONE element that wants attention (the
  live-session card, or today's suggested action). Recurs as the selection language app-wide.
- **Type:** Inter Display, narrow weight band (400–600), negative tracking scaling with
  size, mono for data cells; density is the personality.
- **Depth:** 4 hairline-separated tonal steps; shadow ONLY on the lifted/selected card.
- **Motion note:** sub-200ms fades; the glow breathes on the live-session card; nothing else.

---

## PART 5 — FLAGGED DEPENDENCIES

- **Weekly goal (ring/gauge concepts A, C):** already exists — Dashboard hardcodes a
  4-workouts/week goal today. No new data needed (a user-configurable goal would be a
  nice-to-have, not a dependency).
- **Weekly volume, streak, PR count (all directions):** all computable from existing
  `history` (sets carry `isPR`; volume = Σ weight×reps). No new data.
- **Interpretive sentence (Direction C only):** rule-based version computable from
  existing local data; AI-written version would be new backend scope. Flagged above.
- **No direction requires schema, backend, or WorkoutContext changes to be evaluated.**

---

*Compiled Session 22 (2026-07-15) from three parallel research passes. Sources cited
inline per finding. Coordinator review required before any direction is locked or any
implementation prompt is written.*
