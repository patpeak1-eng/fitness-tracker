# Fitness App - Comprehensive Architecture Assessment

> **For AI Agents / Gemini**: This document provides a complete technical overview of the Fitness Tracker project as of January 2026. Use this to understand the current state, logic flows, and data architecture.

---

## 1. High-Level Summary
**Type**: Mobile-First PWA (Progressive Web App)
**Stack**: React 18, Vite, Context API, Vanilla CSS (Variables).
**Core Value**: A premium, "Guided Workout" experience with smart onboarding, seamless offline capability, and neon-glass aesthetics.

---

## 2. Core Architecture

### **A. State Management: The "Brain"**
*   **File**: `src/context/WorkoutContext.jsx`
*   **Role**: Single Source of Truth.
*   **Capabilities**:
    *   **User Data**: Manages Profiles (`profiles`), History (`getHistory`), and Settings (`theme`, `units`).
    *   **Workout Session**: Manages `activeWorkout`, `restTimer`, `workTimer` (Global state, survives page reloads).
    *   **Persistence**: Automatically syncs all state to `localStorage` (scoped by `profile.id`).
    *   **Seamless Sync**: Supports a "Local USB Server" mode -> Auto-fetches `/api/data` on mount to sync with a local Python backend (if available).

### **B. Routing Structure**
*   **File**: `src/App.jsx`
*   **Routes**:
    *   `/` -> **Dashboard**: The central hub.
    *   `/track` -> **TrackWorkout**: The active session view (or template picker).
    *   `/assessment` -> **Assessment**: The new onboarding wizard.
    *   `/analytics` -> **Analytics**: Visual charts and progress.
    *   `/profile` -> **Profile**: Data management, export/import, settings.

---

## 3. Key Feature Modules

### **I. Onboarding & Recommendation Engine**
*   **Files**: `src/pages/Assessment.jsx`, `src/utils/recommendationEngine.js`
*   **Flow**:
    1.  **Survey**: 4-Step Wizard (Stats -> Goal -> Experience -> Equipment).
    2.  **Logic**: `recommendationEngine.js` maps inputs to 4 distinct programs:
        *   **The Powerhouse**: Gym + Strength.
        *   **The Burner**: Bodyweight + Weight Loss.
        *   **The Flow State**: Yoga + Flexibility.
        *   **Foundation Builder**: Gym + Beginner.
    3.  **Action**: "Confirm & Start" button IMMEDIATELY instantiates the recommended template as the `activeWorkout` and redirects to Dashboard.

### **II. Active Workout Session ("Guided Mode")**
*   **Files**: `src/pages/TrackWorkout.jsx`, `src/components/workout/GuidedWorkoutView.jsx`
*   **Concept**: Instead of a spreadsheet, users see a "Focus Mode".
*   **Mechanics**:
    *   **Prep Phase**: Overview of the exercise before starting.
    *   **Active Phase**: Large Work Timer (optional) or Rep Counter.
    *   **Rest Phase**: Auto-triggers Rest Timer on set completion.
    *   **Audio cues**: "Glassy" chimes for work/rest transitions.
    *   **Data Entry**: Modals to adjust weight/reps after each set.

### **III. Analytics**
*   **Files**: `src/pages/Analytics.jsx` (Wrapper), `src/pages/AnalyticsView.jsx` (Logic)
*   **Features**:
    *   **Volume Chart**: Visualizes Volume Load over time.
    *   **Strength Chart**: Tracks estimated 1RM for specific lifts.
    *   **Interactive**: Filter by specific exercises (e.g., "Bench Press" vs "Squat").

### **IV. Dashboard**
*   **File**: `src/pages/Dashboard.jsx`
*   **Role**:
    *   **Active Workout Card**: If a workout is `active`, it dominates the top of the screen ("Resume Workout").
    *   **Quick Actions**: Large buttons to "Start Empty Workout" or "Assessment".
    *   **Weekly Snapshot**: Mini-graph of recent activity.

---

## 4. Data Structure (JSON Model)

The app uses a unified JSON structure for portability.

**User Profile Object**:
```json
{
  "id": "user_123",
  "name": "Main User",
  "settings": { "theme": "dark", "units": "metric" },
  "stats": { "weight": 75, "bodyFat": 15 ... }
}
```

**Workout History Object**:
```json
{
  "id": "wk_abc",
  "name": "The Powerhouse",
  "startTime": "2026-01-28T10:00:00Z",
  "endTime": "2026-01-28T11:00:00Z",
  "status": "completed",
  "exercises": [
    {
      "exercise": { "id": "wt_bench", "name": "Bench Press" ... },
      "sets": [
         { "weight": 100, "reps": 8, "completed": true }
      ]
    }
  ]
}
```

---

## 5. Design System
*   **Theme**: "Cyber Fitness".
*   **Colors**: Neon Green (`#bfff00`) for primary actions, Deep Black background, Glassmorphic overlays.
*   **CSS**: No frameworks (Tailwind removed). All styles are in `.css` modules or `index.css` using Variables.

---

## 6. Current Status & "To-Do" for Alignment
1.  **Assessment**: COMPLETE. Logic matches user prompt perfectly.
2.  **Templates**: COMPLETE. 4 Key templates hardcoded and mapped.
3.  **Analytics**: FUNCTIONAL. Basic charts implemented.
4.  **Sync**: LOCAL ONLY (with USB support). No cloud database currently connected.

Use this context to ensure all future features align with the "Guided Session" philosophy and "Local-First" architecture.
