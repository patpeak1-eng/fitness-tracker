// Shared exercise filter predicates + canonical filter vocabulary (S17).
//
// Single source of truth for how Exercises.jsx (library browsing) and
// ExerciseSelector.jsx (Build My Own staging) filter the exercise list.
// All predicates are pure: (exercise, filterValue) -> boolean, where the
// sentinel 'All' (or an empty search term) always passes.
//
// Canonical category labels are the DATA values ('Weights', not the old
// 'Weight Lifting' UI alias) — the label IS the ex.category value, so no
// UI->data mapping layer exists anymore.

export const CATEGORIES = ['All', 'Weights', 'Calisthenics', 'Yoga', 'Cardio'];

export const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Abs', 'Full Body'];

// Single-equipment term chips (ExerciseSelector's secondary row).
export const EQUIPMENT = ['All', 'Dumbbells', 'Barbell', 'Cable', 'Machine', 'Pull-up Bar', 'None'];

export const matchesSearch = (ex, term) => {
    const q = (term || '').toLowerCase().trim();
    return !q || (ex.name || '').toLowerCase().includes(q);
};

export const matchesCategory = (ex, category) =>
    category === 'All' || ex.category === category;

export const matchesMuscle = (ex, muscle) =>
    muscle === 'All' || ex.primary_muscle === muscle;

// Single equipment term: 'None' also covers a missing/empty equipment field;
// other terms are a case-insensitive contains-match (so "Barbell/Dumbbells"
// matches both terms).
export const matchesEquipmentTerm = (ex, equip) => {
    if (equip === 'All') return true;
    if (equip === 'None') return !ex.equipment || ex.equipment === 'None';
    return (ex.equipment || '').toLowerCase().includes(equip.toLowerCase());
};

// Equipment-profile list match (Full Gym / Home Gym / ... equipment arrays).
// Mirrors WorkoutContext's isExerciseCompatible: ex.equipment overloads "/"
// as both an OR-separator ("Barbell/Dumbbells") and part of literal names
// ("Parallel Bars/Bench") — match the full literal string first, then fall
// back to the slash-split for genuine OR-lists.
export const matchesEquipmentProfile = (ex, equipmentList) => {
    if (!equipmentList) return true; // null = no filter
    if (!ex.equipment) return true;
    if (equipmentList.includes(ex.equipment)) return true;
    return ex.equipment
        .split('/')
        .map(e => e.trim())
        .some(eq => equipmentList.includes(eq));
};
