// Weight unit conversion shared by WorkoutDetails and Analytics so the two views
// never drift apart. Weights are stored in the unit that was active when the set
// was logged; a workout's own `units` field records that. Workouts created before
// that field existed pass a fallback of 'metric'.

const LBS_PER_KG = 2.205;

/**
 * Convert a stored weight to the unit currently selected for display.
 *
 * @param {number} storedWeight - weight as recorded on the set
 * @param {'metric'|'imperial'} storedUnit - unit the workout was logged in
 * @param {'metric'|'imperial'} displayUnit - unit currently selected in settings
 * @returns {number} weight in the display unit (rounded to 2 decimals when converted)
 */
export function displayWeight(storedWeight, storedUnit, displayUnit) {
    if (!storedWeight) return 0;
    if (storedUnit === displayUnit) return storedWeight;
    if (storedUnit === 'imperial' && displayUnit === 'metric') {
        return Math.round((storedWeight / LBS_PER_KG) * 100) / 100; // lbs -> kg
    }
    if (storedUnit === 'metric' && displayUnit === 'imperial') {
        return Math.round(storedWeight * LBS_PER_KG * 100) / 100; // kg -> lbs
    }
    return storedWeight;
}
