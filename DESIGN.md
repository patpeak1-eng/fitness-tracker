---
name: Fitness Tracker
description: Mobile-first strength, nutrition, and AI coaching companion.
colors:
  canvas: "#0D0D0F"
  card: "#161618"
  surface: "#1E1E21"
  input: "#28282C"
  text-primary: "#F4F4F2"
  text-secondary: "#9C9CA3"
  text-muted: "#5F5F66"
  ember: "#FF5C2A"
  success: "#3DC96E"
  pr-gold: "#E9B84C"
  rest-blue: "#4C8DFF"
  danger: "#E5484D"
typography:
  display:
    fontFamily: "Archivo, Inter, system-ui, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  input: "8px"
  action: "10px"
  card: "12px"
  pill: "999px"
spacing:
  compact: "8px"
  standard: "16px"
  touch-target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.action}"
    height: "{spacing.touch-target}"
  input-default:
    backgroundColor: "{colors.input}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.input}"
  card-default:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "{spacing.standard}"
---

# Design System: Fitness Tracker

## Overview

**Creative North Star: "The Dependable Training Partner"**

Fitness Tracker is a focused training tool for use before and during workouts,
often on a phone in a home gym, commercial gym, or fire station. It should feel
capable, direct, and encouraging, with clear information hierarchy and familiar
mobile controls that disappear into the task.

The visual system is Ember on Graphite: a dark, warm-neutral training surface
with ember reserved for the next meaningful action. The interface rejects
decorative cyber styling, dense spreadsheet logging during a session, and AI
claims that imply the Coach has seen, saved, or changed something it has not.

**Key Characteristics:**

- Mobile-first, one-handed actions with at least 44px touch targets.
- Restrained accent use, with ember reserved for active or primary actions.
- Tonal grouping instead of excessive borders or stacked cards.
- Honest state feedback for camera, AI review, saved equipment, and errors.

## Colors

The palette is a warm graphite foundation with one action color and narrowly
scoped semantic colors.

### Primary

- **Ember**: the single action accent. Use for primary calls to action, active
  navigation, selected controls, and interactive text only.

### Neutral

- **Graphite Canvas**: application background.
- **Training Card**: grouped data and durable containers.
- **Working Surface**: nested rows and quiet status areas.
- **Input Well**: fields, chips, and interactive recesses.
- **Primary, Secondary, and Muted Text**: hierarchy for titles/data, support,
  and labels or disabled states.

### Named Rules

**The Ember Rule.** Ember occupies no more than ten percent of a screen. It
means tap, active, or selected, never decoration or data.

**The Semantic Rule.** Green means completed or saved, gold means PR or warmup,
blue means rest, and red is reserved for destructive or irreversible states.

## Typography

**Display Font:** Archivo with Inter and system sans fallbacks.
**Body Font:** Inter with system sans fallbacks.
**Label Font:** Inter with system sans fallbacks.

**Character:** Headings are compact and athletic; all task controls, rows, and
data remain in the highly legible body family.

### Hierarchy

- **Display** (800, 1.75rem): screen titles and hero numerals only.
- **Headline** (700, 1.375rem): section titles and major card headings.
- **Title** (700, 1.125rem): card titles and values.
- **Body** (400, 1rem, 1.5 line-height): coaching copy and form content.
- **Label** (500, 0.75rem): captions, field labels, and supporting metadata.

### Named Rules

**The Data Rule.** Data values use primary text and tabular numerals where
needed. They are never ember-colored merely to draw attention.

## Elevation

Depth comes primarily from graphite tonal layering. Cards sit on the canvas,
and inputs recede into a darker working surface. Shadows are reserved for
meaningful raised or floating moments, not applied to every container.

### Shadow Vocabulary

- **Floating Surface** (`0 8px 32px rgba(0, 0, 0, 0.4)`): contained overlays
  and rare elevated panels.
- **Action Glow** (`0 0 20px rgba(255, 92, 42, 0.12)`): restrained feedback for
  an ember action, never a persistent decorative halo.

## Components

### Buttons

- **Shape:** gently rounded actions, 10px for standard calls to action and
  999px only for compact pills or circular controls.
- **Primary:** ember background, graphite text, at least 44px high.
- **Secondary:** graphite or input-well surface with secondary text.
- **Disabled and Loading:** communicate unavailable or in-progress work with
  copy and state, not opacity alone.

### Chips

- **Style:** input-well background, 8px radius, compact labels.
- **State:** selected chips use the ember-dim tint and a clear text or icon
  change; selection never depends on border color alone.

### Cards / Containers

- **Corner Style:** 12px card radius.
- **Background:** training-card surface for grouped content; no outline is
  required unless the element is an input or interactive recess.
- **Internal Padding:** standard 16px, varied only when density clearly needs it.

### Inputs / Fields

- **Style:** input-well background, primary text, 8px radius, hairline border.
- **Focus:** clear ember treatment with no color-only error messaging.
- **Error / Disabled:** plain language and a supporting icon or structure when
  the state needs attention.

### Navigation

- **Style:** familiar mobile navigation with the current destination marked in
  ember. Touch targets remain reachable above safe-area padding.

### AI Coach Photo Flow

Photo actions explicitly separate discussing photos with the Coach from
identifying equipment to save a named location. Raw photos remain temporary;
the interface must tell the user when they are cleared.

## Do's and Don'ts

### Do:

- **Do** use the existing graphite surfaces and ember action color exactly as
  defined in `docs/DESIGN_TOKENS.md`.
- **Do** keep camera, upload, save, and delete controls familiar and obvious.
- **Do** show the athlete what the Coach can currently see, what will be saved,
  and what requires confirmation.
- **Do** design for phone use in real training environments before desktop
  embellishment.

### Don't:

- **Don't** add decorative cyber or neon styling that competes with workout
  data.
- **Don't** create dense spreadsheet-style logging during an active session.
- **Don't** introduce novel controls that make common camera, upload, save, or
  delete actions hard to recognize.
- **Don't** let AI language overclaim what the Coach can see, has saved, or has
  changed.
- **Don't** use medical certainty, hidden automatic mutations, or unreviewed AI
  workout actions.
