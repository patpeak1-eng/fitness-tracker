# FitTrack Design Tokens v2 — "Ember on Graphite"

**Status: LOCKED (approved 2026-07-04). This document supersedes the S11 token
system (blue-violet canvas + neon green) referenced in ARCHITECTURE.md §9 and
FABLE5_SESSION12_BRIEF.md §1.3/§6.**

Research basis: live product evidence from Hevy, Strong, Fitbod, and Nike
Training Club (S12 visual identity research, screenshots in session archive).
All values below are original — no competitor brand values are reproduced.

---

## 1. Color tokens

Every token has ONE reserved purpose. Using a token outside its purpose is a
review defect, not a style choice.

### Neutrals — graphite scale
Neutral charcoal with a barely-perceptible warm tint (OKLCH chroma ~0.004
toward the accent hue). Steps are lightness-only. No blue/purple cast.

| Token | CSS var | Hex | Reserved purpose |
|---|---|---|---|
| bg/canvas | `--bg-app` | `#0D0D0F` | App background. Nothing else. |
| surface/1 | `--bg-card` | `#161618` | Cards, grouped-list containers. |
| surface/2 | `--surface` | `#1E1E21` | Rows nested in a card; list items on canvas. |
| surface/3 | `--input-bg` | `#28282C` | Inputs, chips, wells, switch tracks — interactive recesses only. |
| line/hair | `--border` | `rgba(255,255,255,0.06)` | Hairline dividers inside groups + input borders. NOT card outlines — cards are borderless. |
| text/primary | `--text-primary` | `#F4F4F2` | Headings and all data values. Never pure #fff. |
| text/secondary | `--text-secondary` | `#9C9CA3` | Supporting copy, descriptions. |
| text/muted | `--text-muted` | `#5F5F66` | Labels, captions, disabled. |

### Accent + semantics

| Token | CSS var | Hex | Reserved purpose |
|---|---|---|---|
| accent/ember | `--primary` | `#FF5C2A` | THE brand color: primary CTAs, active nav item, selection states, interactive text, chart primary series. Never on headers, data values, or decoration. ≤10% of any screen. |
| accent/ember-dim | `--primary-dim` | `rgba(255,92,42,0.14)` | Selected-state tints and chart area fills only. |
| semantic/success | `--success` | `#3DC96E` | Completed sets, sync-ok, save confirmations. Never decorative. |
| semantic/pr-gold | `--pr-gold` | `#E9B84C` | PR badges/flags and warm-up set markers ONLY. |
| semantic/danger | `--danger` | `#E5484D` | Destructive actions and irreversible warnings only. |
| semantic/info-rest | `--rest-blue` | `#4C8DFF` | Rest-timer surfaces only. |

Cross-app grammar this encodes (Hevy/Strong/Fitbod evidence): green means
done, gold means PR/warm-up, blue means rest, ember means "tap here / active."
Numbers are NEVER accent-colored — data renders in `text/primary`.

## 2. Typography

- **Body/UI: Inter** (self-hosted woff2, weights 400/500/600/700 — no font
  CDN; PWA + strict CSP).
- **Display: Archivo SemiExpanded 700/800** (self-hosted) — screen titles and
  hero numerals ONLY. Never in rows, labels, or buttons.
- **Numeric rule:** any data value renders ≥1.5× its label's size and ≥2
  weight steps heavier, `font-feature-settings: "tnum"` always on for numeric
  display. Labels: 0.75rem/500, uppercase, +0.06em letterspacing, text/muted.
- Scale (rem): 0.75 label / 0.875 body-s / 1 body / 1.125 value /
  1.375 section-title / 1.75 screen-title / 2 hero-stat.

## 3. Surfaces — three treatments, assigned by content type

1. **Filled card** — surface/1, radius 12, **no border**. Data widgets:
   charts, overview bands, stat groups. Separation by lightness alone.
2. **Grouped rows** — surface/1 container, rows divided by line/hair.
   Settings, session lists, pickers. Never card-per-row.
3. **Recessed well** — surface/3, radius 8, hairline border allowed here only.
   Inputs, chips, segmented tracks.

Selection/completion states = background tints (ember-dim / success @ ~12%)
plus weight change — never border-color swaps. Radius scale unchanged:
12 cards / 8 rows+inputs / 999 pills / 10 CTA.

## 4. Iconography

lucide-react only (no emoji — standing rule). Default stroke ~1.75, sizes 20
(row controls) / 16 (inline). Icons inherit text color; accent fill/stroke
only on the active nav item or an explicitly selected control.

## 5. Light theme

Deferred per S12 decision (see backlog): the dark system above is primary.
The light mapping, when built, inverts the graphite scale (warm paper-white
canvas, charcoal text) and keeps every accent/semantic hex identical.
