import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import StorageService from '../services/StorageService';
import ActiveWorkoutService from "../services/ActiveWorkoutService";


export const WorkoutContext = createContext();

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_EXERCISES = [
    { "id": "wt_ohp", "name": "Overhead Press", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Barbell/Dumbbells", "instructions": "Press the weight directly overhead until arms lock, keeping core tight and avoiding a back arch." },
    { "id": "wt_lat_raise", "name": "Dumbbell Side Raise", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Raise dumbbells out to the sides with a slight elbow bend until arms are parallel to the floor." },
    { "id": "wt_front_raise", "name": "Front Raise", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Lift dumbbells in front of you to shoulder height, keeping your torso still and core engaged." },
    { "id": "wt_face_pull", "name": "Face Pulls", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Cable", "instructions": "Pull the rope toward your face, pulling the ends apart and squeezing your shoulder blades together." },
    { "id": "wt_rear_delt_fly", "name": "Rear Delt Fly", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells/Machine", "instructions": "Bend at the hips and fly the weights outward to target the back of the shoulders." },
    { "id": "wt_shrug", "name": "Dumbbell Shrug", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Lift your shoulders toward your ears in a straight line, hold for a second, and lower slowly." },
    { "id": "wt_arnold_press", "name": "Arnold Press", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Start with palms facing you; rotate palms forward as you press the dumbbells overhead." },
    { "id": "wt_flat_bench", "name": "Flat Bench Press", "category": "Weights", "primary_muscle": "Chest", "equipment": "Barbell", "instructions": "Lower the bar to mid-chest, keep elbows at a 45-degree angle, and drive the weight back up." },
    { "id": "wt_incline_bench", "name": "Incline Bench Press", "category": "Weights", "primary_muscle": "Chest", "equipment": "Barbell/Dumbbells", "instructions": "Set bench to 30-45 degrees; lower weight to upper chest to target the clavicular fibers." },
    { "id": "wt_chest_fly", "name": "Chest Fly", "category": "Weights", "primary_muscle": "Chest", "equipment": "Dumbbells/Machine", "instructions": "With a slight bend in elbows, open arms wide and squeeze chest to bring weights together at the top." },
    { "id": "wt_decline_bench", "name": "Decline Bench Press", "category": "Weights", "primary_muscle": "Chest", "equipment": "Barbell", "instructions": "Lower the bar to the lower chest; this angle emphasizes the lower pectoral muscles." },
    { "id": "wt_cable_crossover", "name": "Cable Crossover", "category": "Weights", "primary_muscle": "Chest", "equipment": "Cable", "instructions": "Pull cables together in a downward arching motion, crossing hands slightly to maximize contraction." },
    { "id": "wt_deadlift", "name": "Deadlift", "category": "Weights", "primary_muscle": "Back", "equipment": "Barbell", "instructions": "Keep back flat and bar close to shins; drive through the heels to stand upright." },
    { "id": "wt_lat_pulldown", "name": "Lat Pulldown", "category": "Weights", "primary_muscle": "Back", "equipment": "Machine", "instructions": "Pull the bar down to your upper chest while leaning back slightly and squeezing your lats." },
    { "id": "wt_seated_row", "name": "Seated Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Cable", "instructions": "Pull the handle toward your abdomen, keeping your back straight and shoulders down." },
    { "id": "wt_bent_over_row", "name": "Bent Over Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Barbell", "instructions": "Hinge at hips, keep back parallel to floor, and pull the bar toward your lower ribs." },
    { "id": "wt_one_arm_row", "name": "Single Arm Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Dumbbells", "instructions": "Place one hand on a bench for support and pull the dumbbell toward your hip with the other." },
    { "id": "wt_pull_over", "name": "Dumbbell Pullover", "category": "Weights", "primary_muscle": "Back", "equipment": "Dumbbells", "instructions": "Lying on a bench, lower a dumbbell behind your head with slightly bent arms, then pull it back over your chest." },
    { "id": "wt_t_bar_row", "name": "T-Bar Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Barbell", "instructions": "Straddle the bar and pull toward your chest, focusing on squeezing the middle back muscles." },
    { "id": "wt_bicep_curl", "name": "Bicep Curl", "category": "Weights", "primary_muscle": "Arms", "equipment": "Dumbbells/Barbell", "instructions": "Keep elbows tucked to sides and curl weights toward shoulders without swinging your body." },
    { "id": "wt_hammer_curl", "name": "Hammer Curl", "category": "Weights", "primary_muscle": "Arms", "equipment": "Dumbbells", "instructions": "Hold dumbbells with palms facing each other and curl to target the brachialis and forearm." },
    { "id": "wt_preacher_curl", "name": "Preacher Curl", "category": "Weights", "primary_muscle": "Arms", "equipment": "Machine/Barbell", "instructions": "Use a preacher bench to isolate the biceps, ensuring a full range of motion at the bottom." },
    { "id": "wt_tricep_pushdown", "name": "Tricep Pushdown", "category": "Weights", "primary_muscle": "Arms", "equipment": "Cable", "instructions": "Extend arms downward using a cable attachment, keeping elbows pinned to your ribs." },
    { "id": "wt_overhead_ext", "name": "Overhead Tricep Extension", "category": "Weights", "primary_muscle": "Arms", "equipment": "Dumbbell/Cable", "instructions": "Hold weight behind your head and extend arms fully upward to target the long head of the tricep." },
    { "id": "wt_skull_crusher", "name": "Skull Crusher", "category": "Weights", "primary_muscle": "Arms", "equipment": "Barbell", "instructions": "Lying down, lower the bar toward your forehead by bending only at the elbows, then extend." },
    { "id": "wt_squat", "name": "Weighted Squat", "category": "Weights", "primary_muscle": "Legs", "equipment": "Barbell", "instructions": "Lower hips back and down until thighs are at least parallel to the floor, then drive up through heels." },
    { "id": "wt_lunge", "name": "Weighted Lunge", "category": "Weights", "primary_muscle": "Legs", "equipment": "Dumbbells", "instructions": "Step forward and lower your back knee toward the ground, keeping your front knee aligned with your ankle." },
    { "id": "wt_leg_press", "name": "Leg Press", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine", "instructions": "Press the platform away using your legs, avoiding locking your knees at the top." },
    { "id": "wt_leg_ext", "name": "Leg Extension", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine", "instructions": "Sit and extend legs fully to isolate the quadriceps; lower the weight under control." },
    { "id": "wt_leg_curl", "name": "Leg Curl", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine", "instructions": "Curl your legs toward your glutes to isolate the hamstrings; avoid arching your lower back." },
    { "id": "wt_calf_raise", "name": "Calf Raise", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine/Dumbbell", "instructions": "Raise your heels as high as possible, hold the squeeze, and lower slowly for a full stretch." },
    { "id": "wt_romanian_deadlift", "name": "Romanian Deadlift", "category": "Weights", "primary_muscle": "Legs", "equipment": "Barbell", "instructions": "Hinge at the hips with a slight knee bend; lower the bar until you feel a stretch in your hamstrings." },
    { "id": "cal_pushup", "name": "Classic Push-up", "category": "Calisthenics", "primary_muscle": "Chest", "equipment": "None", "instructions": "Maintain a straight plank position and lower your chest to the floor before pushing back up." },
    { "id": "cal_incline_pushup", "name": "Incline Push-up", "category": "Calisthenics", "primary_muscle": "Chest", "equipment": "Bench/Elevated Surface", "instructions": "Place hands on an elevated surface; this version emphasizes the lower chest and is easier than flat pushups." },
    { "id": "cal_decline_pushup", "name": "Decline Push-up", "category": "Calisthenics", "primary_muscle": "Chest", "equipment": "Bench/Elevated Surface", "instructions": "Place feet on an elevated surface; this increases the weight on the upper chest and shoulders." },
    { "id": "cal_wide_pushup", "name": "Wide Grip Push-up", "category": "Calisthenics", "primary_muscle": "Chest", "equipment": "None", "instructions": "Set hands wider than shoulder-width to increase the focus on the outer pectoral muscles." },
    { "id": "cal_diamond_pushup", "name": "Diamond Push-up", "category": "Calisthenics", "primary_muscle": "Arms", "equipment": "None", "instructions": "Place hands together so index fingers and thumbs form a diamond; focuses heavily on the triceps." },
    { "id": "cal_dip", "name": "Tricep Dip", "category": "Calisthenics", "primary_muscle": "Arms", "equipment": "Parallel Bars/Bench", "instructions": "Lower your body by bending elbows to 90 degrees, then push back up using your triceps." },
    { "id": "cal_pullup", "name": "Pull-up", "category": "Calisthenics", "primary_muscle": "Back", "equipment": "Pull-up Bar", "instructions": "With palms facing away, pull your chin over the bar using your back and arm strength." },
    { "id": "cal_chinup", "name": "Chin-up", "category": "Calisthenics", "primary_muscle": "Back", "equipment": "Pull-up Bar", "instructions": "With palms facing you, pull your chin over the bar; this targets the biceps more than a pullup." },
    { "id": "cal_inverted_row", "name": "Inverted Row", "category": "Calisthenics", "primary_muscle": "Back", "equipment": "Low Bar", "instructions": "Hang under a bar and pull your chest toward it, keeping your body in a straight line." },
    { "id": "cal_squat", "name": "Bodyweight Squat", "category": "Calisthenics", "primary_muscle": "Legs", "equipment": "None", "instructions": "Lower your hips as if sitting in a chair, keeping your chest up and weight on your heels." },
    { "id": "cal_lunge", "name": "Bodyweight Lunge", "category": "Calisthenics", "primary_muscle": "Legs", "equipment": "None", "instructions": "Step forward and lower your hips until both knees are bent at a 90-degree angle." },
    { "id": "cal_glute_bridge", "name": "Glute Bridge", "category": "Calisthenics", "primary_muscle": "Legs", "equipment": "None", "instructions": "Lying on your back, lift your hips toward the ceiling by squeezing your glutes." },
    { "id": "cal_calf_raise", "name": "Bodyweight Calf Raise", "category": "Calisthenics", "primary_muscle": "Legs", "equipment": "None", "instructions": "Stand on the balls of your feet and lift your heels as high as possible." },
    { "id": "cal_leg_raise", "name": "Leg Raises", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "instructions": "Lying on your back, lift straight legs toward the ceiling and lower them slowly without touching the floor." },
    { "id": "cal_plank", "name": "Plank", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Hold a straight line from head to heels on your elbows, engaging your core and glutes." },
    { "id": "cal_side_plank", "name": "Side Plank", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Balance on one forearm and the side of your foot, keeping your hips lifted and body straight." },
    { "id": "cal_crunch", "name": "Abdominal Crunch", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "instructions": "Curl your shoulders toward your knees by contracting your abs; avoid pulling on your neck." },
    { "id": "cal_mtn_climber", "name": "Mountain Climbers", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "instructions": "In a plank position, drive your knees toward your chest in an alternating, running motion." },
    { "id": "cal_burpee", "name": "Burpees", "category": "Calisthenics", "primary_muscle": "Full Body", "equipment": "None", "instructions": "Drop into a pushup, jump your feet forward, and explosively jump into the air." },
    { "id": "cal_jumping_jack", "name": "Jumping Jacks", "category": "Calisthenics", "primary_muscle": "Full Body", "equipment": "None", "instructions": "Jump while spreading legs and touching hands overhead, then return to a standing position." },
    { "id": "cal_superman", "name": "Superman", "category": "Calisthenics", "primary_muscle": "Back", "equipment": "None", "instructions": "Lying face down, lift your arms and legs off the ground simultaneously to strengthen the lower back." },
    { "id": "cal_bear_crawl", "name": "Bear Crawl", "category": "Calisthenics", "primary_muscle": "Full Body", "equipment": "None", "isDurationBased": true, "instructions": "Crawl forward on hands and toes, keeping your hips low and back flat." },
    { "id": "cal_hollow_hold", "name": "Hollow Body Hold", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Press your lower back into the floor and lift your arms and legs slightly, holding a 'banana' shape." },
    { "id": "cal_wall_sit", "name": "Wall Sit", "category": "Calisthenics", "primary_muscle": "Legs", "equipment": "Wall", "isDurationBased": true, "instructions": "Leaning against a wall, lower your hips until your thighs are parallel to the floor and hold." },
    { "id": "cal_russian_twist", "name": "Russian Twist", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "instructions": "Sit with knees bent and feet elevated; rotate your torso to touch the floor on each side." },
    { "id": "cal_bicycle_crunch", "name": "Bicycle Crunch", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "instructions": "Bring opposite elbow toward opposite knee in a pedaling motion, engaging the obliques." },
    { "id": "cal_v_up", "name": "V-Up", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "instructions": "Simultaneously lift your torso and legs to meet in a 'V' shape at the top." },
    { "id": "cal_flutter_kick", "name": "Flutter Kicks", "category": "Calisthenics", "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Lying on your back, kick your legs up and down in small, rapid movements while keeping core tight." },
    { "id": "cardio_run", "name": "Running", "category": "Cardio", "primary_muscle": "Cardio", "equipment": "None", "isDurationBased": true, "instructions": "Maintain a steady pace with upright posture and a mid-foot strike." },
    { "id": "yoga_mtn", "name": "Tall Mountain Pose", "category": "Yoga", "primary_muscle": "Full Body", "isDurationBased": true, "instructions": "Stand tall with feet together, arms overhead, and reach for the sky while grounding your feet." },
    { "id": "yoga_down_dog", "name": "Downward Dog", "category": "Yoga", "primary_muscle": "Full Body", "isDurationBased": true, "instructions": "Form an inverted 'V' shape with your body, pushing your hips back and pressing heels toward the floor." },
    { "id": "yoga_cat_cow", "name": "Cat-Cow", "category": "Yoga", "primary_muscle": "Back", "isDurationBased": true, "instructions": "Alternate between arching your back (Cat) and dropping your belly (Cow) while synchronized with breath." },
    { "id": "yoga_cobra", "name": "Cobra Pose", "category": "Yoga", "primary_muscle": "Back", "isDurationBased": true, "instructions": "Lying face down, press your chest up while keeping your hips on the floor to stretch the core." },
    { "id": "yoga_tree", "name": "Tree Pose", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Balance on one leg while placing the sole of the other foot on your inner calf or thigh." },
    { "id": "yoga_warrior2", "name": "Warrior II", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Step feet wide, bend front knee to 90 degrees, and extend arms parallel to the floor." },
    { "id": "yoga_fwd_fold", "name": "Forward Fold", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Hinge at your hips and reach for your toes, letting your head hang heavy to stretch the hamstrings." },
    { "id": "yoga_pigeon", "name": "Pigeon Pose", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Bring one knee forward and fold the leg across your body while extending the other leg straight back." },
    { "id": "yoga_boat", "name": "Boat Pose", "category": "Yoga", "primary_muscle": "Abs", "isDurationBased": true, "instructions": "Balance on your sit bones with legs lifted and arms extended forward, forming a 'V' shape." },
    { "id": "yoga_child", "name": "Child's Pose", "category": "Yoga", "primary_muscle": "Recovery", "isDurationBased": true, "instructions": "Kneel and sit on your heels, then fold forward and rest your forehead on the floor." },
    { "id": "yoga_corpse", "name": "Corpse Pose", "category": "Yoga", "primary_muscle": "Recovery", "isDurationBased": true, "instructions": "Lie flat on your back, palms up, and focus on deep breathing and total body relaxation." },
    { "id": "yoga_triangle", "name": "Triangle Pose", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "With legs wide, reach one hand toward your foot while extending the other hand toward the ceiling." }
];

const DEFAULT_TEMPLATES = [
    {
        id: 'powerhouse',
        name: 'The Powerhouse',
        exercises: ['wt_deadlift', 'wt_flat_bench', 'wt_squat', 'wt_ohp', 'wt_lat_pulldown', 'cal_plank'],
        sets: 3
    },
    {
        id: 'upper_blast',
        name: 'Upper Body Blast',
        exercises: ['wt_flat_bench', 'wt_lat_pulldown', 'wt_ohp', 'wt_bent_over_row', 'wt_tricep_pushdown', 'wt_bicep_curl'],
        sets: 3
    },
    {
        id: 'leg_foundation',
        name: 'Leg Foundation',
        exercises: ['wt_squat', 'wt_leg_press', 'wt_romanian_deadlift', 'wt_leg_ext', 'wt_calf_raise'],
        sets: 3
    },
    {
        id: 'pectoral_pump',
        name: 'The Pectoral Pump',
        exercises: ['wt_flat_bench', 'wt_incline_bench', 'wt_decline_bench', 'wt_chest_fly', 'wt_cable_crossover'],
        sets: 3
    },
    {
        id: 'core_flow',
        name: 'Core & Flow',
        exercises: ['cal_plank', 'yoga_down_dog', 'yoga_warrior2', 'yoga_pigeon', 'yoga_boat', 'yoga_child'],
        sets: 3
    },
    {
        id: 'cardio_run_template',
        name: 'Running',
        exercises: ['cardio_run'],
        sets: 1
    }
];

// Safety lookup function to prevent "undefined" crashes
const getExerciseById = (id, masterList) => {
    const found = masterList.find(ex => ex.id === id);
    if (!found) {
        console.error(`Exercise ID ${id} not found in library.`);
        return { id: 'unknown', name: 'Exercise Missing', category: 'N/A' };
    }
    return found;
};

export const WorkoutProvider = ({ children }) => {
    // Shared Data
    const [exercises, setExercises] = useState(DEFAULT_EXERCISES);
    const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);

    // Side-effect removed for stability





    // Load custom templates on mount and merge
    // MOVED TO refreshProfileData for profile scoping
    // useEffect(() => {
    //     const customTemplates = StorageService.loadCustomTemplates();
    //     if (customTemplates.length > 0) {
    //         setTemplates(prev => [...prev, ...customTemplates]);
    //     }
    // }, []);

    // Profile State
    const [profiles, setProfiles] = useState([]);
    const [currentProfile, setCurrentProfile] = useState(null);

    // User-Specific State (Reset when profile changes)
    const [activeWorkout, setActiveWorkout] = useState(null);
    const [history, setHistory] = useState([]);
    const [assessments, setAssessments] = useState([]); // NEW: Assessment History
    const [theme, setTheme] = useState('dark');
    const [units, setUnits] = useState('metric');
    const [soundEnabled, setSoundEnabled] = useState(true);
    // Timer Defaults
    const [defaultRestTime, setDefaultRestTime] = useState(45); // Default 45s
    const [defaultWorkTime, setDefaultWorkTime] = useState(45); // Default 45s
    const [userStats, setUserStats] = useState({
        age: '',
        height: '',
        currentWeight: '',
        targetWeight: '',
        goal: 'maintenance',
        motivation: '',
        bodyFat: '',
        muscleMass: '',
        boneDensity: ''
    });
    const [weightHistory, setWeightHistory] = useState([]);

    // Global Rest Timer State (Ephemeral, scoped to session effectively)
    const [restTimer, setRestTimer] = useState({ timeLeft: 0, isActive: false, duration: 45 }); // Init with default
    // Work Timer (for guided exercises)
    const [workTimer, setWorkTimer] = useState({ timeLeft: 0, isActive: false, duration: 45 }); // Init with default

    // Exercise Preferences (Persisted)
    const [exercisePrefs, setExercisePrefs] = useState({});

    // Smart Progression Settings
    const [smartProgressionEnabled, setSmartProgressionEnabled] = useState(false); // Master Toggle
    const [progressionMode, setProgressionMode] = useState('linear'); // 'linear' | 'double'
    const [progressionType, setProgressionType] = useState('fixed'); // 'fixed' | 'percentage'
    const [progressionIncrement, setProgressionIncrement] = useState(5); // Value (e.g., 5lbs or 2.5%)

    // Guided Mode State
    // Guided Mode State
    const [currentExerciseIndex, _setCurrentExerciseIndex] = useState(0);
    const [currentSetIndex, _setCurrentSetIndex] = useState(0);

    // Wrapper to persist index changes
    const setCurrentExerciseIndex = (index) => {
        _setCurrentExerciseIndex(index);
        if (activeWorkout) {
            updateActiveWorkout({ type: 'SET_CURRENT_EXERCISE_INDEX', index });
        }
    };

    const setCurrentSetIndex = (index) => {
        _setCurrentSetIndex(index);
        if (activeWorkout) {
            updateActiveWorkout({ type: 'SET_CURRENT_SET_INDEX', index });
        }
    };



    // --- 1. INITIALIZATION & MIGRATION ---
    // --- 1. INITIALIZATION & MIGRATION ---
    const refreshGlobalState = () => {
        const profilesData = StorageService.getOrCreateProfiles();

        setProfiles(profilesData);

        // Load Last Active Profile or Default
        const lastProfileId = StorageService.loadCurrentProfileId();
        const initialProfile = profilesData.find(p => p.id === lastProfileId) || profilesData[0];

        if (initialProfile) {
            setCurrentProfile(initialProfile);
        } else {
            setCurrentProfile(null);
        }
    };

    useEffect(() => {
        // --- EMERGENCY WIPE ---
        // Ensure all legacy/corrupt data is gone
        // if (typeof window !== 'undefined') {
        //     console.warn("PERFORMING FULL FACTORY RESET");
        //     StorageService.importSnapshot({});
        // }

        refreshGlobalState();


    }, []);

    // --- 2. LOAD USER DATA WHEN PROFILE CHANGES ---
    // --- 2. LOAD USER DATA WHEN PROFILE CHANGES ---
    const refreshProfileData = (profile) => {
        if (!profile) return;

        // Remember this user
        StorageService.saveCurrentProfileId(profile.id);

        const uid = profile.id;

        const ps = StorageService.loadProfileScopedState(uid);

        setHistory(ps.history);
        setAssessments(ps.assessments);

        setSmartProgressionEnabled(ps.smartProgressionEnabled);
        setProgressionMode(ps.progressionMode);
        setProgressionType(ps.progressionType);
        setProgressionIncrement(ps.progressionIncrement);

        // Load Active Workout with Auto-Healing
        const savedActive = ps.activeWorkout;

        // --- SAFETY CHECK ---
        if (savedActive) {
            // Strict Validation: Must have valid exercises array
            if (savedActive && Array.isArray(savedActive.exercises) && savedActive.exercises.length > 0) {
                setActiveWorkout(savedActive);

                // Hydrate Indices if present (Persist Guided Progress)
                if (savedActive.currentExerciseIndex !== undefined) {
                    _setCurrentExerciseIndex(savedActive.currentExerciseIndex);
                } else {
                    _setCurrentExerciseIndex(0);
                }

                if (savedActive.currentSetIndex !== undefined) {
                    _setCurrentSetIndex(savedActive.currentSetIndex);
                } else {
                    _setCurrentSetIndex(0);
                }
            } else {
                console.warn("Invalid workout structure found. Resetting active workout to null.");
                setActiveWorkout(null);
            }
        } else {
            setActiveWorkout(null);
        }

        setTheme(ps.theme);
        setUnits(ps.units);
        setSoundEnabled(ps.soundEnabled);

        setDefaultRestTime(ps.defaultRestTime);
        setDefaultWorkTime(ps.defaultWorkTime);

        // Update current timers to match defaults if not running (reset duration)
        setRestTimer(prev => ({ ...prev, duration: ps.defaultRestTime }));
        setWorkTimer(prev => ({ ...prev, duration: ps.defaultWorkTime }));

        setUserStats(ps.userStats);
        setWeightHistory(ps.weightHistory);
        setExercisePrefs(ps.exercisePrefs);
        setWeightHistory(ps.weightHistory);
        setExercisePrefs(ps.exercisePrefs);

        // Load Templates Scoped to User
        const userTemplates = StorageService.loadCustomTemplates(uid);
        // Reset to Defaults + User Custom
        // Use Set to prevent duplicates if any weird merging happens (though simply replacing is safer)
        setTemplates([...DEFAULT_TEMPLATES, ...userTemplates]);
    };

    useEffect(() => {
        if (currentProfile) {
            refreshProfileData(currentProfile);
        }
    }, [currentProfile]);


    // --- 3. PERSISTENCE (Scoped to Current Profile) ---

    // Persist History
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveHistory(currentProfile.id, history);
        }
    }, [history, currentProfile]);

    // Persist Active Workout
    useEffect(() => {
        if (currentProfile) {
            console.log("[persist activeWorkout]", currentProfile.id, activeWorkout?.id, activeWorkout?.status);
            StorageService.saveActiveWorkout(currentProfile.id, activeWorkout || null);
        }
    }, [activeWorkout, currentProfile]);

    // Persist Theme
    useEffect(() => {
        if (currentProfile) {
            document.documentElement.setAttribute('data-theme', theme);
            StorageService.saveTheme(currentProfile.id, theme);
        }
    }, [theme, currentProfile]);

    // Persist Units
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveUnits(currentProfile.id, units);
        }
    }, [units, currentProfile]);

    // Persist Sound
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveSound(currentProfile.id, soundEnabled);
        }
    }, [soundEnabled, currentProfile]);

    // Persist Timer Defaults
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveDefaultTimers(currentProfile.id, defaultRestTime, defaultWorkTime);

            // Note: We don't automatically update active timer durations here to avoid jumping mid-timer
            // But we could if it's not active. For now, let's leave it to initialization.
        }
    }, [defaultRestTime, defaultWorkTime, currentProfile]);

    // Persist Stats
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveUserStats(currentProfile.id, userStats);
        }
    }, [userStats, currentProfile]);

    // Persist Weight History
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveWeightHistory(currentProfile.id, weightHistory);
        }
    }, [weightHistory, currentProfile]);

    // Persist Exercise Preferences
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveExercisePrefs(currentProfile.id, exercisePrefs);
        }
    }, [exercisePrefs, currentProfile]);

    // Persist Progression Settings
    useEffect(() => {
        if (currentProfile) {
            StorageService.saveProgressionSettings(currentProfile.id, {
                smartProgressionEnabled,
                progressionMode,
                progressionType,
                progressionIncrement
            });
        }
    }, [smartProgressionEnabled, progressionMode, progressionType, progressionIncrement, currentProfile]);



    // --- AUTO-SAVE TO USB ---



    // --- UTILS ---
    const generateId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    };

    // --- 4. PROFILE ACTIONS ---
    const createProfile = (name, color) => {
        try {
            const newId = 'user_' + generateId();

            const newProfile = {
                id: newId,
                name,
                color,
                avatar: name.charAt(0).toUpperCase()
            };
            const updatedProfiles = [...profiles, newProfile];
            setProfiles(updatedProfiles);
            StorageService.saveProfiles(updatedProfiles);

            // DEBUG: Disable auto-switch to test if creation itself is safe
            // setCurrentProfile(newProfile);
            return true;
        } catch (error) {
            console.error("Failed to create profile:", error);
            alert("CRITICAL ERROR in createProfile: " + error.message);
            return false;
        }
    };

    const switchProfile = (profileId) => {
        // If passed null, explicit logout
        if (profileId === null) {
            setCurrentProfile(null);
            return;
        }
        const profile = profiles.find(p => p.id === profileId);
        if (profile) setCurrentProfile(profile);
    };

    const deleteProfile = (profileId) => {
        // 1. Remove from state
        const updatedProfiles = profiles.filter(p => p.id !== profileId);
        setProfiles(updatedProfiles);
        StorageService.saveProfiles(updatedProfiles);

        // 2. Clean up scoped data
        StorageService.clearProfileData(profileId);

        // 3. If deleting current user, logout
        if (currentProfile && currentProfile.id === profileId) {
            setCurrentProfile(null);
        }
    };


    // --- 5. AUDIO UTILS ---
    // --- 5. AUDIO UTILS ---
    const playBeep = (type = 'success') => {
        if (!soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            // Helper to play a single note with smooth envelope
            const playNote = (freq, startTime, duration = 0.5, vol = 0.1) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);

                // ADSR Envelope
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;

            if (type === 'rest') {
                // REST ENDED -> "Get Ready" Sound
                // Rising Perfect Fifth (A5 -> E6), crisp and energetic
                playNote(880.00, now, 0.4, 0.2); // A5
                playNote(1318.51, now + 0.15, 0.8, 0.2); // E6
            } else {
                // WORK COMPLETED / SUCCESS -> Major Triad Chime
                playNote(1046.50, now, 0.6, 0.2);       // C6
                playNote(1318.51, now + 0.05, 0.6, 0.2); // E6
                playNote(1567.98, now + 0.1, 0.8, 0.2);  // G6
            }

        } catch (e) {
            console.error('Audio play failed', e);
        }
    };

    // --- 6. TIMER LOGIC ---
    useEffect(() => {
        let interval;
        if (restTimer.isActive && restTimer.timeLeft > 0) {
            interval = setInterval(() => {
                setRestTimer(prev => {
                    const nextTime = prev.timeLeft - 1;
                    if (nextTime === 0) {
                        playBeep('rest'); // Distinct sound for Rest
                        return { timeLeft: 0, isActive: false };
                    }
                    return { ...prev, timeLeft: nextTime };
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [restTimer.isActive, restTimer.timeLeft, soundEnabled]);

    const startRestTimer = (seconds) => {
        const duration = seconds || defaultRestTime; // Use stored default
        setRestTimer({ timeLeft: duration, isActive: true, duration: duration });
    };

    const addTimeRest = (seconds) => {
        setRestTimer(prev => {
            const newTime = Math.max(0, prev.timeLeft + seconds);
            const newDuration = Math.max(0, prev.duration + seconds); // Also update duration context
            return { ...prev, timeLeft: newTime, duration: newDuration };
        });
    };

    const skipRest = () => {
        setRestTimer({ timeLeft: 0, isActive: false, duration: defaultRestTime }); // Reset to default
    };

    const toggleRestTimer = () => {
        setRestTimer(prev => ({ ...prev, isActive: !prev.isActive }));
    };

    const toggleWorkTimer = () => {
        setWorkTimer(prev => ({ ...prev, isActive: !prev.isActive }));
    };

    // --- WORK TIMER LOGIC ---
    useEffect(() => {
        let interval;
        if (workTimer.isActive && workTimer.timeLeft > 0) {
            interval = setInterval(() => {
                setWorkTimer(prev => {
                    const nextTime = prev.timeLeft - 1;
                    if (nextTime === 0) {
                        playBeep('success'); // Distinct sound for Work
                        // Auto-transition could happen here, but usually better to wait for user confirmation
                        // or auto-trigger rest? For now, just beep.
                        return { ...prev, timeLeft: 0, isActive: false };
                    }
                    return { ...prev, timeLeft: nextTime };
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [workTimer.isActive, workTimer.timeLeft, soundEnabled]);

    const startWorkTimer = (seconds) => {
        const duration = seconds || ((workTimer.duration > 0 && workTimer.duration !== 45) ? workTimer.duration : defaultWorkTime);
        // Optimization: if workTimer.duration is already set (and distinct), keep it? 
        // Logic: seconds priority -> existing duration -> default
        // Actually, user might want to reset to default. 
        // Let's use: seconds -> defaultWorkTime
        const actualDuration = seconds || defaultWorkTime;
        setWorkTimer({ timeLeft: actualDuration, isActive: true, duration: actualDuration });
    };

    const addTimeWork = (seconds) => {
        setWorkTimer(prev => {
            const newTime = Math.max(0, prev.timeLeft + seconds);
            const newDuration = Math.max(0, prev.duration + seconds);
            return { ...prev, timeLeft: newTime, duration: newDuration };
        });
    };

    const stopWorkTimer = () => {
        setWorkTimer(prev => ({ ...prev, isActive: false }));
    };

    const resetWorkTimer = () => {
        setWorkTimer(prev => ({ ...prev, timeLeft: prev.duration, isActive: false }));
    };


    // --- SMART HISTORY LOOKUP ---
    const getLastExerciseStats = (exerciseId) => {
        try {
            if (!history || history.length === 0) return null;

            // Iterate backwards through history to find the last time this exercise was performed
            for (let i = 0; i < history.length; i++) {
                const workout = history[i]; // History is sorted new -> old (index 0 is newest)

                if (!workout.completed) continue;

                const exData = workout.exercises ? workout.exercises.find(e => e && e.exercise && e.exercise.id === exerciseId) : null;
                if (exData && exData.sets && exData.sets.length > 0) {
                    // Roadmap Goal: "Last completed set data"
                    // We will prioritize the LAST completed set to reflect the final state (e.g. failure point or success)
                    // OR we can prioritize the HEAVIEST set. 
                    // Let's go with HEAVIEST set for "Next Goal" purposes, as it represents capability.

                    const completedSets = exData.sets.filter(s => s.completed);
                    if (completedSets.length === 0) continue;

                    // Find heaviest set
                    const bestSet = completedSets.reduce((best, current) => {
                        return (current.weight || 0) > (best.weight || 0) ? current : best;
                    }, completedSets[0]);

                    return {
                        date: workout.startTime,
                        weight: bestSet.weight,
                        reps: bestSet.reps,
                        time: bestSet.time,
                        distance: bestSet.distance
                    };
                }
            }
            return null;
        } catch (e) {
            console.warn("Smart-Load Bypass: Failed to get last stats for", exerciseId);
            return null;
        }
    };

    // --- 7. WORKOUT LOGIC ---
    const startWorkout = (name = 'New Workout') => {
        const newWorkout = {
            id: generateId(),
            name,
            startTime: new Date().toISOString(),
            status: 'preparing', // CHANGED: Start in prep mode
            notes: '', // Initialize notes
            exercises: []
        };
        setActiveWorkout(newWorkout);
        setActiveWorkout(newWorkout);
        _setCurrentExerciseIndex(0);
        _setCurrentSetIndex(0);
    };

    const startWorkoutFromTemplate = (templateIdOrObj) => {
        try {
            let template;
            let templateId;

            if (typeof templateIdOrObj === 'object') {
                // Object passed directly (e.g. from creation)
                template = templateIdOrObj;
                templateId = template.id;
                console.log("DEBUG: Using provided template object:", template.name);
            } else {
                // ID passed
                templateId = templateIdOrObj;
                console.log("DEBUG: Attempting to load template ID:", templateId);
                template = templates.find(t => t.id === templateId);
            }

            if (!template) {
                console.error("DEBUG: Template not found for:", templateIdOrObj);
                return;
            }
            console.log("DEBUG: Found/Using template:", template.name);

            // Handle both legacy (object) and new (string ID) exercise formats
            const newWorkoutExercises = template.exercises.map(exItem => {
                // Determine ID based on format
                const exId = typeof exItem === 'string' ? exItem : exItem.id;

                // Use new safety lookup
                const fullExercise = getExerciseById(exId, exercises);

                // Validation check (double safety)
                if (!fullExercise || fullExercise.id === 'unknown') {
                    console.warn(`Skipping missing exercise: ${exId}`);
                    return null;
                }

                // SMART LOAD: Check history
                let lastStats = null;
                try {
                    lastStats = getLastExerciseStats(fullExercise.id);
                } catch (e) {
                    console.error("DEBUG: getLastExerciseStats failed for", fullExercise.id, e);
                }

                const smartWeight = lastStats ? lastStats.weight : 0;
                const smartReps = lastStats ? lastStats.reps : 0;

                // Determine set count
                const targetSets = (typeof exItem === 'object' && exItem.sets) ? exItem.sets : (template.sets || 3);

                const sets = Array(targetSets).fill(0).map(() => ({
                    id: generateId(),
                    weight: lastStats ? lastStats.weight : (fullExercise.isBodyweight ? (parseFloat(userStats.currentWeight) || 0) : 0),
                    targetReps: lastStats ? lastStats.reps : 0,
                    targetTime: fullExercise.default_duration || 0,
                    reps: 0, distance: 0, time: 0, completed: false,
                    lastPerformance: lastStats // METADATA
                }));

                return {
                    id: generateId(),
                    exercise: fullExercise,
                    sets
                };
            }).filter(Boolean);

            const newWorkout = {
                id: generateId(),
                name: template.name,
                startTime: new Date().toISOString(),
                status: 'preparing',
                // Track source template for syncing
                sourceTemplateId: templateId, // TRACK SOURCE
                exercises: newWorkoutExercises
            };

            console.log("DEBUG: Setting active workout:", newWorkout);
            setActiveWorkout(newWorkout);
            _setCurrentExerciseIndex(0);
            _setCurrentSetIndex(0);

        } catch (error) {
            console.error("CRITICAL: Failed to load template", error);
            alert("Failed to load template. Please check console.");
        }
    };

    const finishWorkout = () => {
        if (!activeWorkout) return;

        // Generate Recommendations
        const recommendations = [];
        activeWorkout.exercises.forEach(ex => {
            // Progression Logic
            // Determine effective settings
            const effectiveMode = smartProgressionEnabled ? progressionMode : 'linear';
            const effectiveType = smartProgressionEnabled ? progressionType : 'fixed';
            const effectiveIncrement = smartProgressionEnabled ? progressionIncrement : (units === 'metric' ? 2.5 : 5);

            let shouldRecommend = false;
            // Guard against empty sets
            if (!ex.sets || ex.sets.length === 0) return;

            let lastSet = ex.sets[ex.sets.length - 1]; // Default reference for weight

            if (effectiveMode === 'double') {
                // Double Progression: All sets must meet target
                const allSetsMet = ex.sets.every(s => s.targetReps > 0 && s.reps >= s.targetReps && s.weight > 0);
                if (allSetsMet) shouldRecommend = true;
            } else {
                // Linear (Standard): Any set meeting target triggers recommendation (usually final set logic, but let's be generous: if last set hit it)
                // Actually, standard linear usually implies if you hit your reps on the last set (AMRAP or fixed), you go up.
                // We'll check if the LAST set met the target.
                const finalSet = ex.sets[ex.sets.length - 1];
                if (finalSet && finalSet.targetReps > 0 && finalSet.reps >= finalSet.targetReps && finalSet.weight > 0) {
                    shouldRecommend = true;
                }
            }

            if (shouldRecommend) {
                let incrementValue = 0;
                let newWeight = 0;

                if (effectiveType === 'percentage') {
                    // Percentage increase (e.g., 2.5%)
                    const increase = lastSet.weight * (effectiveIncrement / 100);
                    // Round to nearest 0.5 (metric) or 1 (imperial) approximately, or just keep decimal
                    // Let's round to nearest 1 for simplicity of display
                    incrementValue = Math.round(increase * 10) / 10;
                    newWeight = lastSet.weight + incrementValue;
                } else {
                    // Fixed weight increase
                    incrementValue = effectiveIncrement;
                    newWeight = lastSet.weight + incrementValue;
                }

                // Clean float math
                newWeight = Math.round(newWeight * 100) / 100;

                recommendations.push({
                    exerciseId: ex.exercise.id,
                    exerciseName: ex.exercise.name,
                    setId: lastSet.id,
                    oldWeight: lastSet.weight,
                    newWeight: newWeight,
                    message: `Recommend +${incrementValue}${units === 'metric' ? 'kg' : 'lbs'} (${newWeight})`
                });
            }
        });

        // Deduplicate recommendations (only one per exercise, preferably the highest weight increase?)
        // Or simplified: Just store them all, UI can filter.
        // Actually, let's just keep unique exercises for the summary to be clean
        const uniqueRecs = [];
        const seenEx = new Set();
        recommendations.forEach(rec => {
            if (!seenEx.has(rec.exerciseId)) {
                uniqueRecs.push(rec);
                seenEx.add(rec.exerciseId);
            }
        });

        const completedWorkout = {
            ...activeWorkout,
            endTime: new Date().toISOString(),
            status: 'completed',
            recommendations: uniqueRecs // NEW: Save to history
        };
        setHistory(prev => [completedWorkout, ...prev]);
        setActiveWorkout(null);
        skipRest();        // Stop rest timer
        resetWorkTimer();  // Stop/Reset work timer

        return completedWorkout; // RETURN for immediate UI use
    };

    const deleteWorkout = (workoutId) => {
        setHistory(prev => prev.filter(w => w.id !== workoutId));
    };

    const cancelWorkout = () => {
        setActiveWorkout(null);
        skipRest();        // Stop rest timer
        resetWorkTimer();  // Stop/Reset work timer
    };

    const addExerciseToWorkout = (exerciseId) => {
        if (!activeWorkout) return;
        const exercise = exercises.find(e => e.id === exerciseId);
        if (!exercise) return;
        const newWorkoutExercise = {
            id: generateId(),
            exercise,
            sets: [{
                id: generateId(),
                weight: exercise.isBodyweight ? (parseFloat(userStats.currentWeight) || 0) : 0,
                targetReps: 0,
                targetDistance: 0, // NEW
                targetTime: 0,     // NEW
                reps: 0,
                distance: 0,
                time: 0,
                completed: false
            }]
        };
        setActiveWorkout(prev =>
    ActiveWorkoutService.addExercise(prev, { newWorkoutExercise })
);

    };

    const updateSet = (exerciseInstanceId, setId, updates) => {
        if (!activeWorkout) return;

        setActiveWorkout(prev => {
            // Find indices for sync
            const exIndex = prev.exercises.findIndex(e => e.id === exerciseInstanceId);
            if (exIndex === -1) return prev;

            const exercise = prev.exercises[exIndex];
            const setIndex = exercise.sets.findIndex(s => s.id === setId);
            if (setIndex === -1) return prev;

            // SYNC LOGIC: If updating weight or targetReps, sync to template
            if (prev.sourceTemplateId && (updates.weight !== undefined || updates.targetReps !== undefined)) {
                // We need to sync THIS set index of THIS exercise index to the original template
                syncToTemplate(prev.sourceTemplateId, exIndex, setIndex, updates);
            }

     return ActiveWorkoutService.updateSet(prev, {
            exerciseInstanceId,
            setId,
            updates
        });
    });
};

    // Helper to sync changes back to source template
    const syncToTemplate = (templateId, exIndex, setIndex, updates) => {
        setTemplates(prevTemplates => {
            const tplIndex = prevTemplates.findIndex(t => t.id === templateId);
            if (tplIndex === -1) return prevTemplates;

            const tpl = prevTemplates[tplIndex];
            // Deep copy to be safe
            const newTpl = { ...tpl, exercises: [...tpl.exercises] };

            if (!newTpl.exercises[exIndex]) return prevTemplates; // Mismatch?

            const tplEx = newTpl.exercises[exIndex];

            // Check if legacy (number) or rich (array)
            if (Array.isArray(tplEx.sets)) {
                // Ensure array is long enough (it should be)
                const newSets = [...tplEx.sets];
                if (newSets[setIndex]) {
                    // Update only provided fields
                    newSets[setIndex] = { ...newSets[setIndex] };
                    if (updates.weight !== undefined) newSets[setIndex].weight = updates.weight;
                    if (updates.targetReps !== undefined) newSets[setIndex].targetReps = updates.targetReps; // Also sync reps if changed
                    // Distance/Time? Probably yes for cardio, mainly weight for lifting.
                    if (updates.targetDistance !== undefined) newSets[setIndex].targetDistance = updates.targetDistance;
                    if (updates.targetTime !== undefined) newSets[setIndex].targetTime = updates.targetTime;
                }
                tplEx.sets = newSets;
            } else {
                // Legacy: can't sync individual set weight effectively if it's just a number. 
                // Would need to migrate template first. Skip for now.
            }

            newTpl.exercises[exIndex] = tplEx;

            const newTemplates = [...prevTemplates];
            newTemplates[tplIndex] = newTpl;

            // Persist
            if (activeWorkout && activeWorkout.sourceTemplateId && currentProfile) {
                const customTemplates = StorageService.loadCustomTemplates(currentProfile.id);
                const storedIndex = customTemplates.findIndex(t => t.id === templateId);
                if (storedIndex !== -1) {
                    customTemplates[storedIndex] = newTpl;
                    StorageService.saveCustomTemplates(currentProfile.id, customTemplates);
                }
            }

            return newTemplates;
        });
    };

    const getSuggestedLoad = (exerciseId) => {
        // 1. Find last workout with this exercise
        const lastWorkout = history.find(w => w.exercises && w.exercises.some(e => e.e.id === exerciseId));
        if (!lastWorkout) return null;

        const exData = lastWorkout.exercises.find(e => e.exercise.id === exerciseId);
        if (!exData || !exData.sets || exData.sets.length === 0) return null;

        const completedSets = exData.sets.filter(s => s.completed);
        if (completedSets.length === 0) return null;

        // 2. Check Success Criteria
        const allMetGoal = completedSets.every(s => {
            // Logic for "Goal Met"
            const repsMet = s.targetReps > 0 && s.reps >= s.targetReps;
            const timeMet = s.targetTime > 0 && s.time >= s.targetTime;
            return repsMet || timeMet;
        });

        if (allMetGoal) {
            // 3. Generate Suggestion
            const lastSet = completedSets[completedSets.length - 1]; // Base off last set
            const isWeight = exData.exercise.category === 'Weight Lifting' || (lastSet.weight > 0 && !exData.exercise.isBodyweight);
            const wUnit = units === 'metric' ? 'kg' : 'lbs';
            const increment = units === 'metric' ? 2.5 : 5;

            if (isWeight) {
                return {
                    type: 'weight',
                    value: increment,
                    unit: wUnit,
                    baseWeight: lastSet.weight,
                    reason: `You crushed it last time! Try +${increment}${wUnit}?`
                };
            } else {
                // Duration or Reps
                if (lastSet.targetTime > 0) {
                    return {
                        type: 'time',
                        value: 5,
                        unit: 'sec',
                        baseTime: lastSet.targetTime,
                        reason: `Great hold! Try +5 sec?`
                    };
                } else {
                    return {
                        type: 'reps',
                        value: 1,
                        unit: 'rep',
                        baseReps: lastSet.targetReps,
                        reason: `Easy peasy! Add +1 rep?`
                    };
                }
            }
        }
        return null;
    };

    const checkPersonalRecord = (exerciseId, currentWeight, currentReps) => {
        if (!history || history.length === 0) return true;

        let maxWeight = 0;
        let maxRepsAtMaxWeight = 0;

        history.forEach(workout => {
            if (!workout.exercises) return;
            const exData = workout.exercises.find(e => e.exercise.id === exerciseId);
            if (exData && exData.sets) {
                exData.sets.forEach(s => {
                    if (s.completed) {
                        if (s.weight > maxWeight) {
                            maxWeight = s.weight;
                            maxRepsAtMaxWeight = s.reps;
                        } else if (s.weight === maxWeight && s.reps > maxRepsAtMaxWeight) {
                            maxRepsAtMaxWeight = s.reps;
                        }
                    }
                });
            }
        });

        if (currentWeight > maxWeight) return true;
        if (currentWeight === maxWeight && currentReps > maxRepsAtMaxWeight) return true;

        return false;
    };

    const toggleSetComplete = (exerciseInstanceId, setId, currentStatus) => {
        let updates = { completed: !currentStatus };

        // PR CHECK (Phase E)
        if (!currentStatus) { // We are marking as COMPLETE
            const ex = activeWorkout.exercises.find(e => e.id === exerciseInstanceId);
            const set = ex?.sets.find(s => s.id === setId);

            if (ex && set) {
                // Determine if PR
                const isPR = checkPersonalRecord(ex.exercise.id, set.weight || 0, set.reps || 0); // Handle 0 safely
                if (isPR) updates.isPR = true;
            }
        } else {
            // Unmarking complete removes PR status
            updates.isPR = false;
        }

        updateSet(exerciseInstanceId, setId, updates);

        // IF finishing a set (marking complete), start appropriate timer logic
        if (!currentStatus) {
            // Stop work timer if running
            stopWorkTimer();
            // Start rest timer
            startRestTimer(defaultRestTime); // Explicitly use default
        } else {
            // Un-completing logic? Maybe stop rest timer
            skipRest();
        }
    };

    // Explicitly apply progression to the template for future workouts
    const applyProgression = (exerciseInstanceId, setId, updates) => {
        if (!activeWorkout || !activeWorkout.sourceTemplateId) return;

        // Find indices
        const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseInstanceId);
        if (exIndex === -1) return;

        const exercise = activeWorkout.exercises[exIndex];
        const setIndex = exercise.sets.findIndex(s => s.id === setId);
        if (setIndex === -1) return;

        // Sync to template
        syncToTemplate(activeWorkout.sourceTemplateId, exIndex, setIndex, updates);
    };

    // Start the guided session (transition from prep to active)
    const startGuidedSession = () => {
        if (!activeWorkout) return;
        console.log("[startGuidedSession] setting status=active", activeWorkout?.id);

        // Initialize indices as 0 in the persistent object
        setActiveWorkout(prev => ({
            ...prev,
            status: 'active',
            currentExerciseIndex: 0,
            currentSetIndex: 0
        }));

        _setCurrentExerciseIndex(0);
        _setCurrentSetIndex(0);
        // Do not auto-start work timer yet, let user click "Start" on the first set? 
        // Or if user wants total automation:
        // startWorkTimer(); 
    };

    const addSet = (exerciseInstanceId) => {
    if (!activeWorkout) return;

    setActiveWorkout(prev => {
        const ex = prev.exercises.find(e => e.id === exerciseInstanceId);
        if (!ex) return prev;

        // Determine default weight for new set
        let defaultWeight = 0;
        const previousSet = ex.sets[ex.sets.length - 1];

        if (previousSet) {
            defaultWeight = previousSet.weight;
        } else if (ex.exercise.isBodyweight) {
            // Fallback to profile weight if no previous sets exist
            defaultWeight = parseFloat(userStats.currentWeight) || 0;
        }

        const previousTarget = previousSet ? (previousSet.targetReps || 0) : 0;
        const previousTargetDist = previousSet ? (previousSet.targetDistance || 0) : 0;
        const previousTargetTime = previousSet ? (previousSet.targetTime || 0) : 0;

        const previousReps = previousSet ? previousSet.reps : 0;
        const previousDist = previousSet ? previousSet.distance : 0;
        const previousTime = previousSet ? previousSet.time : 0;

        const newSet = {
            id: generateId(),
            weight: defaultWeight,
            targetReps: previousTarget,
            targetDistance: previousTargetDist,
            targetTime: previousTargetTime,
            reps: previousReps,
            distance: previousDist,
            time: previousTime,
            completed: false
        };

        return ActiveWorkoutService.addSet(prev, { exerciseInstanceId, newSet });
    });
};


    const removeSet = (exerciseInstanceId, setId) => {
    if (!activeWorkout) return;

    setActiveWorkout(prev =>
        ActiveWorkoutService.removeSet(prev, { exerciseInstanceId, setId })
    );
};


    const removeExerciseFromWorkout = (exerciseInstanceId) => {
        if (!activeWorkout) return;
        setActiveWorkout(prev =>
    ActiveWorkoutService.removeExercise(prev, { exerciseInstanceId })
);

    };

    const addCustomExercise = (newExercise) => {
        const exerciseWithId = { ...newExercise, id: 'ex_custom_' + Date.now() };
        const updatedList = [...exercises, exerciseWithId];
        setExercises(updatedList);

        const customExercises = StorageService.loadCustomExercises(currentProfile?.id);
        customExercises.push(exerciseWithId);
        StorageService.saveCustomExercises(currentProfile?.id, customExercises);
    };

    const addWeightEntry = (weight) => {
        const entry = {
            date: new Date().toISOString(),
            weight: parseFloat(weight)
        };
        setWeightHistory(prev => [...prev, entry]);
    };

    const updateTimerPref = (exerciseId, type, duration) => {
        setExercisePrefs(prev => ({
            ...prev,
            [exerciseId]: {
                ...prev[exerciseId],
                [type]: duration
            }
        }));
    };

    const updateWorkoutNotes = (notes) => {
        if (!activeWorkout) return;
        setActiveWorkout(prev => ({
            ...prev,
            notes
        }));
    };

    const saveWorkoutAsTemplate = (templateName) => {
        if (!activeWorkout) return;
        if (!currentProfile) {
            alert("Please select a profile to save templates.");
            return;
        }

        const newTemplate = {
            id: 'tpl_custom_' + generateId(), // Robust ID
            name: templateName,
            isCustom: true,
            exercises: activeWorkout.exercises.map(ex => ({
                id: ex.exercise.id,
                // Save detailed set info so it can be restored
                sets: ex.sets.map(s => ({
                    weight: s.weight,
                    targetReps: s.reps > 0 ? s.reps : (s.targetReps || 0), // Use performed reps as next target, or fallback
                    targetDistance: s.distance > 0 ? s.distance : (s.targetDistance || 0),
                    targetTime: s.time > 0 ? s.time : (s.targetTime || 0)
                }))
            }))
        };

        const updatedTemplates = [...templates, newTemplate];
        setTemplates(updatedTemplates);

        // Persist to Profile
        // Only save the CUSTOM ones to storage (filter out defaults or just append to existing storage list)
        // Better: Read storage, append, write.
        const storedTemplates = StorageService.loadCustomTemplates(currentProfile.id);
        const newStored = [...storedTemplates, newTemplate];
        StorageService.saveCustomTemplates(currentProfile.id, newStored);
    };

    const deleteTemplate = (templateId) => {
        if (!currentProfile) return;

        // Remove from state
        setTemplates(prev => prev.filter(t => t.id !== templateId));

        // Remove from storage
        const storedTemplates = StorageService.loadCustomTemplates(currentProfile.id);
        const updatedStored = storedTemplates.filter(t => t.id !== templateId);
        StorageService.saveCustomTemplates(currentProfile.id, updatedStored);
    };

    const saveCustomTemplate = (name, exercisesList) => {
        if (!currentProfile) return;

        const newTemplate = {
            id: 'tpl_custom_' + generateId(),
            name: name,
            isCustom: true,
            exercises: exercisesList, // Expects standard format
            sets: 3 // Default
        };

        setTemplates(prev => [...prev, newTemplate]);

        const storedTemplates = StorageService.loadCustomTemplates(currentProfile.id);
        const newStored = [...storedTemplates, newTemplate];
        StorageService.saveCustomTemplates(currentProfile.id, newStored);

        return newTemplate;
    };

    // --- ASSESSMENT LOGIC ---
    const saveAssessment = (assessmentData) => {
        if (!currentProfile) return;

        const newAssessment = {
            id: 'asm_' + Date.now(),
            date: new Date().toISOString(),
            ...assessmentData
        };

        const updated = [...assessments, newAssessment];
        setAssessments(updated);

        // Save to storage
        StorageService.saveAssessments(currentProfile.id, updated);
    };

    // --- 10. HISTORY LOOKUP (Previous Stats) ---


    // --- 9. ASSESSMENT IMPORTER ---
    // --- 9. ASSESSMENT IMPORTER ---
    const importProgram = (programDataInput) => {
        try {
            if (!programDataInput || !programDataInput.templates) {
                console.error("Invalid program data");
                return;
            }

            // Deep clone to avoid mutating global constants
            const programData = JSON.parse(JSON.stringify(programDataInput));

            let updatedExercises = [...exercises];
            const newCustomExercises = [];

            // 1. Ensure all exercises exist
            programData.templates.forEach(tpl => {
                tpl.exercises.forEach(exData => {
                    const existing = updatedExercises.find(e => e.name === exData.name);
                    if (!existing) {
                        // Create new exercise
                        const newEx = {
                            id: 'ex_auto_' + generateId(),
                            name: exData.name,
                            category: exData.category || 'Other',
                            type: exData.type || 'strength',
                            isBodyweight: exData.isBodyweight || false
                        };
                        updatedExercises.push(newEx);
                        newCustomExercises.push(newEx);
                        // Update the ID in our local copy
                        exData.id = newEx.id;
                    } else {
                        exData.id = existing.id;
                    }
                });
            });

            // Persist new exercises
            if (newCustomExercises.length > 0) {
                setExercises(updatedExercises);
                const savedCustom = StorageService.loadCustomExercises(currentProfile?.id);
                StorageService.saveCustomExercises(currentProfile?.id, [...savedCustom, ...newCustomExercises]);
            }

            // 2. Create Templates
            const readyTemplates = programData.templates.map(tpl => ({
                id: 'tpl_' + generateId(),
                name: tpl.name,
                isCustom: true,
                exercises: tpl.exercises.map(ex => ({
                    id: ex.id,
                    // Convert simple "sets: 3, reps: 10" into rich set array so targets appear when starting
                    sets: Array(ex.sets || 3).fill(null).map(() => ({
                        targetReps: ex.reps || 0,
                        targetTime: ex.time || 0,
                        weight: 0
                    }))
                }))
            }));

            setTemplates(prev => [...prev, ...readyTemplates]);

            setTemplates(prev => [...prev, ...readyTemplates]);

            if (currentProfile) {
                const storedTemplates = StorageService.loadCustomTemplates(currentProfile.id);
                StorageService.saveCustomTemplates(currentProfile.id, [...storedTemplates, ...readyTemplates]);
            }

            return true; // Success
        } catch (error) {
            console.error("Failed to import program:", error);
            return false; // Fail
        }
    };

    // Load custom exercises on mount
    useEffect(() => {
        if (!currentProfile) return;
        const customExercises = StorageService.loadCustomExercises(currentProfile.id);
        if (customExercises.length > 0) {
            setExercises([...DEFAULT_EXERCISES, ...customExercises]);
        } else {
            setExercises(DEFAULT_EXERCISES);
        }
    }, [currentProfile]);

    // --- ANALYTICS HELPERS (Phase B) ---
    const getMuscleVolumeDistribution = () => {
        if (!history) return { data: [], insight: '' };

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const counts = {
            Chest: 0,
            Back: 0,
            Shoulders: 0,
            Legs: 0,
            Arms: 0,
            Core: 0
        };

        let totalSets = 0;

        history.forEach(workout => {
            const wDate = new Date(workout.startTime);
            if (wDate < cutoff || !workout.completed) return;

            if (!workout.exercises) return;

            workout.exercises.forEach(exData => {
                let group = exData.exercise.muscleGroup;

                // Normalization
                if (!counts.hasOwnProperty(group)) {
                    if (group === 'Functional') group = 'Core';
                    else if (group === 'Conditioning') group = 'Core';
                    else if (group === 'Recovery') return;
                    else if (group === 'Full Body') return;
                    else return;
                }

                // Count completed sets
                if (exData.sets) {
                    const setProps = exData.sets.filter(s => s.completed).length;
                    if (setProps > 0) {
                        counts[group] += setProps;
                        totalSets += setProps;
                    }
                }
            });
        });

        const data = Object.keys(counts).map(key => ({
            subject: key,
            A: totalSets > 0 ? Math.round((counts[key] / totalSets) * 100) : 0,
            fullMark: 100
        }));

        // Generate Insight
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];

        let insight = "Keep logging workouts to see your balance!";
        if (totalSets > 5) {
            const topName = top[1] > 0 ? top[0] : "None";
            const bottomName = bottom[0];
            insight = `You represent a heavy focus on ${topName} (${Math.round((top[1] / totalSets) * 100)}%). Consider more ${bottomName} work for better balance.`;
        }

        return { data, insight };
    };

    const calculateVolume = (workout) => {
        if (!workout) return 0;
        return workout.exercises.reduce((total, ex) => {
            return total + ex.sets.reduce((setTotal, set) => {
                if (!set.completed) return setTotal;
                return setTotal + (set.weight * set.reps);
            }, 0);
        }, 0);
    };

    // --- 8. DATA MANAGEMENT ---
    const getBackupData = () => StorageService.exportSnapshot();

    const exportData = () => {
        const data = getBackupData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fitness-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };





    const processImportedData = (data) => {
        StorageService.importSnapshot(data);
    };

    const importData = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    processImportedData(data);
                    resolve(true);
                    // Reload to apply changes
                    window.location.reload();
                } catch (err) {
                    reject(new Error("Failed to parse backup file: " + err.message));
                }
            };
            reader.readAsText(file);
        });
    };

    const value = {
        activeWorkout,
        exercises,
        templates,
        history,
        profiles,
        currentProfile,
        theme,
        setTheme,
        units,
        setUnits,
        soundEnabled,
        setSoundEnabled,
        restTimer,
        startRestTimer,
        toggleRestTimer, // NEW
        skipRest, // Added export
        addTimeRest,
        addTimeWork,
        startWorkTimer,
        stopWorkTimer,
        toggleWorkTimer, // NEW
        resetWorkTimer,
        startWorkout,
        startWorkoutFromTemplate,
        finishWorkout,
        cancelWorkout,
        addExerciseToWorkout,
        removeExerciseFromWorkout,
        addSet,
        updateSet,
        removeSet,
        toggleSetComplete,
        applyProgression, // NEW
        calculateVolume,
        createProfile,
        switchProfile,
        deleteProfile,
        addCustomExercise,
        saveWorkoutAsTemplate,
        deleteTemplate,
        saveCustomTemplate, // NEW
        exportData, // NEW
        importData, // NEW
        updateWorkoutNotes,
        userStats,
        setUserStats,
        weightHistory,
        addWeightEntry,
        deleteWorkout,
        importProgram, // NEW
        assessments,   // NEW
        saveAssessment, // NEW
        lastPerformance: getLastExerciseStats, // Alias for legacy if needed, or just use below
        getLastExerciseStats, // NEW
        checkPersonalRecord, // NEW - Phase E
        getSuggestedLoad, // NEW - Phase F
        getMuscleVolumeDistribution, // NEW - Phase B
        // Guided Mode Exports
        currentExerciseIndex,
        setCurrentExerciseIndex,
        currentSetIndex,
        setCurrentSetIndex,
        startGuidedSession,
        workTimer,
        exercisePrefs,
        updateTimerPref,
        defaultRestTime,
        setDefaultRestTime,
        defaultWorkTime,
        setDefaultWorkTime,

        // Smart Progression Exports
        smartProgressionEnabled,
        setSmartProgressionEnabled,
        progressionMode,
        setProgressionMode,
        progressionType,
        setProgressionType,
        progressionIncrement,
        setProgressionIncrement
    };

    return (
        <WorkoutContext.Provider value={value}>
            {children}
        </WorkoutContext.Provider>
    );
};

export const useWorkout = () => {
    const context = useContext(WorkoutContext);
    if (!context) {
        throw new Error('useWorkout must be used within a WorkoutProvider');
    }
    return context;
};
