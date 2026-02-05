# Fitness Tracker - Project Context

> **FOR AI AGENTS:** Read this document first to understand the project architecture, design system, and feature set.

## 1. Project Overview
A modern, mobile-first Fitness Tracker built as a PWA (Progressive Web App). It focuses on a "Guided Workout" experience with immersive timers, audio cues, and a premium Dark Mode aesthetic.

## 2. Tech Stack
-   **Core**: React 18, Vite.
-   **State Management**: `WorkoutContext.jsx` (Central Store).
    -   *Logic Rule*: All global state (Workouts, History, Settings, Timers) lives here. Do not create local state for global features.
-   **Styling**: Vanilla CSS with Variables (`index.css`).
    -   *Design Rule*: Use CSS variables (`--primary`, `--surface`, etc.) for consistency.
-   **Icons**: `lucide-react`.
-   **Persistence**: `localStorage` (Keys prefixed with `fitness_*`).

## 3. Design System & Aesthetics
-   **Theme**: Deep Dark Mode ("Cyber/Fitness" aesthetic).
-   **Colors**:
    -   **Primary (Action/Work)**: Neon Green (`#bfff00`) - Used for Start, Work Timer.
    -   **Secondary (Rest/Info)**: Bright Blue (`#3b82f6`) - Used for Rest Timer, Skips.
    -   **Background**: Radial Gradients (Subtle glow on black).
    -   **Surfaces**: Glassmorphism (Translucent black with thin borders).
-   **Animations**:
    -   **Timers**: Pulsating glow (`pulse-green`, `pulse-blue`) when active.
    -   **Transits**: Smooth fade-ins.

## 4. Key Features (Current State)

### A. Guided Workout Mode (`GuidedWorkoutView.jsx`)
-   **Prep Phase**: Start screen before timer begins.
-   **Work/Rest Timers**:
    -   **Polyphonic Audio**: "Glassy" Chime for Work Complete, "Rising" Tone for Rest Complete.
    -   **Auto-Advance**: Logic to move between sets automatically (or via manual "Finish").
    -   **Input Modal**: Pop-up to log actual Reps/Weight after a set.
-   **UI**: Large Timer Circle, "Set X of Y" Pill, distinct "End Session" button.

### B. Data & Portability (`Profile.jsx`)
-   **Storage**: All data is local to the device.
-   **Backup**: JSON Export/Import feature in the **Profile** tab.
    -   *Agent Note*: The `settings` page no longer handles data. Use `Profile.jsx`.
-   **Syncing**: Users transfer data between devices by saving the JSON to Google Drive manually.

### C. Mobile PWA
-   **Manifest**: Fully configured `manifest.json` + `icon.svg` (Neon Green Circle).
-   **Installation**: Can be added to Home Screen on iOS/Android for full-screen native feel.

### D. Navigation & Settings
-   **Standardized Navigation**: global `BackButton` component ensures consistent return to Dashboard from all sub-pages.
-   **Settings**: Consolidate preferences, custom modal for profile switching, and timer defaults configuration.
-   **App Logic**: Improvements to history sorting and workout data persistence.

## 5. File Structure Highlights
-   `/src/context/WorkoutContext.jsx`: **The Brain**. Contains logic for timers, data migration, export/import.
-   `/src/components/common/BackButton.jsx`: **Navigation**. Standardized "Back to Dashboard" pill button.
-   `/src/components/workout/GuidedWorkoutView.jsx`: **The Core Experience**. Complex UI for the active session.
-   `/pack_project.bat`: Script to zip source code (timestamped) for development transfer.
-   `/TRANSFER_GUIDE.md`: User instructions for moving data/code.

---
*Last Updated: 2026-01-28*
