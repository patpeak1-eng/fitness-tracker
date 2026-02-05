# Fitness Tracker 2.0 - Technical Reference Manual

## 1. State Management
**File**: `src/context/WorkoutContext.jsx`

The `WorkoutContext` serves as the centralized state store for the application. It uses the `React Context API` to provide state and methods to all components.

### Core State
*   **`profiles`**: Array of user profiles.
*   **`currentProfile`**: The active user object.
*   **`history`**: Array of completed workout sessions (ordered newest to oldest).
*   **`activeWorkout`**: The currently running workout session (or null).
*   **`units`**: 'metric' or 'imperial'.
*   **`autoSyncEnabled`**: Boolean toggle for local backend syncing.

### Persistence
State is persisted via `useEffect` hooks that write to `localStorage` whenever key state variables change.
*   Keys are namespaced by profile ID (e.g., `fitness_history_user_123`) to support multi-user switching on the same device.
*   **Backup**: The `exportData()` function scrapes all `localStorage` keys starting with `fitness_` to generate a portable JSON backup.

---

## 2. Recommendation Logic
**File**: `src/utils/recommendationEngine.js`

This utility maps user survey inputs (Experience, Goal, Equipment) to one of four pre-defined workout programs ("Templates").

### The Four Core Templates
1.  **The Powerhouse** (`prog_powerhouse`): Heavy compound lifts (Squat, Bench, Deadlift). Triggered by Gym + Strength.
2.  **The Burner** (`prog_burner`): High-intensity interval/calisthenics (Burpees, Pushups). Triggered by Bodyweight OR Weight Loss goal.
3.  **The Flow State** (`prog_flow`): Yoga and mobility sequence. Triggered by Yoga Mat OR Flexibility goal.
4.  **Foundation Builder** (`prog_foundation`): Isolation/Machine movements. Triggered by Gym + Beginner.

### Logic Flow
The `getRecommendation(answers)` function applies a hierarchy of rules:
1.  If Equipment = Yoga Mat OR Goal = Flexibility → **Flow State**.
2.  Else if Equipment = Bodyweight OR Goal = Weight Loss → **The Burner**.
3.  Else if Equipment = Gym:
    *   If Experience = Beginner → **Foundation Builder**.
    *   Else → **The Powerhouse**.

---

## 3. Guided Session Engine
**File**: `src/components/workout/GuidedWorkoutView.jsx`

This component manages the active workout interface, handling the navigation between exercises and sets.

### Branching Timer Logic
The view distinguishes between **Rep-Based** and **Duration-Based** exercises to provide the correct UI.
*   **Detection**: Checks `exercise.default_duration > 0` or category (Yoga/Cardio).
*   **Rep-Based (Lifting)**:
    *   Cycle: Input Weight/Reps → "Log Set" → **Blue Rest Timer** → Next Set.
*   **Duration-Based (Yoga/Planks)**:
    *   Cycle: "Start Timer" → **Cyan Work Timer** (Active Pulse) → Audio Chime → "End Interval" → Next Set.

---

## 4. Adaptive Algorithms
**File**: `src/context/WorkoutContext.jsx`

### `getSuggestedLoad(exerciseId)`
The "Adaptive Coach" feature.
*   **Trigger**: Analyzes the **last completed workout** for the specific exercise.
*   **Criteria**: Progression is suggested ONLY if the user met or exceeded the **Target Reps (or Time)** on **EVERY completed set**.
*   **Progression Rules**:
    *   **Weights**: Suggests `Current + 5lbs` (or +2.5kg).
    *   **Bodyweight/Time**: Suggests `Current + 1 Rep` or `Current + 5 Seconds`.

### `checkPersonalRecord(exerciseId, weight, reps)`
The PR Detection system.
*   **Trigger**: Called inside `toggleSetComplete` when a set is finished.
*   **Logic**: Scans the entire `history` for the exercise.
*   **Condition**: Returns `true` if:
    *   `currentWeight > maxHistoricalWeight` OR
    *   `currentWeight == maxHistoricalWeight` AND `currentReps > maxHistoricalReps`.

---

## 5. Media & Assets
**File**: `src/components/workout/ExerciseMedia.jsx`

Handles the visual representation of exercises with a resilient fallback system.

### Logic
1.  **Primary**: Attempts to load a JPG image from `/assets/exercises/{exerciseId}.jpg`.
2.  **Fallback**: If the image loading fails (standard `onError` event), it switches to the `BodyHighlightSVG` component.
3.  **SVG Engine**: `BodyHighlightSVG.jsx` renders a generic human outline and dynamically colors the SVG path corresponding to the `exercise.muscleGroup` (e.g., Chest, Legs) in **Neon Green** (`var(--primary)`).

---

## 6. Data Portability
**File**: `src/context/WorkoutContext.jsx` & `src/pages/Profile.jsx`

### JSON Schema
The export format is a direct dump of the browser's `localStorage` state for the app.
```json
{
  "fitness_profiles": "[...]",
  "fitness_history_user_123": "[...]",
  "fitness_active_workout_user_123": "{...}",
  "fitness_auto_sync": "true"
}
```

### Auto-Sync Logic
*   **State**: `autoSyncEnabled` (Boolean, persisted).
*   **Trigger**: When `history` updates (i.e., `finishWorkout`), a `useEffect` hook waits 2 seconds (debounce) and calls `saveToUSB()`.
*   **Network Request**:
    ```javascript
    fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    ```
    This allows a clear integration point for the local Python backend to receive updates.
