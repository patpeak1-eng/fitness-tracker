/**
 * @typedef {Object} Exercise
 * @property {string} id - Unique identifier
 * @property {string} name - Display name (e.g., "Bench Press")
 * @property {string} target - Muscle group or target (e.g., "Chest", "Cardio")
 * @property {string} [type] - "strength" | "cardio"
 */

/**
 * @typedef {Object} WorkoutSet
 * @property {string} id - Unique identifier for the set
 * @property {number} weight - Weight in kg/lbs
 * @property {number} reps - Number of repetitions
 * @property {boolean} completed - Whether the set is done
 */

/**
 * @typedef {Object} WorkoutExercise
 * @property {string} id - Unique instance ID for this exercise in the workout
 * @property {Exercise} exercise - The base exercise data
 * @property {WorkoutSet[]} sets - List of sets performed
 */

/**
 * @typedef {Object} Workout
 * @property {string} id - Unique identifier
 * @property {string} name - Name of the workout (e.g., "Morning Lift")
 * @property {Date} startTime - When the workout started
 * @property {Date} [endTime] - When the workout finished
 * @property {WorkoutExercise[]} exercises - List of exercises performed
 * @property {string} status - "active" | "completed"
 */

export const TYPES = {}; // Export empty object to make this a module if needed
