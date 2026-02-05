/**
 * Recommendation Engine for Fitness Tracker
 * Maps user answers to specific workout programs using valid Exercise IDs.
 */

// --- 1. EXERCISE ID MAPPING ---
// These match the IDs in WorkoutContext -> DEFAULT_EXERCISES
const EX = {
    // CALISTHENICS
    PUSHUP: { id: 'cal_pushup', name: 'Classic Push-up' },
    PIKE_PUSHUP: { id: 'cal_pike_pushup', name: 'Pike Push-up' },
    PULLUP: { id: 'cal_pullup', name: 'Pull-up' },
    DIP: { id: 'cal_dip', name: 'Tricep Dip' },
    SQUAT_BW: { id: 'cal_squat', name: 'Bodyweight Squat' },
    PLANK: { id: 'cal_plank', name: 'Plank' },
    BURPEE: { id: 'cal_burpee', name: 'Burpee' },
    GLUTE_BRIDGE: { id: 'cal_glute_bridge', name: 'Glute Bridge' },
    SUPERMAN: { id: 'cal_superman', name: 'Superman' },
    MTN_CLIMBER: { id: 'cal_mtn_climber', name: 'Mountain Climber' },
    LEG_RAISE: { id: 'cal_leg_raise', name: 'Leg Raises' },

    // WEIGHTS
    SQUAT: { id: 'wt_squat', name: 'Weighted Squat' },
    BENCH: { id: 'wt_flat_bench', name: 'Flat Bench Press' },
    INC_BENCH: { id: 'wt_inc_bench', name: 'Incline Bench Press' },
    OHP: { id: 'wt_ohp', name: 'Overhead Press' },
    ROW: { id: 'wt_seated_row', name: 'Seated Row' },
    LAT_PULL: { id: 'wt_lat_pulldown', name: 'Lat Pulldown' },
    DEADLIFT: { id: 'wt_deadlift', name: 'Deadlift' },
    CURL: { id: 'wt_bicep_curl', name: 'Bicep Curl' },
    TRICEP: { id: 'wt_tricep_pushdown', name: 'Tricep Pushdown' },
    FACE_PULL: { id: 'wt_face_pull', name: 'Face Pull' },
    LAT_RAISE: { id: 'wt_lat_raise', name: 'Side Raise' },
    CHEST_FLY: { id: 'wt_chest_fly', name: 'Chest Fly' },
    LUNGE: { id: 'wt_lunge', name: 'Weighted Lunge' },
    CALF: { id: 'wt_calf_raise', name: 'Calf Raise' },
    FARMER: { id: 'wt_farmer_walk', name: 'Farmer\'s Walk' },

    // YOGA
    MTN_POSE: { id: 'yoga_mtn', name: 'Tall Mountain Pose' },
    DOWN_DOG: { id: 'yoga_down_dog', name: 'Downward Dog' },
    COBRA: { id: 'yoga_cobra', name: 'Cobra Pose' },
    CHILD: { id: 'yoga_child', name: 'Child\'s Pose' },
    WARRIOR2: { id: 'yoga_warrior2', name: 'Warrior II' },
    PIGEON: { id: 'yoga_pigeon', name: 'Pigeon Pose' },
    TREE: { id: 'yoga_tree', name: 'Tree Pose' }
};

// --- 2. DEFINED PROGRAMS ---
export const PROGRAMS = {
    // --- 1. THE POWERHOUSE (Strength + Weights) ---
    powerhouse: {
        id: 'prog_powerhouse',
        name: 'The Powerhouse',
        description: 'Targeting total body strength using basic compound lifts.',
        templates: [
            {
                name: 'The Powerhouse',
                exercises: [
                    { id: EX.OHP.id, name: EX.OHP.name, sets: 4, reps: 8 },
                    { id: EX.BENCH.id, name: EX.BENCH.name, sets: 4, reps: 8 },
                    { id: EX.DEADLIFT.id, name: EX.DEADLIFT.name, sets: 3, reps: 5 },
                    { id: EX.SQUAT.id, name: EX.SQUAT.name, sets: 4, reps: 6 },
                    { id: EX.ROW.id, name: EX.ROW.name, sets: 3, reps: 10 },
                    { id: EX.CURL.id, name: EX.CURL.name, sets: 3, reps: 12 }
                ]
            }
        ]
    },

    // --- 2. THE BURNER (Calisthenics + Weight Loss) ---
    burner: {
        id: 'prog_burner',
        name: 'The Burner',
        description: 'Targeting high heart rate and muscle endurance.',
        templates: [
            {
                name: 'The Burner Circuit',
                exercises: [
                    { id: EX.BURPEE.id, name: EX.BURPEE.name, sets: 4, reps: 15 },
                    { id: EX.MTN_CLIMBER.id, name: EX.MTN_CLIMBER.name, sets: 3, time: 45 },
                    { id: EX.PUSHUP.id, name: EX.PUSHUP.name, sets: 4, reps: 15 },
                    { id: EX.SQUAT_BW.id, name: EX.SQUAT_BW.name, sets: 4, reps: 20 },
                    { id: EX.LEG_RAISE.id, name: EX.LEG_RAISE.name, sets: 3, reps: 15 },
                    { id: EX.PLANK.id, name: EX.PLANK.name, sets: 3, time: 60 }
                ]
            }
        ]
    },

    // --- 3. THE FLOW STATE (Yoga + Flexibility) ---
    flow_state: {
        id: 'prog_flow',
        name: 'The Flow State',
        description: 'Targeting mobility, balance, and stress relief.',
        templates: [
            {
                name: 'The Flow State',
                exercises: [
                    { id: EX.MTN_POSE.id, name: EX.MTN_POSE.name, sets: 1, time: 60 },
                    { id: EX.DOWN_DOG.id, name: EX.DOWN_DOG.name, sets: 1, time: 60 },
                    { id: EX.WARRIOR2.id, name: EX.WARRIOR2.name, sets: 2, time: 45 },
                    { id: EX.TREE.id, name: EX.TREE.name, sets: 2, time: 45 },
                    { id: EX.PIGEON.id, name: EX.PIGEON.name, sets: 2, time: 60 },
                    { id: EX.CHILD.id, name: EX.CHILD.name, sets: 1, time: 120 }
                ]
            }
        ]
    },

    // --- 4. FOUNDATION BUILDER (Weights + Beginner) ---
    foundation: {
        id: 'prog_foundation',
        name: 'Foundation Builder',
        description: 'Targeting safe, introductory movements using basic equipment.',
        templates: [
            {
                name: 'Foundation Builder',
                exercises: [
                    { id: EX.LAT_RAISE.id, name: EX.LAT_RAISE.name, sets: 3, reps: 12 },
                    { id: EX.CHEST_FLY.id, name: EX.CHEST_FLY.name, sets: 3, reps: 12 },
                    { id: EX.LAT_PULL.id, name: EX.LAT_PULL.name, sets: 3, reps: 12 },
                    { id: EX.LUNGE.id, name: EX.LUNGE.name, sets: 3, reps: 10 },
                    { id: EX.TRICEP.id, name: EX.TRICEP.name, sets: 3, reps: 12 },
                    { id: EX.GLUTE_BRIDGE.id, name: EX.GLUTE_BRIDGE.name, sets: 3, reps: 15 }
                ]
            }
        ]
    }
};

// --- LOGIC ENGINE ---
export const getRecommendation = (answers) => {
    const { experience, goal, equipment } = answers;

    // RULE 1: Yoga -> Flow State
    if (equipment === 'yoga_mat' || goal === 'flexibility') {
        return PROGRAMS.flow_state;
    }

    // RULE 2: Bodyweight / Weight Loss -> Burner
    if (equipment === 'bodyweight' || goal === 'weight_loss' || goal === 'toned') {
        // Preference for burner if goal is weight loss, even if they have gym
        if (equipment === 'bodyweight' || goal === 'weight_loss') return PROGRAMS.burner;
    }

    // RULE 3: Gym + Beginner -> Foundation
    if (equipment === 'gym' || equipment === 'commercial') {
        if (experience === 'beginner') {
            return PROGRAMS.foundation;
        }

        // RULE 4: Gym + Strength/Intermediate/Advanced -> Powerhouse
        return PROGRAMS.powerhouse;
    }

    // Fallback
    return PROGRAMS.foundation;
};
