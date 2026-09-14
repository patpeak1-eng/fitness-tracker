import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import StorageService from '../services/StorageService';
import ActiveWorkoutService from "../services/ActiveWorkoutService";
import * as ApiService from '../services/ApiService';
import SyncQueue from '../services/SyncQueue';
import { DEFAULT_PERSONALITY } from '../constants/coachPersonalities';
import { DEFAULT_VOICE_ID } from '../constants/voiceIds';
import {
    normalizeEquipmentEnvironments,
    resolveEquipmentEnvironmentHydration,
} from '../utils/equipmentEnvironments';


export const WorkoutContext = createContext();

const exerciseRequiresExternalWeight = (exercise) => {
    if (!exercise) return false;

    return !(
        exercise.isBodyweight ||
        exercise.category === 'Calisthenics' ||
        exercise.category === 'Yoga' ||
        exercise.equipment === 'None'
    );
};

const getPrepValidation = (activeWorkout) => {
    if (!activeWorkout || activeWorkout.status !== 'preparing') {
        return { canStartGuidedWorkout: true, invalidWeightSetKeys: [] };
    }

    const invalidWeightSetKeys = [];

    (activeWorkout.exercises || []).forEach((workoutExercise) => {
        if (!workoutExercise?.exercise || !exerciseRequiresExternalWeight(workoutExercise.exercise)) return;

        (workoutExercise.sets || []).forEach((set) => {
            if (!(Number(set.weight) > 0)) {
                invalidWeightSetKeys.push(`${workoutExercise.id}:${set.id}`);
            }
        });
    });

    return {
        canStartGuidedWorkout: (activeWorkout.exercises || []).length > 0 && invalidWeightSetKeys.length === 0,
        invalidWeightSetKeys
    };
};

const DEFAULT_EXERCISES = [
    { "id": "wt_ohp", "name": "Overhead Press", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Barbell/Dumbbells", "instructions": "Press the weight directly overhead until arms lock, keeping core tight and avoiding a back arch.", "illustration": "/illustrations/wt_ohp.jpg" },
    { "id": "wt_lat_raise", "name": "Dumbbell Side Raise", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Raise dumbbells out to the sides with a slight elbow bend until arms are parallel to the floor.", "illustration": "/illustrations/wt_lat_raise.jpg" },
    { "id": "wt_front_raise", "name": "Front Raise", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Lift dumbbells in front of you to shoulder height, keeping your torso still and core engaged.", "illustration": "/illustrations/wt_front_raise.jpg" },
    { "id": "wt_face_pull", "name": "Face Pulls", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Cable", "instructions": "Pull the rope toward your face, pulling the ends apart and squeezing your shoulder blades together.", "illustration": "/illustrations/wt_face_pull.jpg" },
    { "id": "wt_rear_delt_fly", "name": "Rear Delt Fly", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells/Machine", "instructions": "Bend at the hips and fly the weights outward to target the back of the shoulders.", "illustration": "/illustrations/wt_rear_delt_fly.jpg" },
    { "id": "wt_shrug", "name": "Dumbbell Shrug", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Lift your shoulders toward your ears in a straight line, hold for a second, and lower slowly.", "illustration": "/illustrations/wt_shrug.jpg" },
    { "id": "wt_arnold_press", "name": "Arnold Press", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Start with palms facing you; rotate palms forward as you press the dumbbells overhead.", "illustration": "/illustrations/wt_arnold_press.jpg" },
    { "id": "wt_flat_bench", "name": "Flat Bench Press", "category": "Weights", "primary_muscle": "Chest", "equipment": "Barbell", "instructions": "Lower the bar to mid-chest, keep elbows at a 45-degree angle, and drive the weight back up.", "illustration": "/illustrations/wt_flat_bench.jpg" },
    { "id": "wt_incline_bench", "name": "Incline Bench Press", "category": "Weights", "primary_muscle": "Chest", "equipment": "Barbell/Dumbbells", "instructions": "Set bench to 30-45 degrees; lower weight to upper chest to target the clavicular fibers.", "illustration": "/illustrations/wt_incline_bench.jpg" },
    { "id": "wt_chest_fly", "name": "Chest Fly", "category": "Weights", "primary_muscle": "Chest", "equipment": "Dumbbells/Machine", "instructions": "With a slight bend in elbows, open arms wide and squeeze chest to bring weights together at the top.", "illustration": "/illustrations/wt_chest_fly.jpg" },
    { "id": "wt_decline_bench", "name": "Decline Bench Press", "category": "Weights", "primary_muscle": "Chest", "equipment": "Barbell", "instructions": "Lower the bar to the lower chest; this angle emphasizes the lower pectoral muscles.", "illustration": "/illustrations/wt_decline_bench.jpg" },
    { "id": "wt_cable_crossover", "name": "Cable Crossover", "category": "Weights", "primary_muscle": "Chest", "equipment": "Cable", "instructions": "Pull cables together in a downward arching motion, crossing hands slightly to maximize contraction.", "illustration": "/illustrations/wt_cable_crossover.jpg" },
    { "id": "wt_deadlift", "name": "Deadlift", "category": "Weights", "primary_muscle": "Back", "equipment": "Barbell", "instructions": "Keep back flat and bar close to shins; drive through the heels to stand upright.", "illustration": "/illustrations/wt_deadlift.jpg" },
    { "id": "wt_lat_pulldown", "name": "Lat Pulldown", "category": "Weights", "primary_muscle": "Back", "equipment": "Machine", "instructions": "Pull the bar down to your upper chest while leaning back slightly and squeezing your lats.", "illustration": "/illustrations/wt_lat_pulldown.jpg" },
    { "id": "wt_seated_row", "name": "Seated Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Cable", "instructions": "Pull the handle toward your abdomen, keeping your back straight and shoulders down.", "illustration": "/illustrations/wt_seated_row.jpg" },
    { "id": "wt_bent_over_row", "name": "Bent Over Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Barbell", "instructions": "Hinge at hips, keep back parallel to floor, and pull the bar toward your lower ribs.", "illustration": "/illustrations/wt_bent_over_row.jpg" },
    { "id": "wt_one_arm_row", "name": "Single Arm Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Dumbbells", "instructions": "Place one hand on a bench for support and pull the dumbbell toward your hip with the other.", "illustration": "/illustrations/wt_one_arm_row.jpg" },
    { "id": "wt_pull_over", "name": "Dumbbell Pullover", "category": "Weights", "primary_muscle": "Back", "equipment": "Dumbbells", "instructions": "Lying on a bench, lower a dumbbell behind your head with slightly bent arms, then pull it back over your chest.", "illustration": "/illustrations/wt_pull_over.jpg" },
    { "id": "wt_t_bar_row", "name": "T-Bar Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Barbell", "instructions": "Straddle the bar and pull toward your chest, focusing on squeezing the middle back muscles.", "illustration": "/illustrations/wt_t_bar_row.jpg" },
    { "id": "wt_bicep_curl", "name": "Bicep Curl", "category": "Weights", "primary_muscle": "Arms", "equipment": "Dumbbells/Barbell", "instructions": "Keep elbows tucked to sides and curl weights toward shoulders without swinging your body.", "illustration": "/illustrations/wt_bicep_curl.jpg" },
    { "id": "wt_hammer_curl", "name": "Hammer Curl", "category": "Weights", "primary_muscle": "Arms", "equipment": "Dumbbells", "instructions": "Hold dumbbells with palms facing each other and curl to target the brachialis and forearm.", "illustration": "/illustrations/wt_hammer_curl.jpg" },
    { "id": "wt_preacher_curl", "name": "Preacher Curl", "category": "Weights", "primary_muscle": "Arms", "equipment": "Machine/Barbell", "instructions": "Use a preacher bench to isolate the biceps, ensuring a full range of motion at the bottom.", "illustration": "/illustrations/wt_preacher_curl.jpg" },
    { "id": "wt_tricep_pushdown", "name": "Tricep Pushdown", "category": "Weights", "primary_muscle": "Arms", "equipment": "Cable", "instructions": "Extend arms downward using a cable attachment, keeping elbows pinned to your ribs.", "illustration": "/illustrations/wt_tricep_pushdown.jpg" },
    { "id": "wt_overhead_ext", "name": "Overhead Tricep Extension", "category": "Weights", "primary_muscle": "Arms", "equipment": "Dumbbells/Cable", "instructions": "Hold weight behind your head and extend arms fully upward to target the long head of the tricep.", "illustration": "/illustrations/wt_overhead_ext.jpg" },
    { "id": "wt_skull_crusher", "name": "Skull Crusher", "category": "Weights", "primary_muscle": "Arms", "equipment": "Barbell", "instructions": "Lying down, lower the bar toward your forehead by bending only at the elbows, then extend.", "illustration": "/illustrations/wt_skull_crusher.jpg" },
    { "id": "wt_squat", "name": "Weighted Squat", "category": "Weights", "primary_muscle": "Legs", "equipment": "Barbell", "instructions": "Lower hips back and down until thighs are at least parallel to the floor, then drive up through heels.", "illustration": "/illustrations/wt_squat.jpg" },
    { "id": "wt_lunge", "name": "Weighted Lunge", "category": "Weights", "primary_muscle": "Legs", "equipment": "Dumbbells", "instructions": "Step forward and lower your back knee toward the ground, keeping your front knee aligned with your ankle.", "illustration": "/illustrations/wt_lunge.jpg" },
    { "id": "wt_leg_press", "name": "Leg Press", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine", "instructions": "Press the platform away using your legs, avoiding locking your knees at the top.", "illustration": "/illustrations/wt_leg_press.jpg" },
    { "id": "wt_leg_ext", "name": "Leg Extension", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine", "instructions": "Sit and extend legs fully to isolate the quadriceps; lower the weight under control.", "illustration": "/illustrations/wt_leg_ext.jpg" },
    { "id": "wt_leg_curl", "name": "Leg Curl", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine", "instructions": "Curl your legs toward your glutes to isolate the hamstrings; avoid arching your lower back.", "illustration": "/illustrations/wt_leg_curl.jpg" },
    { "id": "wt_calf_raise", "name": "Calf Raise", "category": "Weights", "primary_muscle": "Legs", "equipment": "Machine/Dumbbells", "instructions": "Raise your heels as high as possible, hold the squeeze, and lower slowly for a full stretch.", "illustration": "/illustrations/wt_calf_raise.jpg" },
    { "id": "wt_romanian_deadlift", "name": "Romanian Deadlift", "category": "Weights", "primary_muscle": "Legs", "equipment": "Barbell", "instructions": "Hinge at the hips with a slight knee bend; lower the bar until you feel a stretch in your hamstrings.", "illustration": "/illustrations/wt_romanian_deadlift.jpg" },
    { "id": "cal_pushup", "name": "Classic Push-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Chest", "equipment": "None", "instructions": "Maintain a straight plank position and lower your chest to the floor before pushing back up.", "illustration": "/illustrations/cal_pushup.jpg" },
    { "id": "cal_incline_pushup", "name": "Incline Push-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Chest", "equipment": "Bench/Elevated Surface", "instructions": "Place hands on an elevated surface; this version emphasizes the lower chest and is easier than flat pushups.", "illustration": "/illustrations/cal_incline_pushup.jpg" },
    { "id": "cal_decline_pushup", "name": "Decline Push-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Chest", "equipment": "Bench/Elevated Surface", "instructions": "Place feet on an elevated surface; this increases the weight on the upper chest and shoulders.", "illustration": "/illustrations/cal_decline_pushup.jpg" },
    { "id": "cal_wide_pushup", "name": "Wide Grip Push-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Chest", "equipment": "None", "instructions": "Set hands wider than shoulder-width to increase the focus on the outer pectoral muscles.", "illustration": "/illustrations/cal_wide_pushup.jpg" },
    { "id": "cal_diamond_pushup", "name": "Diamond Push-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Arms", "equipment": "None", "instructions": "Place hands together so index fingers and thumbs form a diamond; focuses heavily on the triceps.", "illustration": "/illustrations/cal_diamond_pushup.jpg" },
    { "id": "cal_dip", "name": "Tricep Dip", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Arms", "equipment": "Parallel Bars/Bench", "instructions": "Lower your body by bending elbows to 90 degrees, then push back up using your triceps.", "illustration": "/illustrations/cal_dip.jpg" },
    { "id": "cal_pullup", "name": "Pull-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Back", "equipment": "Pull-up Bar", "instructions": "With palms facing away, pull your chin over the bar using your back and arm strength.", "illustration": "/illustrations/cal_pullup.jpg" },
    { "id": "cal_chinup", "name": "Chin-up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Back", "equipment": "Pull-up Bar", "instructions": "With palms facing you, pull your chin over the bar; this targets the biceps more than a pullup.", "illustration": "/illustrations/cal_chinup.jpg" },
    { "id": "cal_inverted_row", "name": "Inverted Row", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Back", "equipment": "Low Bar", "instructions": "Hang under a bar and pull your chest toward it, keeping your body in a straight line.", "illustration": "/illustrations/cal_inverted_row.jpg" },
    { "id": "cal_squat", "name": "Bodyweight Squat", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Legs", "equipment": "None", "instructions": "Lower your hips as if sitting in a chair, keeping your chest up and weight on your heels.", "illustration": "/illustrations/cal_squat.jpg" },
    { "id": "cal_lunge", "name": "Bodyweight Lunge", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Legs", "equipment": "None", "instructions": "Step forward and lower your hips until both knees are bent at a 90-degree angle.", "illustration": "/illustrations/cal_lunge.jpg" },
    { "id": "cal_glute_bridge", "name": "Glute Bridge", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Legs", "equipment": "None", "instructions": "Lying on your back, lift your hips toward the ceiling by squeezing your glutes.", "illustration": "/illustrations/cal_glute_bridge.jpg" },
    { "id": "cal_calf_raise", "name": "Bodyweight Calf Raise", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Legs", "equipment": "None", "instructions": "Stand on the balls of your feet and lift your heels as high as possible.", "illustration": "/illustrations/cal_calf_raise.jpg" },
    { "id": "cal_leg_raise", "name": "Leg Raises", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "instructions": "Lying on your back, lift straight legs toward the ceiling and lower them slowly without touching the floor.", "illustration": "/illustrations/cal_leg_raise.jpg" },
    { "id": "cal_plank", "name": "Plank", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Hold a straight line from head to heels on your elbows, engaging your core and glutes.", "illustration": "/illustrations/cal_plank.jpg" },
    { "id": "cal_side_plank", "name": "Side Plank", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Balance on one forearm and the side of your foot, keeping your hips lifted and body straight.", "illustration": "/illustrations/cal_side_plank.jpg" },
    { "id": "cal_crunch", "name": "Abdominal Crunch", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "instructions": "Curl your shoulders toward your knees by contracting your abs; avoid pulling on your neck.", "illustration": "/illustrations/cal_crunch.jpg" },
    { "id": "cal_mtn_climber", "name": "Mountain Climbers", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "instructions": "In a plank position, drive your knees toward your chest in an alternating, running motion.", "illustration": "/illustrations/cal_mtn_climber.jpg" },
    { "id": "cal_burpee", "name": "Burpees", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Full Body", "equipment": "None", "instructions": "Drop into a pushup, jump your feet forward, and explosively jump into the air.", "illustration": "/illustrations/cal_burpee.jpg" },
    { "id": "cal_jumping_jack", "name": "Jumping Jacks", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Full Body", "equipment": "None", "instructions": "Jump while spreading legs and touching hands overhead, then return to a standing position.", "illustration": "/illustrations/cal_jumping_jack.jpg" },
    { "id": "cal_superman", "name": "Superman", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Back", "equipment": "None", "instructions": "Lying face down, lift your arms and legs off the ground simultaneously to strengthen the lower back.", "illustration": "/illustrations/cal_superman.jpg" },
    { "id": "cal_bear_crawl", "name": "Bear Crawl", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Full Body", "equipment": "None", "isDurationBased": true, "instructions": "Crawl forward on hands and toes, keeping your hips low and back flat.", "illustration": "/illustrations/cal_bear_crawl.jpg" },
    { "id": "cal_hollow_hold", "name": "Hollow Body Hold", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Press your lower back into the floor and lift your arms and legs slightly, holding a 'banana' shape.", "illustration": "/illustrations/cal_hollow_hold.jpg" },
    { "id": "cal_wall_sit", "name": "Wall Sit", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Legs", "equipment": "Wall", "isDurationBased": true, "instructions": "Leaning against a wall, lower your hips until your thighs are parallel to the floor and hold.", "illustration": "/illustrations/cal_wall_sit.jpg" },
    { "id": "cal_russian_twist", "name": "Russian Twist", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "instructions": "Sit with knees bent and feet elevated; rotate your torso to touch the floor on each side.", "illustration": "/illustrations/cal_russian_twist.jpg" },
    { "id": "cal_bicycle_crunch", "name": "Bicycle Crunch", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "instructions": "Bring opposite elbow toward opposite knee in a pedaling motion, engaging the obliques.", "illustration": "/illustrations/cal_bicycle_crunch.jpg" },
    { "id": "cal_v_up", "name": "V-Up", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "instructions": "Simultaneously lift your torso and legs to meet in a 'V' shape at the top.", "illustration": "/illustrations/cal_v_up.jpg" },
    { "id": "cal_flutter_kick", "name": "Flutter Kicks", "category": "Calisthenics", "isBodyweight": true, "primary_muscle": "Abs", "equipment": "None", "isDurationBased": true, "instructions": "Lying on your back, kick your legs up and down in small, rapid movements while keeping core tight.", "illustration": "/illustrations/cal_flutter_kick.jpg" },
    { "id": "cardio_run", "name": "Running", "category": "Cardio", "primary_muscle": "Cardio", "equipment": "None", "isDurationBased": true, "instructions": "Maintain a steady pace with upright posture and a mid-foot strike.", "illustration": "/illustrations/cardio_run.jpg" },
    { "id": "yoga_mtn", "name": "Tall Mountain Pose", "category": "Yoga", "primary_muscle": "Full Body", "isDurationBased": true, "instructions": "Stand tall with feet together, arms overhead, and reach for the sky while grounding your feet.", "illustration": "/illustrations/yoga_mtn.jpg" },
    { "id": "yoga_down_dog", "name": "Downward Dog", "category": "Yoga", "primary_muscle": "Full Body", "isDurationBased": true, "instructions": "Form an inverted 'V' shape with your body, pushing your hips back and pressing heels toward the floor.", "illustration": "/illustrations/yoga_down_dog.jpg" },
    { "id": "yoga_cat_cow", "name": "Cat-Cow", "category": "Yoga", "primary_muscle": "Back", "isDurationBased": true, "instructions": "Alternate between arching your back (Cat) and dropping your belly (Cow) while synchronized with breath.", "illustration": "/illustrations/yoga_cat_cow.jpg" },
    { "id": "yoga_cobra", "name": "Cobra Pose", "category": "Yoga", "primary_muscle": "Back", "isDurationBased": true, "instructions": "Lying face down, press your chest up while keeping your hips on the floor to stretch the core.", "illustration": "/illustrations/yoga_cobra.jpg" },
    { "id": "yoga_tree", "name": "Tree Pose", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Balance on one leg while placing the sole of the other foot on your inner calf or thigh.", "illustration": "/illustrations/yoga_tree.jpg" },
    { "id": "yoga_warrior2", "name": "Warrior II", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Step feet wide, bend front knee to 90 degrees, and extend arms parallel to the floor.", "illustration": "/illustrations/yoga_warrior2.jpg" },
    { "id": "yoga_fwd_fold", "name": "Forward Fold", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Hinge at your hips and reach for your toes, letting your head hang heavy to stretch the hamstrings.", "illustration": "/illustrations/yoga_fwd_fold.jpg" },
    { "id": "yoga_pigeon", "name": "Pigeon Pose", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "Bring one knee forward and fold the leg across your body while extending the other leg straight back.", "illustration": "/illustrations/yoga_pigeon.jpg" },
    { "id": "yoga_boat", "name": "Boat Pose", "category": "Yoga", "primary_muscle": "Abs", "isDurationBased": true, "instructions": "Balance on your sit bones with legs lifted and arms extended forward, forming a 'V' shape.", "illustration": "/illustrations/yoga_boat.jpg" },
    { "id": "yoga_child", "name": "Child's Pose", "category": "Yoga", "primary_muscle": "Recovery", "isDurationBased": true, "instructions": "Kneel and sit on your heels, then fold forward and rest your forehead on the floor.", "illustration": "/illustrations/yoga_child.jpg" },
    { "id": "yoga_corpse", "name": "Corpse Pose", "category": "Yoga", "primary_muscle": "Recovery", "isDurationBased": true, "instructions": "Lie flat on your back, palms up, and focus on deep breathing and total body relaxation.", "illustration": "/illustrations/yoga_corpse.jpg" },
    { "id": "yoga_triangle", "name": "Triangle Pose", "category": "Yoga", "primary_muscle": "Legs", "isDurationBased": true, "instructions": "With legs wide, reach one hand toward your foot while extending the other hand toward the ceiling.", "illustration": "/illustrations/yoga_triangle.jpg" },
    { "id": "wt_db_thruster_alt", "name": "Alternating Dumbbell Thruster", "category": "Weights", "primary_muscle": "Full Body", "equipment": "Dumbbells", "instructions": "Front squat with the dumbbells racked at your shoulders, then drive up and press one dumbbell overhead, alternating arms each rep.", "illustration": "/illustrations/wt_db_thruster_alt.jpg" },
    { "id": "wt_gorilla_row", "name": "Gorilla Row", "category": "Weights", "primary_muscle": "Back", "equipment": "Dumbbells", "instructions": "Take a wide stance, hinge at the hips with a flat back, and row one dumbbell to your hip while the other stays low, alternating sides.", "illustration": "/illustrations/wt_gorilla_row.jpg" },
    { "id": "wt_db_squat_clean", "name": "Dumbbell Squat Clean", "category": "Weights", "primary_muscle": "Full Body", "equipment": "Dumbbells", "instructions": "Hinge to bring the dumbbells to shin height, pull them explosively to your shoulders as you drop into a front squat, then stand tall.", "illustration": "/illustrations/wt_db_squat_clean.jpg" },
    { "id": "wt_v_up", "name": "Weighted V-Up", "category": "Weights", "primary_muscle": "Abs", "equipment": "Dumbbells", "instructions": "Lie flat holding one dumbbell at your chest, then lift your legs and torso together into a V, reaching the dumbbell toward your shins.", "illustration": "/illustrations/wt_v_up.jpg" },
    { "id": "wt_pushup_lunge", "name": "Dumbbell Push-up to Reverse Lunge", "category": "Weights", "primary_muscle": "Full Body", "equipment": "Dumbbells", "instructions": "Do a push-up gripping the dumbbells, step up to standing, lunge back on each leg, then return to the floor; one full cycle is one rep.", "illustration": "/illustrations/wt_pushup_lunge.jpg" },
    { "id": "wt_db_jack_press", "name": "Dumbbell Jumping Jack Press", "category": "Weights", "primary_muscle": "Shoulders", "equipment": "Dumbbells", "instructions": "Start with the dumbbells racked and feet together, then jump your feet wide as you press both dumbbells overhead, and jump back in as you lower.", "illustration": "/illustrations/wt_db_jack_press.jpg" }
];

const DEFAULT_EQUIPMENT_PROFILES = [
    {
        id: 'full_gym',
        name: 'Full Gym',
        description: 'Full commercial gym access',
        equipment: [
            'Barbell', 'Dumbbells', 'Cable', 'Machine',
            'Pull-up Bar', 'Bench/Elevated Surface',
            'Parallel Bars/Bench', 'Low Bar', 'Wall',
            'None'
        ]
    },
    {
        id: 'home_gym',
        name: 'Home Gym',
        description: 'Dumbbells, bench, and pull-up bar',
        equipment: [
            'Dumbbells', 'Bench/Elevated Surface',
            'Pull-up Bar', 'Low Bar', 'Wall', 'None'
        ]
    },
    {
        id: 'fire_station',
        name: 'Fire Station',
        description: 'Dumbbells and pull-up bar only',
        equipment: [
            'Dumbbells', 'Pull-up Bar',
            'Bench/Elevated Surface', 'Wall', 'None'
        ]
    },
    {
        id: 'bodyweight_only',
        name: 'Bodyweight Only',
        description: 'No equipment needed',
        equipment: [
            'None', 'Wall'
        ]
    },
    {
        id: 'custom',
        name: 'Custom',
        description: 'Your own equipment selection',
        equipment: [] // user-defined, populated in settings
    }
];

const DEFAULT_TEMPLATES = [
    {
        id: 'powerhouse',
        name: 'The Powerhouse',
        exercises: ['wt_deadlift', 'wt_flat_bench', 'wt_squat', 'wt_ohp', 'wt_lat_pulldown', 'cal_plank'],
        sets: 3,
        equipmentTier: 'full_gym',
        estimatedDuration: 55
    },
    {
        id: 'upper_blast',
        name: 'Upper Body Blast',
        exercises: ['wt_flat_bench', 'wt_lat_pulldown', 'wt_ohp', 'wt_bent_over_row', 'wt_tricep_pushdown', 'wt_bicep_curl'],
        sets: 3,
        equipmentTier: 'full_gym',
        estimatedDuration: 45
    },
    {
        id: 'leg_foundation',
        name: 'Leg Foundation',
        exercises: ['wt_squat', 'wt_leg_press', 'wt_romanian_deadlift', 'wt_leg_ext', 'wt_calf_raise'],
        sets: 3,
        equipmentTier: 'full_gym',
        estimatedDuration: 40
    },
    {
        id: 'pectoral_pump',
        name: 'The Pectoral Pump',
        exercises: ['wt_flat_bench', 'wt_incline_bench', 'wt_decline_bench', 'wt_chest_fly', 'wt_cable_crossover'],
        sets: 3,
        equipmentTier: 'full_gym',
        estimatedDuration: 45
    },
    {
        id: 'core_flow',
        name: 'Core & Flow',
        exercises: ['cal_plank', 'yoga_down_dog', 'yoga_warrior2', 'yoga_pigeon', 'yoga_boat', 'yoga_child'],
        sets: 3,
        equipmentTier: 'bodyweight_only',
        estimatedDuration: 30
    },
    {
        id: 'cardio_run_template',
        name: 'Running',
        exercises: ['cardio_run'],
        sets: 1,
        equipmentTier: 'bodyweight_only',
        estimatedDuration: 30
    },
    {
        // S30 — six video-sourced dumbbell movements. Rep targets are the top of
        // each prescribed range; weight is left unset so first use asks for it.
        id: 'dumbbell_full_body',
        name: 'Dumbbell Full Body',
        exercises: [
            { id: 'wt_db_thruster_alt', sets: [{ targetReps: 12 }, { targetReps: 12 }, { targetReps: 12 }, { targetReps: 12 }] },
            { id: 'wt_gorilla_row', sets: [{ targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 }] },
            { id: 'wt_db_squat_clean', sets: [{ targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 }] },
            { id: 'wt_v_up', sets: [{ targetReps: 20 }, { targetReps: 20 }, { targetReps: 20 }, { targetReps: 20 }] },
            { id: 'wt_pushup_lunge', sets: [{ targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 }] },
            { id: 'wt_db_jack_press', sets: [{ targetReps: 20 }, { targetReps: 20 }, { targetReps: 20 }, { targetReps: 20 }] }
        ],
        sets: 4,
        estimatedDuration: 40
    }
];

const getActiveEquipmentList = (
    profileId,
    profiles,
    customItems,
    sessionOverride
) => {
    if (sessionOverride !== null) return sessionOverride;
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return null; // null = no filter, show all
    if (profileId === 'custom') return customItems;
    return profile.equipment;
};

const isExerciseCompatible = (exercise, equipmentList) => {
    if (!equipmentList) return true; // no filter active
    if (!exercise.equipment) return true; // no equipment field

    // The equipment field overloads "/" as both an OR-separator
    // (e.g. "Barbell/Dumbbells") and as part of literal single names
    // (e.g. "Bench/Elevated Surface", "Parallel Bars/Bench"). Match the
    // full literal string first so multi-word names resolve correctly,
    // then fall back to the slash-split for genuine OR-lists.
    if (equipmentList.includes(exercise.equipment)) return true;

    const exerciseEquipment = exercise.equipment
        .split('/')
        .map(e => e.trim());

    // Compatible if ANY of the exercise equipment options
    // are in the active list
    return exerciseEquipment.some(eq =>
        equipmentList.includes(eq)
    );
};

// Safety lookup function to prevent "undefined" crashes
const getExerciseById = (id, masterList) => {
    const found = masterList.find(ex => ex.id === id);
    if (!found) {
        console.error(`Exercise ID ${id} not found in library.`);
        return { id: 'unknown', name: 'Exercise Missing', category: 'N/A' };
    }
    return found;
};

// Decide what a completed pull means for each locally-recorded deletion.
//
// Pure so it can be tested directly. Deliberately simple: since the server now
// records deletions by client_id (DELETE /by-client-id), the client no longer
// has to infer anything from an absent row. A tombstone here is only a local
// display guard, stopping a pull that was already in flight from re-adding a
// row the user just deleted.
//
//   serverItems  rows the pull returned (deleted ones are never included)
//   tombstones   [{ id, clientId }] recorded deletions
//   isOutstanding(key) whether this device still owes the server a delete
//
// Returns { retire, reissue }.
//   retire  — the server does not list it and we owe no delete for it, so the
//             guard has done its job.
//   reissue — the server still lists it. Only reachable for a row deleted
//             before this device knew its client_id; send the delete again.
//
// Ids and client ids are matched in SEPARATE namespaces: client_id is
// client-generated and could collide with another row's server UUID, and
// conflating them could target the wrong workout.
export const planTombstoneReconciliation = (serverItems, tombstones, isOutstanding) => {
    const byServerId = new Map();
    const byClientId = new Map();
    (serverItems || []).forEach(w => {
        if (w.id) byServerId.set(w.id, w);
        if (w.client_id) byClientId.set(w.client_id, w);
    });

    const retire = [];
    const reissue = [];
    (tombstones || []).forEach(t => {
        const onServer = (t.clientId && byClientId.get(t.clientId))
            || (t.id && byServerId.get(t.id))
            || null;
        if (onServer) {
            reissue.push({ tombstone: t, serverRow: onServer });
        } else if (!isOutstanding(t.clientId || t.id)) {
            retire.push(t);
        }
    });
    return { retire, reissue };
};

// Every workout that leaves this device must carry a stable client_id.
//
// Without one the server cannot recognise a re-upload: PostgreSQL treats
// NULLs as distinct under (user_id, client_id), so the row inserts fresh and
// undoes a deletion — and because saveWorkout does not send the local id
// either, the new server id can never be matched back. Legacy and restored
// rows are the ones that lack it, so they are stamped here, in place, before
// anything is uploaded. Returns the (possibly updated) workout.
export const ensureWorkoutClientId = (workout) => {
    if (!workout) return workout;
    if (workout.client_id) return workout;
    const id = (globalThis.crypto?.randomUUID?.()
        || `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    return { ...workout, client_id: id };
};

// (resolveWorkoutBackendId removed with the redesign. Deleting no longer needs
// to find a server row first — the server accepts a deletion for a client_id
// it has never seen — so the whole "which row is this?" problem, and the
// unsafe inference that a successful-but-empty lookup proved absence, are
// gone rather than guarded.)

// Which identifier a deletion is recorded against. Returns exactly one of
// { clientId } or { backendId } — never both, never neither.
//
//   has client_id           -> by client id, whether or not it has been uploaded
//   no client_id, on server -> by SERVER id. The row carries client_id NULL, so
//                              a minted id would name nothing and the
//                              placeholder could never collide with it.
//   no client_id, local     -> mint one; the server accepts a deletion for an
//                              identifier it has never seen.
// Map a server row into the local history shape. Module scope so the tests
// exercise THIS function rather than a hand-built row that happens to agree
// with it — a reconstruction cannot catch a field the real mapper drops, and
// dropping backendId here is exactly the bug that got through review once.
export const mapServerWorkout = (w) => ({
    id: w.id,
    // This row came FROM the server, so record that positively. Without it a
    // pulled legacy row (client_id NULL) is indistinguishable from a
    // never-uploaded local one — local ids are UUIDs too — and deleting it
    // would mint an identifier that names nothing while the real row lived on.
    backendId: w.id,
    // Keep client_id: without it, any re-push of a pulled workout (e.g.
    // syncToApi's history[0] push) bypasses the backend's client_id
    // idempotency and duplicates the row server-side on every boot.
    client_id: w.client_id || null,
    name: w.name,
    startTime: w.start_time,
    endTime: w.end_time,
    status: w.status || 'completed',
    completed: w.status === 'completed',
    notes: w.notes || '',
    exercises: w.exercises || [],
    recommendations: w.recommendations || [],
});

// The queue op that deletes a server row we have positively identified.
//
// Only what the SERVER reports is used. An earlier version fell back to the
// tombstone's clientId: when the server row's client_id is NULL that id is one
// we minted locally, it names no row, and reissuing it repeated an ineffective
// delete for ever while the real row stayed live.
export const deletionOpFor = (serverRow, uid) => {
    const cid = serverRow.client_id || null;
    return {
        type: 'workout_delete',
        key: cid || serverRow.id,
        payload: cid ? { client_id: cid } : { backendId: serverRow.id },
        uid,
    };
};

// May this locally-held row, absent from the pull, be re-uploaded by the
// backfill? No, if it carries a backendId.
//
// This is a SKIP, and deliberately nothing more. An earlier version also
// deleted the local copy and wrote a tombstone, which was a destructive bug:
// `getHistory` pages with a moving OFFSET over the live rows, so a concurrent
// delete on another device shifts the window and a still-LIVE row can be
// skipped even though every request succeeded. That fabricated tombstone was
// then read back as user intent, and reconciliation deleted the live workout
// on the server. Absence across a non-atomic page walk proves nothing.
//
// Skipping is safe under the same uncertainty: not re-uploading a row leaves
// both copies exactly as they are. It exists because the backfill uploads
// whatever is local-and-absent, and for a legacy row (client_id NULL) that
// upload is unrecognisable to the server — it returns as a brand-new workout
// that no future deletion can catch.
export const wasDeletedOnServer = (workout) => Boolean(workout?.backendId);

// What the login backfill should do with a locally-held row the pull did not
// return. Absence is never by itself evidence of anything: a moving-OFFSET page
// walk can skip a still-live row, so "not in this result" does not even
// establish that the row is gone, let alone why.
//
//   'skip-known-to-server' — it carries a backendId, so the server has seen it.
//        We cannot tell from absence whether it was deleted elsewhere or merely
//        missed by this walk, and re-uploading would undo a deletion in the
//        first case. Skipping is correct under both.
//   'upload' — it carries a stable client_id. The safe property is NOT that
//        this device created it (a pulled row carries another device's
//        client_id): it is that re-uploading under a stable id is idempotent,
//        so if the server holds a deletion for that id the upload collides with
//        it and comes back marked deleted rather than resurrecting anything.
//   'skip-ambiguous' — NEITHER identifier. The old mapper stored pulled rows
//        without a backendId, so this may well be a server row another device
//        has since deleted; a restored backup looks the same. Minting an id and
//        uploading would make the resurrection permanent, because a fresh id
//        collides with nothing. Keep it locally and wait for a pull to identify
//        it — enrichment adopts real identity on a positive match, after which
//        it becomes uploadable and deletable normally.
//
// The trade is deliberate: an ambiguous row that genuinely was local-only stays
// un-synced, and the user still has it on the device. The alternative loses the
// argument — it makes deleted workouts come back.
export const backfillDisposition = (workout) => {
    if (workout?.backendId) return 'skip-known-to-server';
    if (workout?.client_id) return 'upload';
    return 'skip-ambiguous';
};

// Deletion targets a row only by an identifier something actually recorded:
// the client id the creating device stamped, or the server id the server
// returned. There is no third source. A row carrying neither is deleted
// locally and nothing is claimed about the cloud.
//
// Two earlier attempts tried to manufacture the missing identifier, and both
// were destructive:
//
//   - Minting a fresh client id named nothing the server had ever seen, so the
//     placeholder deletion succeeded while the real row stayed live — and the
//     guard was then retired on that false confirmation.
//   - Treating a UUID-shaped local id as the server id was false at the root.
//     `generateId` already returned crypto.randomUUID() BEFORE commit 8b88b49,
//     which is the commit that first wrote client_id and backendId at all. So a
//     row finished before then has a UUID local id L that is unrelated to its
//     server row's id S. DELETE /L answers 404, the client reads 404 as
//     success, the guard retires, and S returns on the next pull.
//
// Content matching cannot substitute either, on the client or on the server:
// counting candidates establishes how many rows look alike, never that a
// candidate IS this row. See docs/skills/provider-level-testing.md.
// A legacy queued upload succeeds and the server answers with the identity it
// stamped. Without this, that answer is thrown away and the local row stays
// identifierless FOREVER: `matchFor` cannot join it to the server row (the ids
// differ), the new-item fingerprint filter hides the server row while the local
// one exists, so nothing ever hints at the split — and every later Delete takes
// the local-only branch and reports success while the cloud row survives.
//
// The correlation is positive, not inferred: the queue operation IS the link.
// `op.payload.id` named the row when the upload was queued, and `saved` is that
// exact request's response. This is the same write-back the `assessment` and
// `template` executors already do; `workout` was the one that did not.
//
// Every guard below is fail-closed, because writing identity onto the WRONG row
// would make a later delete remove someone's other workout:
//   - legacy operations only; a payload that already carries a client_id is
//     identified and needs nothing
//   - `op.key === op.payload.id` and a non-empty `op.uid`, so a rewritten or
//     cross-profile entry is refused
//   - `saved.client_id === String(saved.id)` proves the response came through
//     the server's stamp path rather than carrying some other identifier
//   - EXACTLY ONE local row may match, and it must still lack both identifiers.
//     Not ceremony: SyncQueue's dedupe is not uid-aware and imported storage can
//     duplicate an id, so zero-or-many is a real state and the answer is to do
//     nothing rather than guess.
//
// Returns the updated history array, or null to mean "do not write".
export const planStampedIdentityAdoption = (op, saved, storedHistory) => {
    if (!op?.uid || op?.payload?.client_id) return null;
    const localId = op?.payload?.id;
    if (!localId || op.key !== localId) return null;
    if (!saved?.id || !saved?.client_id) return null;
    if (String(saved.client_id) !== String(saved.id)) return null;

    const history = Array.isArray(storedHistory) ? storedHistory : [];
    const matches = history.filter(
        w => w?.id === localId && !w?.client_id && !w?.backendId
    );
    if (matches.length !== 1) return null;

    return history.map(w =>
        w === matches[0]
            ? { ...w, client_id: saved.client_id, backendId: saved.id }
            : w
    );
};

export const chooseDeletionTarget = (workout) => {
    if (workout?.client_id) return { clientId: workout.client_id, backendId: null };
    if (workout?.backendId) return { clientId: null, backendId: workout.backendId };
    return { clientId: null, backendId: null, localOnly: true };
};

export const WorkoutProvider = ({ children, timerApiRef }) => {
    // Shared Data
    const [exercises, setExercises] = useState(DEFAULT_EXERCISES);
    const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);

    // Side-effect removed for stability





    // Load custom templates on mount and merge
    // MOVED TO refreshProfileData for profile scoping

    // Profile State
    const [profiles, setProfiles] = useState([]);
    const [currentProfile, setCurrentProfile] = useState(() => {
        try {
            const profiles = StorageService.loadProfiles();
            const lastId = StorageService.loadCurrentProfileId();
            if (profiles.length > 0 && !StorageService.isLoggedOut()) {
                const found = profiles.find(p => p.id === lastId);
                return found || profiles[0];
            }
            return null;
        } catch (e) {
            return null;
        }
    });
    const [authChecked, setAuthChecked] = useState(false);

    // Single gate for best-effort backend settings sync: backend-authenticated,
    // with an API configured. currentProfile.email is populated only for cloud/
    // OAuth users — local profiles created via createProfile have a non-default
    // id but no email, so gating on email (not id !== 'user_default') prevents
    // doomed 401 syncs for unauthenticated local profiles. useCallback so it's a
    // stable reference for the persist-effect deps and the TimerProvider prop.
    const canSyncToBackend = useCallback(() =>
        !!(authChecked &&
           currentProfile &&
           currentProfile.email &&
           ApiService.isAvailable()),
    [authChecked, currentProfile]);

    // Latest-value ref so the persist effects can call the guard WITHOUT listing
    // it as a dependency — otherwise the auth-resolved flip of canSyncToBackend
    // would re-run every persist effect and fire a redundant sync on page load.
    const canSyncRef = useRef(canSyncToBackend);
    canSyncRef.current = canSyncToBackend;

    // The server told us this workout is deleted (it returns retained rows
    // marked with deleted_at). Drop the local copy and tombstone it so the
    // backfill does not immediately offer it again. setHistory is stable, so
    // this is safe to call from the []-deps executor effect below.
    const dropLocallyAsDeleted = useCallback((uid, serverRow) => {
        if (!uid) return;
        const matches = (w) => (
            (serverRow.client_id && w.client_id === serverRow.client_id)
            || w.id === serverRow.id
            || w.backendId === serverRow.id
        );
        StorageService.addDeletedWorkout(uid, {
            id: serverRow.id,
            clientId: serverRow.client_id || null,
        });
        // Always edit the STORED history for uid. A queued op can resolve
        // after the user has switched profiles, and React state then belongs
        // to someone else — filtering it would remove the wrong person's row
        // and leave the real one on disk, visible again when they return.
        const stored = StorageService.loadHistory
            ? StorageService.loadHistory(uid)
            : (StorageService.loadProfileState(uid).history || []);
        const pruned = stored.filter(w => !matches(w));
        if (pruned.length !== stored.length) StorageService.saveHistory(uid, pruned);
        // Only touch React state when uid is the profile actually on screen.
        if (latestProfileIdRef.current === uid) {
            setHistory(prev => prev.filter(w => !matches(w)));
        }
    }, []);

    // Persist the adoption planned above. Storage first, React second and only
    // while that profile is still on screen — this resolves long after the
    // request and the user may have switched profiles, and an unscoped
    // setHistory would write one profile's identity onto another's list. Same
    // ownership rule as dropLocallyAsDeleted and dropOwned.
    const adoptStampedIdentity = useCallback((op, saved) => {
        const stored = StorageService.loadProfileState(op?.uid).history || [];
        const updated = planStampedIdentityAdoption(op, saved, stored);
        if (!updated) return;
        if (!StorageService.saveHistory(op.uid, updated)) {
            // Nothing durable was written, so leave React alone: showing an
            // identity that reload discards is worse than showing none.
            console.warn('[workout-sync] identity write-back failed; not adopted');
            return;
        }
        // Apply to React through a FUNCTIONAL update re-planned against current
        // state, not by assigning the storage snapshot. The snapshot was read
        // before the request resolved, so assigning it would drop any row added
        // in between — replacing the whole visible list with stale data. Running
        // the same planner over `prev` also re-checks every guard against what
        // React actually holds, and returns `prev` untouched if it no longer
        // qualifies.
        if (latestProfileIdRef.current === op.uid) {
            setHistory(prev => planStampedIdentityAdoption(op, saved, prev) || prev);
        }
    }, []);

    // A template created on this device gets its server id back asynchronously.
    // Write it to the ORIGINATING profile's storage first, then into provider
    // state only while that profile is still on screen — the same ownership
    // gate as adoptStampedIdentity above. Before S32 the id reached storage
    // only, so the next in-place save read a provider object with no
    // backendId, overwrote the stored row without it, and POSTed a second
    // cloud row (docs/template_exercise_removal_spec_s32.md, decision D).
    const adoptTemplateBackendId = useCallback((uid, localId, backendId) => {
        if (!uid || !localId || !backendId) return;
        const stored = StorageService.loadCustomTemplates(uid);
        const idx = stored.findIndex(t => t.id === localId);
        if (idx !== -1) {
            stored[idx].backendId = backendId;
            StorageService.saveCustomTemplates(uid, stored);
        }
        if (latestProfileIdRef.current === uid) {
            setTemplates(prev => prev.map(t =>
                (t.id === localId && t.isCustom && !t.backendId) ? { ...t, backendId } : t
            ));
        }
    }, []);
    // Create requests still in flight, by profile + local template id.
    // writeTemplate consults this so any saves that land before the create
    // settles coalesce into one PUT of the latest payload instead of issuing
    // a second POST (decision D-ii).
    const pendingTemplateCreatesRef = useRef(new Map());
    const templateCreateKey = (uid, localId) => `${uid}:${localId}`;
    const trackTemplateCreate = (uid, localId, promise) => {
        const key = templateCreateKey(uid, localId);
        const record = { promise, latestTemplate: null, updateScheduled: false };
        pendingTemplateCreatesRef.current.set(key, record);
        promise.finally(() => {
            if (pendingTemplateCreatesRef.current.get(key) === record) {
                pendingTemplateCreatesRef.current.delete(key);
            }
        }).catch(() => {});
        return promise;
    };

    // Retry queue for failed cloud pushes. Executors are registered here (the
    // one place with access to both ApiService and StorageService) and the
    // queue's flush triggers (online / foreground / boot) are installed once.
    useEffect(() => {
        SyncQueue.registerExecutor('workout', async op => {
            const saved = await ApiService.saveWorkout(op.payload);
            // The server retains deleted rows and returns them marked, so a
            // re-upload of something deleted elsewhere comes back with
            // deleted_at. The list hides deleted rows, so this response is
            // the ONLY way a stale device — or one restored from a
            // pre-deletion backup — learns to drop its copy. Ignoring it left
            // the workout visible locally and re-offered on every boot.
            if (saved?.deleted_at) dropLocallyAsDeleted(op.uid, saved);
            else adoptStampedIdentity(op, saved);
            return saved;
        });
        SyncQueue.registerExecutor('weight', op =>
            ApiService.addWeightEntry(op.payload.weight, op.payload.date));
        SyncQueue.registerExecutor('assessment', async op => {
            const resp = await ApiService.saveAssessment(op.payload);
            if (resp?.id && op.uid) {
                const stored = StorageService.loadAssessments(op.uid);
                const idx = stored.findIndex(item => item.id === op.payload.id);
                if (idx !== -1) {
                    stored[idx].backendId = resp.id;
                    StorageService.saveAssessments(op.uid, stored);
                }
            }
        });
        SyncQueue.registerExecutor('profile_settings', op => ApiService.saveProfile(op.payload));
        SyncQueue.registerExecutor('template', async op => {
            const resp = await ApiService.saveCustomTemplate(op.payload);
            // Same backendId adoption as the direct push path — storage AND
            // provider state — so a replayed template can be updated in place,
            // deleted or deduped later.
            if (resp?.id && op.uid) adoptTemplateBackendId(op.uid, op.payload.id, resp.id);
        });
        // In-place template overwrite replay. A 404 (template deleted
        // server-side) is a non-auth 4xx → dead-letter, which is correct.
        SyncQueue.registerExecutor('template_update', op =>
            ApiService.updateCustomTemplate(op.payload.backendId, op.payload));
        SyncQueue.registerExecutor('exercise', async op => {
            const resp = await ApiService.saveCustomExercise(op.payload);
            if (resp?.id && op.uid) {
                const stored = StorageService.loadCustomExercises(op.uid);
                const idx = stored.findIndex(e => e.id === op.payload.id);
                if (idx !== -1) {
                    stored[idx].backendId = resp.id;
                    StorageService.saveCustomExercises(op.uid, stored);
                }
            }
        });
        // Food log creates are idempotent server-side (client_id unique per
        // user), so replays can never duplicate rows. No storage write-back:
        // the foodLog persist effect would clobber it — backendId adoption
        // happens in the login pull-merge instead (matched by client_id).
        SyncQueue.registerExecutor('food_log', op => ApiService.createFoodLog(op.payload));
        // Updates/deletes may target rows created offline whose backend UUID
        // was never seen locally — resolve it by client_id via the list
        // endpoint. Queue order guarantees the pending create flushes first.
        const resolveFoodBackendId = async (payload) => {
            if (payload.backendId) return payload.backendId;
            if (!payload.client_id) return null;
            // Resolve against complete durable history so an old offline row
            // can still be edited or deleted after a later reconnect.
            const rows = await ApiService.getFoodLog(new Date(0).toISOString());
            return rows.find(r => r.client_id === payload.client_id)?.id || null;
        };
        SyncQueue.registerExecutor('food_log_update', async op => {
            const backendId = await resolveFoodBackendId(op.payload);
            // No backend row (create was dropped/never queued): nothing to
            // update — resolve as success so the op doesn't retry forever.
            if (backendId) await ApiService.updateFoodLog(backendId, op.payload);
        });
        SyncQueue.registerExecutor('food_log_delete', async op => {
            const backendId = await resolveFoodBackendId(op.payload);
            if (backendId) await ApiService.deleteFoodLog(backendId);
        });
        SyncQueue.registerExecutor('workout_delete', async op => {
            // No lookup: the server records a deletion by client_id whether or
            // not the workout has arrived. Only a real HTTP failure throws, so
            // the op is retried rather than acknowledged on a guess.
            if (op.payload?.client_id) {
                await ApiService.deleteWorkoutByClientId(op.payload.client_id);
            } else if (op.payload?.backendId) {
                await ApiService.deleteWorkout(op.payload.backendId);
            } else {
                // Never fall through silently. A resolved executor is treated
                // as success and the op is dropped, so an unhandled shape here
                // would discard a deletion without contacting the server at
                // all. Throwing keeps it queued and visible instead.
                throw new Error(
                    `[workout_delete] unusable payload, no identifier: ${JSON.stringify(op.payload)}`
                );
            }
        });
        SyncQueue.init();
        // dropLocallyAsDeleted is a []-deps useCallback, so it is stable and
        // listing it does not re-register the executors.
    }, [adoptStampedIdentity, adoptTemplateBackendId, dropLocallyAsDeleted]);

    // User-Specific State (Reset when profile changes)
    const [activeWorkout, setActiveWorkout] = useState(null);
    const [history, setHistory] = useState([]);
    // Profile id whose stored history has been rehydrated into state — gates
    // the history persist effect so pre-restore runs can't wipe storage.
    const [historyHydratedFor, setHistoryHydratedFor] = useState(null);
    // Same gate for the active-workout persist effect. The previous mount-ref
    // guard fails under StrictMode replay (the replayed effect run consumes
    // the guard before the restore commit), wiping an in-progress/paused
    // session on reload — same hole 8b30633 closed for history.
    const [activeWorkoutHydratedFor, setActiveWorkoutHydratedFor] = useState(null);
    // Same gate for the remaining settings/stats/equipment persist effects —
    // one flag covers them all because refreshProfileData restores every one
    // of these values in the same synchronous batch (S13 mount-ref sweep).
    const [settingsHydratedFor, setSettingsHydratedFor] = useState(null);
    const [assessments, setAssessments] = useState([]); // NEW: Assessment History
    const [theme, setTheme] = useState('dark');
    const [units, setUnits] = useState('metric');
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [activeEquipmentProfileId, setActiveEquipmentProfileId] = useState('full_gym');
    const [customEquipmentItems, setCustomEquipmentItems] = useState([]);
    const [equipmentEnvironments, setEquipmentEnvironments] = useState([]);
    const [sessionEquipmentOverride, setSessionEquipmentOverride] = useState(null); // null = use saved profile, array = temp override
    const equipmentEnvironmentsEditedRef = useRef(false);
    const [coachPersonality, setCoachPersonality] = useState(DEFAULT_PERSONALITY);
    const [coachVoiceId, setCoachVoiceId] = useState(DEFAULT_VOICE_ID);
    // Coach depth calibration ('beginner'|'intermediate'|'advanced') — set by
    // Assessment completion or Settings; syncs like theme/units (S16 spec).
    const [experienceLevel, setExperienceLevel] = useState('intermediate');
    const [userStats, setUserStats] = useState({
        age: '',
        dateOfBirth: '',
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
    // Nutrition entries, local-first like weightHistory. Entries use the
    // backend's snake_case field names (logged_at, protein_g, ...) plus
    // id/client_id/backendId — see addFoodLogEntry.
    const [foodLog, setFoodLog] = useState([]);

    // Smart Progression Settings
    const [smartProgressionEnabled, setSmartProgressionEnabled] = useState(false); // Master Toggle
    const [progressionMode, setProgressionMode] = useState('linear'); // 'linear' | 'double'
    const [progressionType, setProgressionType] = useState('fixed'); // 'fixed' | 'percentage'
    const [progressionIncrement, setProgressionIncrement] = useState(5); // Value (e.g., 5lbs or 2.5%)

    // Guided Mode State
    const [currentExerciseIndex, _setCurrentExerciseIndex] = useState(0);
    const [currentSetIndex, _setCurrentSetIndex] = useState(0);

    // Wrapper to persist index changes
    const setCurrentExerciseIndex = (index) => {
        _setCurrentExerciseIndex(index);
        if (activeWorkout) {
            setActiveWorkout(prev => prev ? { ...prev, currentExerciseIndex: index } : prev);
        }
    };

    const setCurrentSetIndex = (index) => {
        _setCurrentSetIndex(index);
        if (activeWorkout) {
            setActiveWorkout(prev => prev ? { ...prev, currentSetIndex: index } : prev);
        }
    };



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
        refreshGlobalState();


    }, []);

    // --- 1b. CLOUD AUTH CHECK (HttpOnly cookie session) ---
    useEffect(() => {
        // Check if user has a valid cloud session
        // (HttpOnly cookie set by Google OAuth)
        // Safety net: never leave the UI gated on a hung getMe() — if the cloud
        // check hasn't settled in 8s, unblock with the localStorage profile.
        const authTimeout = setTimeout(() => setAuthChecked(true), 8000);

        const checkCloudAuth = async () => {
            try {
                const user = await ApiService.getMe();
                if (user && user.id) {
                    // Build profile from server response
                    const cloudProfile = {
                        id: user.id,
                        name: user.name,
                        color: user.color || '#ff5c2a',
                        avatar: user.avatar ||
                            (user.name ? user.name[0].toUpperCase() : 'U'),
                        email: user.email
                    };
                    // Only set if not already set or different user
                    if (!currentProfile ||
                        currentProfile.id !== cloudProfile.id) {
                        setCurrentProfile(cloudProfile);
                        StorageService.saveProfiles([cloudProfile]);
                        StorageService.saveCurrentProfileId(cloudProfile.id);
                        StorageService.clearLoggedOut();
                    } else if (['name', 'color', 'avatar', 'email']
                        .some(f => currentProfile[f] !== cloudProfile[f])) {
                        // Same user: server wins for its owned fields, so a
                        // server-side change (e.g. the S21 #bfff00→#ff5c2a
                        // color backfill) reaches devices that cached their
                        // profile before it. Skipped entirely when nothing
                        // differs — no needless re-render on every boot.
                        const refreshed = { ...currentProfile, ...cloudProfile };
                        setCurrentProfile(refreshed);
                        StorageService.saveProfiles([refreshed]);
                    }
                    // Session confirmed valid — clear any stale expiry banner
                    // and replay pushes that failed while auth was down.
                    SyncQueue.clearAuthExpired();
                    SyncQueue.flush();
                }
            } catch (e) {
                // No cloud session — localStorage profile takes over.
                // This is the normal offline path.
            } finally {
                clearTimeout(authTimeout);
                setAuthChecked(true);
            }
        };

        checkCloudAuth();

        return () => clearTimeout(authTimeout);
    }, []); // Run once on mount

    // --- 2. LOAD USER DATA WHEN PROFILE CHANGES ---
    // Tracks the profile whose load is currently active, so an in-flight cloud
    // pull can detect a profile switch and avoid cross-writing the wrong state.
    const latestProfileIdRef = useRef(null);
    // Orders pulls for the SAME profile. latestProfileIdRef cannot: it only
    // says which profile is current, so two overlapping pulls for one profile
    // both pass it and the slower one overwrites the newer result.
    const pullGenerationRef = useRef(0);
    // Profiles already backfilled this app boot — see the backfill block below.
    const backfilledProfilesRef = useRef(new Set());

    const refreshProfileData = (profile) => {
        if (!profile) return;
        latestProfileIdRef.current = profile.id;
        const pullGeneration = ++pullGenerationRef.current;
        equipmentEnvironmentsEditedRef.current = false;

        // Remember this user
        StorageService.saveCurrentProfileId(profile.id);

        const uid = profile.id;

        const ps = StorageService.loadProfileScopedState(uid);

        setHistory(ps.history);
        // Same-batch flag: unlocks the history persist effect only for commits
        // at or after this restore (see the hydration-gated effect below).
        setHistoryHydratedFor(uid);
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
        // Same-batch flag: unlocks the active-workout persist effect only for
        // commits at or after this restore (mirrors historyHydratedFor above).
        setActiveWorkoutHydratedFor(uid);

        setTheme(ps.theme);
        setUnits(ps.units);
        setSoundEnabled(ps.soundEnabled);
        setExperienceLevel(ps.experienceLevel || 'intermediate');

        setActiveEquipmentProfileId(ps.equipmentProfileId || 'full_gym');
        setCustomEquipmentItems(ps.customEquipmentItems || []);
        setEquipmentEnvironments(normalizeEquipmentEnvironments(ps.equipmentEnvironments));
        setSessionEquipmentOverride(null);

        setUserStats(ps.userStats);
        setWeightHistory(ps.weightHistory);
        // Same-batch restore as weightHistory — the foodLog persist effect is
        // gated on settingsHydratedFor, which is set at the end of this batch.
        setFoodLog(ps.foodLog || []);

        // Coach prefs are global-keyed (not profile-scoped) and were previously
        // never hydrated into context state — the boot defaults sat in state
        // until a cloud pull or user edit. Hydrate them here so the (now
        // hydration-gated) coach persist effects can never write the boot
        // defaults over a stored value.
        setCoachPersonality(StorageService.loadCoachPersonality());
        setCoachVoiceId(StorageService.loadCoachVoiceId());

        // Load Templates Scoped to User
        const userTemplates = StorageService.loadCustomTemplates(uid);
        // Reset to Defaults + User Custom
        // Use Set to prevent duplicates if any weird merging happens (though simply replacing is safer)
        setTemplates([...DEFAULT_TEMPLATES, ...userTemplates]);

        // Same-batch flag: unlocks the settings/stats/equipment persist
        // effects only for commits at or after this restore (mirrors
        // historyHydratedFor / activeWorkoutHydratedFor above).
        setSettingsHydratedFor(uid);

        // --- CLOUD PULL (Google OAuth users only) ---
        // profile.email is only set on cloud profiles built from GET /api/auth/me.
        // Fire-and-forget: localStorage is already loaded above, so a failed or
        // slow pull never blocks the UI. Backend reads are authenticated by the
        // session cookie (apiFetch sends credentials:'include').
        if (profile.email && ApiService.isAvailable()) {
            (async () => {
                try {
                    const results = await Promise.allSettled([
                        ApiService.getProfile(),
                        ApiService.getHistory(),
                        ApiService.getWeightHistory(),
                        ApiService.getCustomTemplates(),
                        ApiService.getCustomExercises(),
                        // Pull the complete durable food history. The former
                        // 90-day window made older cloud entries invisible on
                        // a new device even though the backend retained them.
                        ApiService.getFoodLog(new Date(0).toISOString()),
                        ApiService.getAssessments()
                    ]);
                    results.forEach((result, i) => {
                        if (result.status === 'rejected') {
                            console.warn(`Cloud pull [${i}] failed:`, result.reason);
                        }
                    });
                    const [profileData, workoutData, weightData, templateData, exerciseData, foodData, assessmentData] =
                        results.map(r => r.status === 'fulfilled' ? r.value : null);

                    // The user may have switched profiles while these were in flight.
                    // Abandon the results rather than write them into another profile.
                    if (latestProfileIdRef.current !== profile.id) return;

                    // A NEWER pull for this same profile may also have finished
                    // first. Profile identity does not order requests, and
                    // applying an older result on top of a newer one resurrects
                    // whatever changed in between: a pull that started before a
                    // deletion still carries the row, and if a later pull has
                    // already retired that deletion's guard, this one puts the
                    // workout back into state and storage. The server stays
                    // correct; the UI does not. Newest result wins.
                    if (pullGeneration !== pullGenerationRef.current) return;

                    // Profile stats — backend wins (most recently saved from any device)
                    if (profileData?.stats) {
                        const s = profileData.stats;
                        const backendStats = {
                            age: s.age || '',
                            dateOfBirth: s.date_of_birth || '',
                            height: s.height || '',
                            currentWeight: s.current_weight || '',
                            targetWeight: s.target_weight || '',
                            goal: s.goal || 'maintenance',
                            motivation: s.motivation || '',
                            bodyFat: s.body_fat || '',
                            muscleMass: s.muscle_mass || '',
                            boneDensity: s.bone_density || ''
                        };
                        setUserStats(backendStats);
                        StorageService.saveUserStats(profile.id, backendStats);
                    }

                    // Coach prefs — backend wins on login (same pattern as stats)
                    if (profileData?.user) {
                        const u = profileData.user;
                        if (u.coach_personality) {
                            setCoachPersonality(u.coach_personality);
                            StorageService.saveCoachPersonality(u.coach_personality);
                        }
                        if (u.coach_voice_id) {
                            setCoachVoiceId(u.coach_voice_id);
                            StorageService.saveCoachVoiceId(u.coach_voice_id);
                        }
                        // App settings — backend wins on login (same pattern).
                        // Fields are null until the user first syncs them, so
                        // only apply values that actually exist server-side.
                        if (u.theme) {
                            setTheme(u.theme);
                            StorageService.saveTheme(profile.id, u.theme);
                        }
                        if (u.units) {
                            setUnits(u.units);
                            StorageService.saveUnits(profile.id, u.units);
                        }
                        if (typeof u.sound_enabled === 'boolean') {
                            setSoundEnabled(u.sound_enabled);
                            StorageService.saveSound(profile.id, u.sound_enabled);
                        }
                        if (u.experience_level) {
                            setExperienceLevel(u.experience_level);
                            StorageService.saveExperienceLevel(profile.id, u.experience_level);
                        }
                        const localEnvironments = StorageService.loadProfileState(
                            profile.id
                        ).equipmentEnvironments;
                        const equipmentResolution = resolveEquipmentEnvironmentHydration({
                            cloud: u.equipment_environments,
                            local: localEnvironments,
                            edited: equipmentEnvironmentsEditedRef.current,
                        });
                        setEquipmentEnvironments(equipmentResolution.environments);
                        StorageService.saveEquipmentEnvironments(
                            profile.id, equipmentResolution.environments
                        );
                        if (equipmentResolution.shouldBackfill) {
                            ApiService.saveProfile({
                                equipment_environments: equipmentResolution.environments,
                            }).catch(err => {
                                console.warn('[settings-sync] equipment_environments backfill:', err);
                                SyncQueue.enqueue({
                                    type: 'profile_settings',
                                    key: 'equipment_environments',
                                    payload: {
                                        equipment_environments: equipmentResolution.environments,
                                    },
                                });
                            });
                        }
                        // Timers are pushed as a pair, so they arrive as a pair;
                        // applying a lone value would clobber the other side.
                        if (Number.isFinite(u.default_rest_time) && Number.isFinite(u.default_work_time)) {
                            StorageService.saveDefaultTimers(
                                profile.id, u.default_rest_time, u.default_work_time
                            );
                            timerApiRef.current?.setDefaultTimers?.(
                                u.default_rest_time, u.default_work_time
                            );
                        }
                    }

                    // Workout history — union merge by a normalized name+startTime
                    // fingerprint. Dedup by id is unreliable: the backend assigns its
                    // own UUID on push, so the same workout returns with an id absent
                    // locally. Timestamps are normalized to epoch-ms so format drift
                    // (e.g. .000Z vs microseconds) doesn't cause false "new" items.
                    // Timestamped items match cross-source by name+epoch-ms.
                    // Timeless items (e.g. legacy backend rows with null
                    // start_time) can't be matched that way, so key them by
                    // their own id — otherwise a distinct same-named timeless
                    // workout would be shadowed and never pulled. Shared with
                    // the backfill pass below.
                    const keyOf = (name, t, id) => {
                        const ms = t ? new Date(t).getTime() : NaN;
                        return Number.isNaN(ms) ? `${name}|id:${id}` : `${name}|${ms}`;
                    };
                    // Workouts deleted locally whose server delete has not yet
                    // been confirmed. A pull that started BEFORE the delete can
                    // land after it, so without this gate the merge below puts
                    // the row straight back.
                    const pendingDeletes = StorageService.loadDeletedWorkouts(profile.id);
                    const isPendingDelete = (w) => pendingDeletes.some(
                        d => (d.id && d.id === w.id) || (d.clientId && d.clientId === w.client_id)
                    );
                    // This pull's result is authoritative for anything it does
                    // NOT contain: if the server no longer returns a row we
                    // deleted, the deletion is confirmed and the tombstone can
                    // go. Anything still present stays tombstoned.
                    if (workoutData?.items) {
                        // "Outstanding" covers a create still queued or in
                        // flight AND a delete not yet confirmed — either means
                        // this workout's fate is undecided, so an absent row
                        // proves nothing.
                        const { retire, reissue } = planTombstoneReconciliation(
                            workoutData.items,
                            pendingDeletes,
                            (key) => SyncQueue.hasPending('workout', key)
                                || SyncQueue.hasPending('workout_delete', key),
                        );
                        retire.forEach(d => StorageService.removeDeletedWorkout(profile.id, d));
                        reissue.forEach(({ serverRow }) => {
                            SyncQueue.enqueue(deletionOpFor(serverRow, profile.id));
                        });
                    }
                    if (workoutData?.items?.length > 0) {
                        setHistory(prev => {
                            const localKeys = new Set(prev.map(w => keyOf(w.name, w.startTime, w.id)));
                            const live = workoutData.items.filter(w => !isPendingDelete(w));
                            const newItems = live
                                .filter(w => !localKeys.has(keyOf(w.name, w.start_time, w.id)))
                                .map(mapServerWorkout);

                            // Rows we ALREADY hold need the server's identity
                            // adopted too, not just newly-seen ones. A row
                            // cached before mapServerWorkout existed carries no
                            // backendId, and the fingerprint filter above means
                            // it would never gain one — so deleting it would
                            // mint an id naming nothing, and the backfill would
                            // read it as never-uploaded and re-upload it after
                            // another device deleted it.
                            // Identity is adopted only on a POSITIVE match.
                            //
                            // keyOf is `${name}|${startMs}` — the id is merely a
                            // fallback for an unparseable date — so two workouts
                            // sharing a name and start time collide, and a Map
                            // keeps the last. Matching on that alone let a row
                            // keep its own backendId while adopting a DIFFERENT
                            // workout's client_id, and the next delete then
                            // removed that other workout. Content is not
                            // evidence of identity.
                            const byServerId = new Map();
                            const byClientId = new Map();
                            const byFingerprint = new Map();
                            const ambiguous = new Set();
                            live.forEach(w => {
                                if (w.id) byServerId.set(w.id, w);
                                if (w.client_id) byClientId.set(w.client_id, w);
                                const fp = keyOf(w.name, w.start_time, w.id);
                                if (byFingerprint.has(fp)) ambiguous.add(fp);
                                else byFingerprint.set(fp, w);
                            });

                            const matchFor = (w) => {
                                // A known identifier names exactly one row, and
                                // outranks anything the content suggests.
                                if (w.backendId) return byServerId.get(w.backendId) || null;
                                if (w.client_id) return byClientId.get(w.client_id) || null;
                                // A local id that IS a server id counts as
                                // positive too — that is how the old mapper
                                // stored pulled rows.
                                if (w.id && byServerId.has(w.id)) return byServerId.get(w.id);
                                // No positive identifier matched. There is
                                // deliberately NO content fallback: a name and
                                // start time being unique within one page of
                                // results does not make them proof of identity.
                                // The row we hold may have been deleted
                                // elsewhere while a *different* workout happens
                                // to share its name and time, and adopting that
                                // row's client_id makes the next delete remove
                                // the wrong workout. Leave it unidentified; a
                                // later pull that returns its real row matches
                                // positively through `id`.
                                return null;
                            };

                            let adopted = 0;
                            const enriched = prev.map(w => {
                                const match = matchFor(w);
                                if (!match) return w;
                                const backendId = w.backendId || match.id;
                                const clientId = w.client_id || match.client_id || null;
                                if (backendId === w.backendId
                                    && clientId === (w.client_id ?? null)) return w;
                                adopted++;
                                return { ...w, backendId, client_id: clientId };
                            });

                            if (!newItems.length && !adopted) return prev;
                            const merged = [...newItems, ...enriched]
                                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
                            StorageService.saveHistory(profile.id, merged);
                            return merged;
                        });
                    }

                    // Weight history — union merge by recorded_at
                    if (weightData?.length > 0) {
                        setWeightHistory(prev => {
                            const localDates = new Set(prev.map(e => e.date));
                            const newEntries = weightData
                                .filter(e => !localDates.has(e.recorded_at))
                                .map(e => ({ date: e.recorded_at, weight: e.weight }));
                            if (!newEntries.length) return prev;
                            const merged = [...prev, ...newEntries]
                                .sort((a, b) => new Date(a.date) - new Date(b.date));
                            StorageService.saveWeightHistory(profile.id, merged);
                            return merged;
                        });
                    }

                    // Food log — union merge by client_id (the field exists
                    // precisely for this, unlike workouts' fingerprint dedup).
                    // Cloud rows matching a local client_id adopt their backend
                    // UUID onto the local entry (covers entries pushed via the
                    // retry queue, which can't write backendId into state);
                    // rows with no local match merge in. Never removes local.
                    if (Array.isArray(foodData) && foodData.length > 0) {
                        setFoodLog(prev => {
                            const byClientId = new Map(
                                foodData.filter(r => r.client_id).map(r => [r.client_id, r])
                            );
                            let adopted = false;
                            const adoptedPrev = prev.map(e => {
                                if (e.backendId || !e.client_id) return e;
                                const row = byClientId.get(e.client_id);
                                if (!row) return e;
                                adopted = true;
                                return { ...e, backendId: row.id };
                            });
                            const localClientIds = new Set(prev.map(e => e.client_id).filter(Boolean));
                            const localBackendIds = new Set(prev.map(e => e.backendId).filter(Boolean));
                            const additions = foodData
                                .filter(r =>
                                    !(r.client_id && localClientIds.has(r.client_id)) &&
                                    !localBackendIds.has(r.id))
                                .map(r => ({
                                    id: r.id,
                                    client_id: r.client_id || null,
                                    backendId: r.id,
                                    logged_at: r.logged_at,
                                    description: r.description,
                                    calories: r.calories,
                                    protein_g: r.protein_g,
                                    carbs_g: r.carbs_g,
                                    fat_g: r.fat_g,
                                    source: r.source || 'manual',
                                    confidence: r.confidence || null,
                                    barcode: r.barcode || null,
                                    items: r.items || null
                                }));
                            if (!additions.length && !adopted) return prev;
                            const merged = [...adoptedPrev, ...additions]
                                .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
                            StorageService.saveFoodLog(profile.id, merged);
                            return merged;
                        });
                    }

                    // Assessments — merge by the frontend id preserved inside
                    // assessment_data; adopt backend UUIDs onto local rows.
                    if (Array.isArray(assessmentData) && assessmentData.length > 0) {
                        setAssessments(prev => {
                            const byLocalId = new Map(
                                assessmentData
                                    .filter(row => row.assessment_data?.id)
                                    .map(row => [row.assessment_data.id, row])
                            );
                            const adopted = prev.map(item => {
                                const row = byLocalId.get(item.id);
                                return row && !item.backendId
                                    ? { ...item, backendId: row.id }
                                    : item;
                            });
                            const localIds = new Set(prev.map(item => item.id));
                            const localBackendIds = new Set(prev.map(item => item.backendId).filter(Boolean));
                            const additions = assessmentData
                                .filter(row =>
                                    !localBackendIds.has(row.id) &&
                                    !localIds.has(row.assessment_data?.id))
                                .map(row => ({
                                    ...row.assessment_data,
                                    backendId: row.id,
                                }));
                            const changed = additions.length > 0 || adopted.some(
                                (item, index) => item !== prev[index]
                            );
                            if (!changed) return prev;
                            const merged = [...adopted, ...additions]
                                .sort((a, b) => new Date(a.date) - new Date(b.date));
                            StorageService.saveAssessments(profile.id, merged);
                            return merged;
                        });
                    }

                    // Custom templates — merge backend templates into local.
                    // Dedup by backendId (the backend UUID): templates we've already
                    // pulled or pushed carry it locally, so a UUID-to-UUID compare avoids
                    // re-adding the same template on every login. The local 'tpl_custom_*'
                    // ids never equal the backend UUID, so keying on those would duplicate
                    // templates each refresh.
                    if (templateData?.length > 0) {
                        const storedCustom = StorageService.loadCustomTemplates(profile.id);
                        const localBackendIds = new Set(
                            storedCustom.map(t => t.backendId).filter(Boolean)
                        );
                        // template_data preserves the local 'tpl_custom_*' id the
                        // template was pushed with. If a local copy has that id but
                        // no backendId (the write-back after a successful push
                        // failed), adopt the backend UUID onto it instead of
                        // re-adding the template as a duplicate.
                        let adopted = false;
                        const newTemplates = [];
                        templateData
                            .filter(t => !localBackendIds.has(t.id))
                            .forEach(t => {
                                const orphan = storedCustom.find(
                                    s => !s.backendId && s.id === t.template_data?.id
                                );
                                if (orphan) {
                                    orphan.backendId = t.id;
                                    adopted = true;
                                } else {
                                    newTemplates.push({
                                        ...t.template_data,   // template_data contains the full template object
                                        backendId: t.id,      // store backend UUID for future deletes
                                        isCustom: true
                                    });
                                }
                            });
                        if (newTemplates.length > 0 || adopted) {
                            const merged = [...storedCustom, ...newTemplates];
                            StorageService.saveCustomTemplates(profile.id, merged);
                            setTemplates([...DEFAULT_TEMPLATES, ...merged]);
                        }
                    }

                    // Custom exercises — same merge as templates (dedup by
                    // backendId, adopt onto orphans). Pulling these alongside
                    // templates also resolves template references to custom
                    // exercises created on another device — the definitions
                    // arrive in the same pull, so nothing dangles.
                    if (exerciseData?.length > 0) {
                        const storedEx = StorageService.loadCustomExercises(profile.id);
                        const exBackendIds = new Set(
                            storedEx.map(e => e.backendId).filter(Boolean)
                        );
                        let exAdopted = false;
                        const newExercises = [];
                        exerciseData
                            .filter(e => !exBackendIds.has(e.id))
                            .forEach(e => {
                                const orphan = storedEx.find(
                                    s => !s.backendId && s.id === e.exercise_data?.id
                                );
                                if (orphan) {
                                    orphan.backendId = e.id;
                                    exAdopted = true;
                                } else {
                                    newExercises.push({
                                        ...e.exercise_data,
                                        backendId: e.id
                                    });
                                }
                            });
                        if (newExercises.length > 0 || exAdopted) {
                            const mergedEx = [...storedEx, ...newExercises];
                            StorageService.saveCustomExercises(profile.id, mergedEx);
                            setExercises([...DEFAULT_EXERCISES, ...mergedEx]);
                        }
                    }

                    // BACKFILL — recover device-only data that never reached
                    // the cloud (e.g. accounts affected by the pre-fix email
                    // gate, or pushes that failed before the retry queue
                    // existed). Runs after the merges above, so storage holds
                    // union(local, cloud) and "not in the pulled cloud set"
                    // means genuinely cloud-absent. Idempotent: templates and
                    // exercises are excluded once they carry a backendId, and
                    // workouts/weights match by the same name+epoch-ms /
                    // epoch-ms fingerprints the merges use, so re-running
                    // cannot create duplicates. Pushes ride the retry queue.
                    // Once per profile per app boot: the boot sequence can run
                    // this pull more than once, and a second pass computed
                    // before the first pass's pushes land server-side would
                    // re-push the same items (verified live — duplicate rows).
                    if (backfilledProfilesRef.current.has(profile.id)) {
                        return;
                    }
                    backfilledProfilesRef.current.add(profile.id);
                    const backfill = [];
                    StorageService.loadCustomTemplates(profile.id)
                        .filter(t => !t.backendId)
                        .forEach(t => backfill.push({ type: 'template', key: t.id, payload: t, uid: profile.id }));
                    StorageService.loadCustomExercises(profile.id)
                        .filter(e => !e.backendId)
                        .forEach(e => backfill.push({ type: 'exercise', key: e.id, payload: e, uid: profile.id }));
                    // Cloud membership for workouts/weights is only knowable
                    // when that part of the pull succeeded — a failed fetch
                    // must not be mistaken for an empty cloud.
                    if (workoutData?.items) {
                        const cloudWorkoutKeys = new Set(
                            workoutData.items.map(w => keyOf(w.name, w.start_time, w.id))
                        );
                        const localHistory = StorageService.loadProfileState(profile.id).history || [];
                        // Second tombstone gate. The backfill pushes anything
                        // present locally and absent on the server — which is
                        // exactly the shape of a workout we just deleted, or
                        // one reinstated by restoring an older backup. Without
                        // this it would re-upload the deletion away.
                        const deletedHere = StorageService.loadDeletedWorkouts(profile.id);
                        const wasDeleted = (w) => deletedHere.some(
                            d => (d.id && (d.id === w.id || d.id === w.backendId))
                                || (d.clientId && d.clientId === w.client_id)
                        );
                        const onCloud = (w) => cloudWorkoutKeys.has(keyOf(w.name, w.startTime, w.id));

                        // Only rows we can POSITIVELY identify as created here
                        // are uploaded. No identifier is minted at this point:
                        // minting one for an ambiguous row is precisely what
                        // made a resurrection permanent, since a fresh id
                        // collides with nothing the server has recorded.
                        const candidates = localHistory
                            .filter(w => !wasDeleted(w))
                            .filter(w => !onCloud(w));
                        const ambiguous = candidates
                            .filter(w => backfillDisposition(w) === 'skip-ambiguous');
                        candidates
                            .filter(w => backfillDisposition(w) === 'upload')
                            .forEach(w => {
                                backfill.push({
                                    type: 'workout',
                                    key: w.client_id,
                                    payload: w,
                                    uid: profile.id
                                });
                            });
                        if (ambiguous.length > 0) {
                            // Kept locally, deliberately not uploaded. Visible
                            // so this does not look like silent data loss.
                            console.warn(
                                `[backfill] ${ambiguous.length} workout(s) have no ` +
                                'server identity and predate client ids; keeping them ' +
                                'locally rather than risking re-uploading something ' +
                                'deleted on another device.'
                            );
                        }
                    }
                    if (Array.isArray(weightData)) {
                        const cloudWeightMs = new Set(
                            weightData.map(e => new Date(e.recorded_at).getTime())
                        );
                        const localWeights = StorageService.loadProfileState(profile.id).weightHistory || [];
                        localWeights
                            .filter(e => !cloudWeightMs.has(new Date(e.date).getTime()))
                            .forEach(e => backfill.push({
                                type: 'weight',
                                key: e.date,
                                payload: { weight: e.weight, date: e.date },
                                uid: profile.id
                            }));
                    }
                    if (Array.isArray(foodData)) {
                        const cloudFoodClientIds = new Set(
                            foodData.map(r => r.client_id).filter(Boolean)
                        );
                        const localFood = StorageService.loadProfileState(profile.id).foodLog || [];
                        // Rows with a backendId are known-cloud; rows whose
                        // client_id the pull didn't return are cloud-absent
                        // the POST is idempotent by client_id.
                        localFood
                            .filter(e => !e.backendId && e.client_id && !cloudFoodClientIds.has(e.client_id))
                            .forEach(e => backfill.push({
                                type: 'food_log',
                                key: e.client_id,
                                payload: e,
                                uid: profile.id
                            }));
                    }
                    if (Array.isArray(assessmentData)) {
                        const cloudAssessmentIds = new Set(
                            assessmentData.map(row => row.assessment_data?.id).filter(Boolean)
                        );
                        StorageService.loadAssessments(profile.id)
                            .filter(item => !item.backendId && !cloudAssessmentIds.has(item.id))
                            .forEach(item => backfill.push({
                                type: 'assessment',
                                key: item.id,
                                payload: item,
                                uid: profile.id,
                            }));
                    }
                    if (backfill.length > 0) {
                        console.info(`[CloudSync] Backfilling ${backfill.length} device-only item(s) to the cloud.`);
                        backfill.forEach(op => SyncQueue.enqueue(op));
                        SyncQueue.flush();
                    }

                } catch (err) {
                    console.warn('[CloudSync] Pull failed (non-fatal):', err.message);
                }
            })();
        }
    };

    useEffect(() => {
        if (currentProfile) {
            refreshProfileData(currentProfile);
        }
    }, [currentProfile]);


    // --- 3. PERSISTENCE (Scoped to Current Profile) ---

    // Persist History — hydration gate. Only write once this profile's stored
    // history has actually been rehydrated into state (historyHydratedFor is
    // set in the same batch as the setHistory restore in refreshProfileData).
    // Any effect run before that commit — initial mount, profile switch,
    // StrictMode replays — sees a stale/empty `history` and must not write it
    // over the stored value. A plain mount guard is NOT enough: StrictMode
    // replays the effect after the guard is consumed but before the restore
    // commit, wiping storage right before the replayed restore re-reads it
    // (verified live; the same hole exists behind the guard-only effects).
    useEffect(() => {
        if (currentProfile && historyHydratedFor === currentProfile.id) {
            StorageService.saveHistory(currentProfile.id, history);
        }
    }, [history, currentProfile, historyHydratedFor]);

    // Persist Active Workout — hydration gate, same rationale as the history
    // effect above: only write once this profile's stored active workout has
    // been rehydrated into state. A mount-ref guard is NOT enough — StrictMode
    // replays the effect after the guard is consumed but before the restore
    // commit, writing the pre-restore null over a live/paused session
    // (reproduced on reload in dev).
    useEffect(() => {
        if (currentProfile && activeWorkoutHydratedFor === currentProfile.id) {
            StorageService.saveActiveWorkout(currentProfile.id, activeWorkout || null);
        }
    }, [activeWorkout, currentProfile, activeWorkoutHydratedFor]);

    // Auto-sync to API after a workout is completed (i.e. history changes).
    // Placed after the history AND active-workout persistence effects so that
    // localStorage reflects the latest state (including a cleared active workout)
    // before syncToApi reads it — otherwise a just-finished workout could be
    // re-synced to the API as still-active.
    useEffect(() => {
        if (currentProfile && history.length > 0) {
            // Fire and forget — don't await, don't block UI.
            // localStorage stays the source of truth if this fails.
            StorageService.syncToApi(currentProfile.id).catch(() => {});
        }
    }, [history]);

    // The persist effects below are hydration-gated on settingsHydratedFor
    // (S13 sweep): mount-ref guards fail under StrictMode replay — the
    // replayed run consumes the guard before the restore commit and writes
    // the pre-restore default over storage. The gate skips every run until
    // this profile's values have been rehydrated, which also covers the
    // profile-switch window (gate still holds the outgoing profile's id).
    //
    // For the backend-synced settings, the syncedProfileRef "same profile"
    // check is unchanged: the first gated run after a mount/switch is the
    // restore run (ref holds the prior id) — persisted locally, not pushed.
    // Only genuine user edits after that push to the backend.

    // Persist Theme
    const themeSyncedProfileRef = useRef(null);
    useEffect(() => {
        // Apply theme to the DOM on every run (incl. pre-hydration) so the
        // current/default theme is always reflected visually.
        document.documentElement.setAttribute('data-theme', theme);
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        StorageService.saveTheme(currentProfile.id, theme);
        const sameProfile = themeSyncedProfileRef.current === currentProfile.id;
        themeSyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ theme })
                .catch(err => {
                    console.warn('[settings-sync] theme:', err);
                    SyncQueue.enqueue({ type: 'profile_settings', key: 'theme', payload: { theme } });
                });
        }
    }, [theme, currentProfile, settingsHydratedFor]);

    // Persist Units
    const unitsSyncedProfileRef = useRef(null);
    useEffect(() => {
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        StorageService.saveUnits(currentProfile.id, units);
        const sameProfile = unitsSyncedProfileRef.current === currentProfile.id;
        unitsSyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ units })
                .catch(err => {
                    console.warn('[settings-sync] units:', err);
                    SyncQueue.enqueue({ type: 'profile_settings', key: 'units', payload: { units } });
                });
        }
    }, [units, currentProfile, settingsHydratedFor]);

    // Persist Sound
    const soundSyncedProfileRef = useRef(null);
    useEffect(() => {
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        StorageService.saveSound(currentProfile.id, soundEnabled);
        const sameProfile = soundSyncedProfileRef.current === currentProfile.id;
        soundSyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ sound_enabled: soundEnabled })
                .catch(err => {
                    console.warn('[settings-sync] sound_enabled:', err);
                    SyncQueue.enqueue({ type: 'profile_settings', key: 'sound_enabled', payload: { sound_enabled: soundEnabled } });
                });
        }
    }, [soundEnabled, currentProfile, settingsHydratedFor]);

    // Persist Coach Personality
    const coachPersonalitySyncedProfileRef = useRef(null);
    useEffect(() => {
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        StorageService.saveCoachPersonality(coachPersonality);
        const sameProfile = coachPersonalitySyncedProfileRef.current === currentProfile.id;
        coachPersonalitySyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ coach_personality: coachPersonality })
                .catch(err => {
                    console.warn('[settings-sync] coach_personality:', err);
                    SyncQueue.enqueue({ type: 'profile_settings', key: 'coach_personality', payload: { coach_personality: coachPersonality } });
                });
        }
    }, [coachPersonality, currentProfile, settingsHydratedFor]);

    // Persist Coach Voice ID
    const coachVoiceIdSyncedProfileRef = useRef(null);
    useEffect(() => {
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        StorageService.saveCoachVoiceId(coachVoiceId);
        const sameProfile = coachVoiceIdSyncedProfileRef.current === currentProfile.id;
        coachVoiceIdSyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ coach_voice_id: coachVoiceId })
                .catch(err => {
                    console.warn('[settings-sync] coach_voice_id:', err);
                    SyncQueue.enqueue({ type: 'profile_settings', key: 'coach_voice_id', payload: { coach_voice_id: coachVoiceId } });
                });
        }
    }, [coachVoiceId, currentProfile, settingsHydratedFor]);

    // Persist Experience Level
    const experienceLevelSyncedProfileRef = useRef(null);
    useEffect(() => {
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        StorageService.saveExperienceLevel(currentProfile.id, experienceLevel);
        const sameProfile = experienceLevelSyncedProfileRef.current === currentProfile.id;
        experienceLevelSyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ experience_level: experienceLevel })
                .catch(err => {
                    console.warn('[settings-sync] experience_level:', err);
                    SyncQueue.enqueue({ type: 'profile_settings', key: 'experience_level', payload: { experience_level: experienceLevel } });
                });
        }
    }, [experienceLevel, currentProfile, settingsHydratedFor]);

    // Persist Stats
    useEffect(() => {
        if (currentProfile && settingsHydratedFor === currentProfile.id) {
            StorageService.saveUserStats(currentProfile.id, userStats);
        }
    }, [userStats, currentProfile, settingsHydratedFor]);

    // Persist Weight History
    useEffect(() => {
        if (currentProfile && settingsHydratedFor === currentProfile.id) {
            StorageService.saveWeightHistory(currentProfile.id, weightHistory);
        }
    }, [weightHistory, currentProfile, settingsHydratedFor]);

    // Persist Food Log — same hydration gate as weightHistory: refreshProfileData
    // restores foodLog in the same synchronous batch that sets settingsHydratedFor,
    // so no pre-restore run (mount, profile switch, StrictMode replay) can write
    // a stale/empty array over the stored value.
    useEffect(() => {
        if (currentProfile && settingsHydratedFor === currentProfile.id) {
            StorageService.saveFoodLog(currentProfile.id, foodLog);
        }
    }, [foodLog, currentProfile, settingsHydratedFor]);

    // Persist Progression Settings
    useEffect(() => {
        if (currentProfile && settingsHydratedFor === currentProfile.id) {
            StorageService.saveProgressionSettings(currentProfile.id, {
                smartProgressionEnabled,
                progressionMode,
                progressionType,
                progressionIncrement
            });
        }
    }, [smartProgressionEnabled, progressionMode, progressionType, progressionIncrement, currentProfile, settingsHydratedFor]);

    // Persist Active Equipment Profile
    useEffect(() => {
        if (currentProfile && settingsHydratedFor === currentProfile.id) {
            StorageService.saveEquipmentProfile(currentProfile.id, activeEquipmentProfileId);
        }
    }, [activeEquipmentProfileId, currentProfile, settingsHydratedFor]);

    // Persist Custom Equipment Items
    useEffect(() => {
        if (currentProfile && settingsHydratedFor === currentProfile.id) {
            StorageService.saveCustomEquipment(currentProfile.id, customEquipmentItems);
        }
    }, [customEquipmentItems, currentProfile, settingsHydratedFor]);

    // Named photo/manual equipment environments remain local-first and are
    // mirrored to the signed-in cloud profile. Only confirmed metadata is
    // persisted; photos themselves are never stored.
    const equipmentEnvironmentsSyncedProfileRef = useRef(null);
    useEffect(() => {
        if (!currentProfile || settingsHydratedFor !== currentProfile.id) return;
        const normalized = normalizeEquipmentEnvironments(equipmentEnvironments);
        StorageService.saveEquipmentEnvironments(currentProfile.id, normalized);
        const sameProfile = equipmentEnvironmentsSyncedProfileRef.current === currentProfile.id;
        equipmentEnvironmentsSyncedProfileRef.current = currentProfile.id;
        if (sameProfile && canSyncRef.current()) {
            ApiService.saveProfile({ equipment_environments: normalized })
                .catch(err => {
                    console.warn('[settings-sync] equipment_environments:', err);
                    SyncQueue.enqueue({
                        type: 'profile_settings',
                        key: 'equipment_environments',
                        payload: { equipment_environments: normalized },
                    });
                });
        }
    }, [equipmentEnvironments, currentProfile, settingsHydratedFor]);



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

    const updateProfile = (updates) => {
        if (!currentProfile) return;
        const updatedProfile = { ...currentProfile, ...updates };

        // Update in profiles array
        const updatedProfiles = profiles.map(p =>
            p.id === currentProfile.id ? updatedProfile : p
        );

        setProfiles(updatedProfiles);
        setCurrentProfile(updatedProfile);
        StorageService.saveProfiles(updatedProfiles);
    };


    // --- SMART HISTORY LOOKUP ---
    const getLastExerciseStats = (exerciseId) => {
        try {
            if (!history || history.length === 0) return null;

            // Iterate backwards through history to find the last time this exercise was performed
            for (let i = 0; i < history.length; i++) {
                const workout = history[i]; // History is sorted new -> old (index 0 is newest)

                if (workout.status !== 'completed') continue;

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
            client_id: crypto.randomUUID(),
            name,
            startTime: new Date().toISOString(),
            status: 'preparing', // CHANGED: Start in prep mode
            notes: '', // Initialize notes
            pausedAt: null,
            totalPausedMs: 0,
            exercises: []
        };
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
            } else {
                // ID passed
                templateId = templateIdOrObj;
                template = templates.find(t => t.id === templateId);
            }

            if (!template) {
                return;
            }

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
                }

                const smartWeight = Number(lastStats?.weight) || 0;
                const smartReps = Number(lastStats?.reps) || 0;
                const configuredSets = typeof exItem === 'object' && Array.isArray(exItem.sets)
                    ? exItem.sets
                    : [];
                const configuredSetCount = typeof exItem === 'object' && Number.isInteger(exItem.sets)
                    ? exItem.sets
                    : 0;
                const targetSetCount = configuredSets.length || configuredSetCount || template.sets || 3;
                const currentBodyweight = parseFloat(userStats.currentWeight) || 0;

                const sets = Array.from({ length: targetSetCount }, (_, setIndex) => {
                    const configuredSet = configuredSets[setIndex] || {};
                    const configuredWeight = Number(configuredSet.weight) || 0;
                    const configuredReps = Number(configuredSet.targetReps) || 0;
                    const startingWeight = configuredWeight > 0
                        ? configuredWeight
                        : (fullExercise.isBodyweight ? currentBodyweight : smartWeight);

                    return {
                        id: generateId(),
                        weight: startingWeight,
                        targetReps: configuredReps || smartReps,
                        targetTime: configuredSet.targetTime || fullExercise.default_duration || 0,
                        reps: 0, distance: 0, time: 0, completed: false,
                        setType: 'normal',
                        lastPerformance: lastStats // METADATA
                    };
                });

                return {
                    id: generateId(),
                    exercise: fullExercise,
                    sets
                };
            }).filter(Boolean);

            const newWorkout = {
                id: generateId(),
                client_id: crypto.randomUUID(),
                name: template.name,
                startTime: new Date().toISOString(),
                status: 'preparing',
                pausedAt: null,
                totalPausedMs: 0,
                // Track source template for syncing
                sourceTemplateId: templateId, // TRACK SOURCE
                exercises: newWorkoutExercises
            };

            setActiveWorkout(newWorkout);
            _setCurrentExerciseIndex(0);
            _setCurrentSetIndex(0);

        } catch (error) {
            console.error("CRITICAL: Failed to load template", error);
            alert("Failed to load template. Please check console.");
        }
    };

    const finishWorkout = async () => {
        if (!activeWorkout) return;

        // Generate Recommendations
        const recommendations = [];
        activeWorkout.exercises.forEach((ex, exerciseIndex) => {
            // Progression Logic
            // Determine effective settings
            const effectiveMode = smartProgressionEnabled ? progressionMode : 'linear';
            const effectiveType = smartProgressionEnabled ? progressionType : 'fixed';
            const effectiveIncrement = smartProgressionEnabled ? progressionIncrement : (units === 'metric' ? 2.5 : 5);

            let shouldRecommend = false;
            // Progression judges working sets only — warm-ups neither block a
            // "all sets met target" pass nor anchor the last-set reference.
            // Sets predating setType (undefined) count as working sets.
            const workingSets = (ex.sets || []).filter(s => s.setType !== 'warmup');
            // Guard against empty sets
            if (workingSets.length === 0) return;

            // Decision 7 (S27): bodyweight and duration exercises never get a
            // weight recommendation of ANY kind (increase/hold/deload) —
            // their progression is reps or time (spec §D, later piece).
            const catalogEx = ex.exercise || {};
            const isBodyweightEx = catalogEx.isBodyweight
                || catalogEx.category === 'Calisthenics'
                || catalogEx.category === 'Yoga'
                || catalogEx.equipment === 'None';
            const isDurationEx = workingSets.every(s => !(s.targetReps > 0));
            if (isBodyweightEx || isDurationEx) return;

            let lastSet = workingSets[workingSets.length - 1]; // Default reference for weight

            if (effectiveMode === 'double') {
                // Double Progression: All sets must meet target
                const allSetsMet = workingSets.every(s => s.targetReps > 0 && s.reps >= s.targetReps && s.weight > 0);
                if (allSetsMet) shouldRecommend = true;
            } else {
                // Linear (Standard): Any set meeting target triggers recommendation (usually final set logic, but let's be generous: if last set hit it)
                // Actually, standard linear usually implies if you hit your reps on the last set (AMRAP or fixed), you go up.
                // We'll check if the LAST set met the target.
                const finalSet = workingSets[workingSets.length - 1];
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
                    type: 'increase',
                    exerciseId: ex.exercise.id,
                    exerciseName: ex.exercise.name,
                    setId: lastSet.id,
                    oldWeight: lastSet.weight,
                    newWeight: newWeight,
                    // Captured at detection time, while the workout still
                    // exists: applying runs post-finish, when activeWorkout
                    // is null (S27 spec §A/§C). exerciseIndex is positional;
                    // apply re-verifies it against exerciseId.
                    templateId: activeWorkout.sourceTemplateId || null,
                    exerciseIndex,
                    message: `Recommend +${incrementValue}${units === 'metric' ? 'kg' : 'lbs'} (${newWeight})`
                });
            } else {
                // Piece C (spec §C): a missed target is never silent. A miss
                // is judged on the same sets the hit predicate uses — a set
                // counts only when it had a real rep target and real weight.
                const missedIn = (sets) => {
                    const working = (sets || []).filter(s => s.setType !== 'warmup');
                    if (effectiveMode === 'double') {
                        return working.some(s => s.targetReps > 0 && s.weight > 0 && s.reps < s.targetReps);
                    }
                    const finalSet = working[working.length - 1];
                    return !!finalSet && finalSet.targetReps > 0 && finalSet.weight > 0 && finalSet.reps < finalSet.targetReps;
                };
                if (missedIn(ex.sets)) {
                    // Consecutive misses are DERIVED from history, not stored:
                    // the previous session for this exercise is the first
                    // completed entry carrying the catalog id (history is
                    // newest-first, and this workout is not in it yet).
                    const prevEntry = history.find(w => w.status === 'completed'
                        && w.exercises && w.exercises.some(e => e && e.exercise && e.exercise.id === ex.exercise.id));
                    const prevExData = prevEntry
                        ? prevEntry.exercises.find(e => e && e.exercise && e.exercise.id === ex.exercise.id)
                        : null;
                    const prevMissed = !!prevExData && missedIn(prevExData.sets);

                    const unit = units === 'metric' ? 'kg' : 'lbs';
                    const holdRec = {
                        type: 'hold',
                        exerciseId: ex.exercise.id,
                        exerciseName: ex.exercise.name,
                        setId: lastSet.id,
                        oldWeight: lastSet.weight,
                        newWeight: lastSet.weight,
                        templateId: activeWorkout.sourceTemplateId || null,
                        exerciseIndex,
                        message: `Target missed — hold at ${lastSet.weight}${unit} next session.`
                    };

                    if (prevMissed) {
                        // Two consecutive missed sessions: ~10% deload,
                        // rounded to the standard plate grain (equipment-
                        // aware increments are piece E).
                        const grain = units === 'metric' ? 2.5 : 5;
                        let deloadWeight = Math.round((lastSet.weight * 0.9) / grain) * grain;
                        if (deloadWeight >= lastSet.weight) deloadWeight = lastSet.weight - grain;
                        deloadWeight = Math.round(deloadWeight * 100) / 100;
                        if (deloadWeight > 0) {
                            recommendations.push({
                                type: 'deload',
                                exerciseId: ex.exercise.id,
                                exerciseName: ex.exercise.name,
                                setId: lastSet.id,
                                oldWeight: lastSet.weight,
                                newWeight: deloadWeight,
                                templateId: activeWorkout.sourceTemplateId || null,
                                exerciseIndex,
                                message: `Two sessions below target — deload to ${deloadWeight}${unit} and rebuild.`
                            });
                        } else {
                            // Weight too small to deload by a full plate
                            // step; holding is the honest fallback.
                            recommendations.push(holdRec);
                        }
                    } else {
                        recommendations.push(holdRec);
                    }
                }
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

        const endTime = new Date().toISOString();
        // True training duration: wall-clock minus accumulated pause time. If
        // the session is finished while still paused, close out the open pause
        // interval too, so it isn't counted as active time.
        const openPauseMs = activeWorkout.status === 'paused' && activeWorkout.pausedAt
            ? Math.max(0, Date.now() - new Date(activeWorkout.pausedAt).getTime())
            : 0;
        const totalPausedMs = (activeWorkout.totalPausedMs || 0) + openPauseMs;
        // A workout restored from an old backup can reach this point without
        // an identifier. Stamp before anything is uploaded — otherwise the
        // server row cannot be matched later and a deletion cannot stick.
        const completedWorkout = {
            ...ensureWorkoutClientId(activeWorkout),
            units: units, // unit active at completion → drives displayWeight() in history/analytics
            endTime,
            status: 'completed',
            pausedAt: null,
            totalPausedMs,
            activeDurationMs: Math.max(0,
                new Date(endTime).getTime() - new Date(activeWorkout.startTime).getTime() - totalPausedMs
            ),
            recommendations: uniqueRecs // NEW: Save to history
        };
        setHistory(prev => [completedWorkout, ...prev]);
        setActiveWorkout(null);
        timerApiRef.current?.skipRest();        // Stop rest timer
        timerApiRef.current?.resetWorkTimer();  // Stop/Reset work timer

        // Push the completed workout to the backend for cloud users (non-fatal).
        if (currentProfile?.email && ApiService.isAvailable()) {
            try {
                const savedWorkout = await ApiService.saveWorkout(completedWorkout);
                if (savedWorkout?.deleted_at) {
                    // This client_id was deleted elsewhere. The server keeps
                    // the row marked rather than resurrecting it, and says so
                    // here — the only channel, since the list hides deleted
                    // rows. Drop the local copy instead of treating the
                    // response as a successful save.
                    dropLocallyAsDeleted(currentProfile.id, savedWorkout);
                } else if (savedWorkout?.id) {
                    setHistory(prev => prev.map(w =>
                        w.client_id === completedWorkout.client_id
                            ? { ...w, backendId: savedWorkout.id }
                            : w
                    ));
                }
            } catch (err) {
                console.warn('[CloudSync] Workout push failed (non-fatal):', err.message);
                SyncQueue.enqueue({
                    type: 'workout',
                    key: completedWorkout.client_id || completedWorkout.id,
                    payload: completedWorkout,
                    uid: currentProfile.id
                });
            }
        }

        return completedWorkout; // RETURN for immediate UI use
    };

    // Deleting a workout used to filter local state and nothing else, so the
    // row survived on the server and the next pull merged it straight back.
    // Now: drop it locally, record a tombstone so an in-flight pull cannot
    // re-add it, and delete it on the server (queued if that fails).
    const deleteWorkout = (workoutId) => {
        const target = history.find(w => w.id === workoutId);
        const drop = () => setHistory(prev => prev.filter(w => w.id !== workoutId));
        if (!target || !currentProfile) { drop(); return; }

        // Local-only profiles never sync — nothing to tell the server, and a
        // tombstone would only grow a store nothing retires.
        if (!canSyncRef.current()) { drop(); return; }

        // Capture the owner NOW. Everything below may resolve after the user
        // has switched profiles, and an unscoped edit then lands on whoever is
        // on screen — removing the wrong person's workout and leaving the real
        // one on disk. Same ownership rule as dropLocallyAsDeleted.
        const uid = currentProfile.id;
        // Returns whether the row is actually gone. A storage write can fail on
        // a full quota, and dropping it from React state anyway would show the
        // user a successful delete that reload undoes. Keep the row visible
        // instead — a deletion that visibly did not happen beats one that
        // silently did not.
        const dropOwned = () => {
            const stored = StorageService.loadProfileState(uid).history || [];
            const pruned = stored.filter(w => w.id !== workoutId);
            if (pruned.length !== stored.length && !StorageService.saveHistory(uid, pruned)) {
                console.warn(
                    '[delete-workout] history write failed; keeping the row visible'
                );
                return false;
            }
            if (latestProfileIdRef.current === uid) {
                setHistory(prev => prev.filter(w => w.id !== workoutId));
            }
            return true;
        };

        const { clientId, backendId, localOnly } = chooseDeletionTarget(target);

        // Cancel any queued upload for this row BEFORE anything returns. A
        // pre-redesign client could queue a create keyed on the local id with
        // no client_id in its payload; the server cannot recognise that upload
        // — it inserts with client_id NULL, colliding with nothing — so a
        // recorded deletion cannot catch it afterwards. Cancelling while it is
        // still cancellable is the only fence available, and it applies to the
        // local-only row too, which is why it sits above that return rather
        // than below it. If flush already captured the entry the workout can
        // come back; that is not inferred away here, because inferring it is
        // exactly what this redesign removed.
        if (!target.client_id) SyncQueue.remove('workout', target.id);

        // No identifier from either source. Nothing names this row on the
        // server, so there is no request to make and nothing a pull could match
        // it against. Removing it locally IS the whole deletion.
        //
        // Scope limit, stated precisely. The census covered SERVER rows where
        // client_id IS NULL — it found zero, and the backend's stamp keeps that
        // at zero. It did NOT inventory local queue payloads, and proves
        // nothing about whether a local row corresponds to some server row.
        //
        // What remains is a legacy queued create whose request flush had
        // ALREADY captured when Delete was pressed, so cancellation above could
        // not reach it. BOTH outcomes are unresolved, not just the lost one:
        //
        //   - response lost or the app dies: nothing ever learns the stamped id
        //   - response received NORMALLY: this row is already gone locally, so
        //     adoption correctly fail-closes (it must not resurrect what the
        //     user deleted) — and nothing holds a deletion intent for the
        //     stamped id, so the next pull brings the workout back
        //
        // An earlier comment here claimed only the lost-response interval was
        // open. That was false, and review caught it.
        //
        // Neither can be closed from the response path: a stable key would have
        // to be in the request before it was first sent. Pinned by the
        // 'LIMITATION:' test in workoutDeletion.provider.test.jsx so it cannot
        // be quietly relabelled as fixed. An acknowledged create that was NOT
        // deleted meanwhile is correlated by adoptStampedIdentity.
        if (localOnly) {
            dropOwned();
            return;
        }

        // Queue the deletion, then attempt it. Because the server records a
        // deletion by client id whether or not the workout has arrived, there
        // is no lookup, nothing to cancel, and no need to reason about whether
        // an upload is still in flight — a create that lands afterwards
        // collides with the recorded deletion and comes back marked deleted.
        //
        // Five review rounds went into trying to make that inference safe on
        // the client. It cannot be: a lost response or a crash leaves the
        // outcome unknown. Recording intent server-side removes the question.
        const key = clientId || backendId;
        const queued = SyncQueue.enqueue({
            type: 'workout_delete',
            key,
            payload: clientId ? { client_id: clientId } : { backendId },
            uid,
        });

        // Tombstone AFTER the queue entry, never before. The queue entry is the
        // durable intent; the tombstone is only a local display guard. Writing
        // the guard first meant a crash in between left a tombstone with no
        // intent behind it — and reconciliation retires a tombstone the moment
        // the queue holds nothing for it, so the delete was silently forgotten
        // and an in-flight create could commit with nothing left to undo it.
        StorageService.addDeletedWorkout(uid, {
            id: target.backendId || target.id,
            clientId,
        });

        // Remove the row optimistically ONLY when the intent is genuinely on
        // disk. `enqueue` swallowed storage failures, so a full quota meant the
        // workout vanished from the UI with nothing recorded anywhere — it
        // would be back on the next pull, and the user would reasonably think
        // the delete had worked. When the write fails the row stays visible and
        // the deletion completes only if the request itself succeeds, which is
        // a known outcome rather than an assumed one.
        if (queued) {
            dropOwned();
        } else {
            console.warn(
                '[delete-workout] intent could not be stored; keeping the row ' +
                'visible until the request is confirmed'
            );
        }

        const attempt = clientId
            ? ApiService.deleteWorkoutByClientId(clientId)
            : ApiService.deleteWorkout(backendId);
        attempt
            .then(() => {
                SyncQueue.remove('workout_delete', key);
                // Owner-scoped: this resolves long after the call, and the
                // profile on screen may no longer be the one that deleted.
                if (!queued) dropOwned();
            })
            .catch(err => {
                // Queued: the retry carries it. Not queued: the row is still on
                // screen, which is the honest state — nothing durable records
                // the deletion and the request did not land either.
                console.warn('[delete-workout] queued for retry:', err?.message || err);
            });
    };

    const cancelWorkout = () => {
        setActiveWorkout(null);
        timerApiRef.current?.skipRest();        // Stop rest timer
        timerApiRef.current?.resetWorkTimer();  // Stop/Reset work timer
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
                completed: false,
                setType: 'normal'
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
                // exIndex is the ACTIVE WORKOUT's index. Since S32 a prep
                // removal can make it diverge from the template's, so pass the
                // catalog id and the workout length too and let syncToTemplate
                // resolve the real slot.
                syncToTemplate(prev.sourceTemplateId, {
                    catalogId: exercise.exercise?.id,
                    setCount: exercise.sets.length
                }, setIndex, updates);
            }

     return ActiveWorkoutService.updateSet(prev, {
            exerciseInstanceId,
            setId,
            updates
        });
    });
};

    // Resolve which TEMPLATE slot a prep set-edit belongs to.
    //
    // The caller only knows the active workout's index. Before S32 the two
    // arrays were always aligned, because a workout was built from its
    // template in order and no exercise could be removed. Prep removal breaks
    // that: drop index 0 of [Squat, Bench] and an edit to Bench arrives as
    // index 0, which positionally is Squat — and syncToTemplate persists to
    // custom storage immediately, so the wrong exercise is corrupted on disk
    // and in the cloud (S32 code review, H1).
    //
    // Catalog id is authoritative, and where it cannot decide on its own this
    // fails closed: refusing to sync costs the user an immediate write-through,
    // while guessing corrupts a template on disk and in the cloud. Save and
    // START are unaffected either way — they persist the whole prep payload and
    // resolve no indices at all.
    const resolveSyncTargetIndex = (template, locator) => {
        const { catalogId } = locator || {};
        const entries = template.exercises || [];

        // No identity to match on: never guess. No production route builds a
        // prep row without a catalog id today (S32 re-review P3).
        if (!catalogId) return -1;

        const idAt = (i) => {
            const entry = entries[i];
            return typeof entry === 'string' ? entry : entry?.id;
        };
        const matches = [];
        for (let i = 0; i < entries.length; i++) {
            if (idAt(i) === catalogId) matches.push(i);
        }

        // Exactly one entry carries this catalog id, so the id IS its identity
        // and the workout's own index never enters into it. Anything else —
        // absent, or listed more than once with no way to tell the occurrences
        // apart — fails closed. A positional tie-break would be right only
        // while the two arrays are aligned, and the state where they are not
        // is constructible (S32 re-review round 2, C3), so the branch is not
        // worth its hazard: Save and START still persist the whole payload.
        return matches.length === 1 ? matches[0] : -1;
    };

    // Helper to sync changes back to source template
    const syncToTemplate = (templateId, exLocator, setIndex, updates) => {
        setTemplates(prevTemplates => {
            const tplIndex = prevTemplates.findIndex(t => t.id === templateId);
            if (tplIndex === -1) return prevTemplates;

            const tpl = prevTemplates[tplIndex];
            // Built-ins are never written — not even in memory. Provider state
            // is seeded from DEFAULT_TEMPLATES by reference, so the rich-object
            // mutation below would edit the module constant for the rest of the
            // page lifetime (S32 template removal spec §6).
            if (!tpl.isCustom) return prevTemplates;
            // Deep copy to be safe
            const newTpl = { ...tpl, exercises: [...tpl.exercises] };

            const exIndex = resolveSyncTargetIndex(newTpl, exLocator);
            if (exIndex === -1 || !newTpl.exercises[exIndex]) return prevTemplates; // Mismatch?

            const tplEx = newTpl.exercises[exIndex];

            // Check if legacy (number) or rich (array)
            if (Array.isArray(tplEx.sets)) {
                // setIndex is positional, and removing a SET in prep shifts the
                // survivors exactly as removing an exercise shifts the rows —
                // the same defect one level down, pre-existing since the S25.3
                // per-set remove (S32 re-review round 2, P2). Sets have no ids
                // to match on, so an unequal count is the only signal that the
                // positions no longer correspond. Fail closed on it.
                if (tplEx.sets.length !== exLocator?.setCount) return prevTemplates;
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
        if (!activeWorkout) return;

        let updates = { completed: !currentStatus };

        // PR CHECK (Phase E)
        if (!currentStatus) { // We are marking as COMPLETE
            const ex = activeWorkout.exercises.find(e => e.id === exerciseInstanceId);
            const set = ex?.sets.find(s => s.id === setId);

            // Warm-up sets are never PR-eligible — complete them and run the
            // rest timer as normal, but skip the PR check entirely. Sets
            // predating setType (undefined) count as 'normal' and are checked.
            const isWarmup = (set?.setType || 'normal') === 'warmup';

            if (ex && set && !isWarmup) {
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
            timerApiRef.current?.stopWorkTimer();
            // Start rest timer
            timerApiRef.current?.startRestTimer(); // Explicitly use default
        } else {
            // Un-completing logic? Maybe stop rest timer
            timerApiRef.current?.skipRest();
        }
    };

    // --- Single canonical template-write path (S27 spec §B). ---
    // Progression apply and the in-place template save (queued Prompt B) are
    // thin transforms over this; there must never be a second write path.
    // Returns { ok, error?, template? } — callers branch on it (decision 9).
    // Local persistence is the success criterion (localStorage is the source
    // of truth app-wide); the cloud push is best-effort with the SyncQueue
    // fallback, exactly like every other push in this file.
    const writeTemplate = async (templateId, transformFn) => {
        if (!currentProfile) return { ok: false, error: 'No active profile.' };
        const current = templates.find(t => t.id === templateId);
        if (!current) {
            return { ok: false, error: 'That template no longer exists — it may have been deleted.' };
        }
        if (!current.isCustom) {
            return { ok: false, error: 'Built-in templates cannot be modified.' };
        }

        let nextTemplate;
        try {
            nextTemplate = transformFn(current);
        } catch {
            nextTemplate = null;
        }
        if (!nextTemplate) {
            return { ok: false, error: 'Could not update the template.' };
        }

        setTemplates(prev => prev.map(t => (t.id === templateId ? nextTemplate : t)));

        const stored = StorageService.loadCustomTemplates(currentProfile.id);
        const storedIndex = stored.findIndex(t => t.id === templateId);
        if (storedIndex !== -1) stored[storedIndex] = nextTemplate;
        else stored.push(nextTemplate);
        StorageService.saveCustomTemplates(currentProfile.id, stored);

        // Cloud push — PUT when the backend row is known, create otherwise.
        if (currentProfile?.email && ApiService.isAvailable()) {
            const uid = currentProfile.id;
            const pendingCreate = nextTemplate.backendId
                ? null
                : pendingTemplateCreatesRef.current.get(templateCreateKey(uid, templateId));
            if (pendingCreate) {
                // The row is being created right now. A second POST would make
                // a second cloud row. Keep replacing the desired payload and
                // schedule only ONE PUT behind the create, so rapid saves
                // cannot race stale updates against the newest one.
                pendingCreate.latestTemplate = nextTemplate;
                if (!pendingCreate.updateScheduled) {
                    pendingCreate.updateScheduled = true;
                    pendingCreate.promise.then(resp => {
                        if (!resp?.id) {
                            console.warn('[CloudSync] Template create returned no id; in-place update not pushed.');
                            return;
                        }
                        const withId = { ...pendingCreate.latestTemplate, backendId: resp.id };
                        return ApiService.updateCustomTemplate(resp.id, withId).catch(err => {
                            console.warn('[CloudSync] Chained template update failed (non-fatal):', err.message);
                            // Re-read rather than queue `withId`: a newer direct
                            // save may have landed while this PUT was in flight,
                            // and replaying the captured payload would restore an
                            // exercise the user removed (S32 code review, H2).
                            const latest = StorageService.loadCustomTemplates(uid).find(t => t.id === templateId);
                            SyncQueue.enqueue({
                                type: 'template_update',
                                key: templateId,
                                payload: latest ? { ...latest, backendId: resp.id } : withId,
                                uid
                            });
                        });
                    }).catch(() => { /* the create's own handler queued the latest stored payload */ });
                }
                return { ok: true, template: nextTemplate };
            }
            const push = nextTemplate.backendId
                ? ApiService.updateCustomTemplate(nextTemplate.backendId, nextTemplate)
                : trackTemplateCreate(uid, templateId, ApiService.saveCustomTemplate(nextTemplate));
            push.then(resp => {
                if (resp?.id && !nextTemplate.backendId) adoptTemplateBackendId(uid, templateId, resp.id);
            }).catch(err => {
                console.warn('[CloudSync] Template update failed (non-fatal):', err.message);
                SyncQueue.enqueue({
                    type: nextTemplate.backendId ? 'template_update' : 'template',
                    key: templateId,
                    // The latest stored payload, not the one this call sent: a
                    // newer save may have landed while the request was out.
                    payload: StorageService.loadCustomTemplates(uid).find(t => t.id === templateId) || nextTemplate,
                    uid
                });
            });
        }

        return { ok: true, template: nextTemplate };
    };

    // Recommendation objects carry a positional exerciseIndex captured at
    // detection time; re-verify it against the catalog id in case the
    // template changed shape (or the workout skipped a missing exercise).
    const resolveTemplateExerciseIndex = (template, rec) => {
        const itemIdAt = (i) => {
            const item = template.exercises?.[i];
            return typeof item === 'string' ? item : item?.id;
        };
        if (itemIdAt(rec.exerciseIndex) === rec.exerciseId) return rec.exerciseIndex;
        return (template.exercises || []).findIndex((item) =>
            (typeof item === 'string' ? item : item?.id) === rec.exerciseId
        );
    };

    // Apply a progression recommendation to its source template. Runs
    // post-finish, so it must never read activeWorkout (S27 spec §A —
    // the old applyProgression died on exactly that).
    const applyRecommendation = async (rec) => {
        if (!rec?.templateId || rec.newWeight === undefined || rec.exerciseId === undefined) {
            return { ok: false, error: 'This recommendation cannot be applied.' };
        }
        return writeTemplate(rec.templateId, (template) => {
            const exIdx = resolveTemplateExerciseIndex(template, rec);
            if (exIdx === -1) return null; // exercise no longer in the template
            const item = template.exercises[exIdx];
            if (typeof item === 'string' || !Array.isArray(item.sets)) {
                return null; // legacy shape: no per-set weights to write
            }
            // Decision 1: write EVERY working set, not just the last. Template
            // sets carry no setType yet (spec §B / decision 4 pending), so
            // until that ships every template set counts as a working set.
            const nextItem = {
                ...item,
                sets: item.sets.map(s => ({ ...s, weight: rec.newWeight })),
            };
            const exercisesCopy = [...template.exercises];
            exercisesCopy[exIdx] = nextItem;
            return { ...template, exercises: exercisesCopy };
        });
    };

    const prepValidation = getPrepValidation(activeWorkout);

    // Start the guided session (transition from prep to active)
    const startGuidedSession = () => {
        if (!activeWorkout || !prepValidation.canStartGuidedWorkout) return false;

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
        return true;
    };

    // Freeze the session in place (first-responder use case). Stops both timers
    // in place — preserving their remaining time, unlike skipRest which zeroes
    // the rest countdown — and flags the workout as paused; localStorage
    // persistence already runs on every activeWorkout change, so a paused
    // session survives reloads.
    const pauseWorkout = () => {
        if (!activeWorkout) return;
        timerApiRef.current?.pauseAllTimers?.();
        setActiveWorkout(prev => prev ? ({
            ...prev,
            status: 'paused',
            pausedAt: new Date().toISOString()
        }) : prev);
    };

    const resumeWorkout = () => {
        if (!activeWorkout) return;
        setActiveWorkout(prev => {
            if (!prev) return prev;
            // Accumulate this pause interval so finishWorkout can report the
            // true active duration. Guard against a missing/garbled pausedAt
            // (e.g. a paused session persisted by the pre-S13 build).
            const pausedAtMs = prev.pausedAt ? new Date(prev.pausedAt).getTime() : NaN;
            const pauseMs = Number.isFinite(pausedAtMs)
                ? Math.max(0, Date.now() - pausedAtMs)
                : 0;
            return {
                ...prev,
                status: 'active',
                pausedAt: null,
                totalPausedMs: (prev.totalPausedMs || 0) + pauseMs
            };
        });
        timerApiRef.current?.resumeTimers?.();
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
            completed: false,
            // Always 'normal', never copied from the previous set — a warmup
            // must not silently propagate onto added working sets.
            setType: 'normal'
        };

        return ActiveWorkoutService.addSet(prev, { exerciseInstanceId, newSet });
    });
};


    const removeSet = (exerciseInstanceId, setId) => {
        setActiveWorkout(prev => {
            if (!prev || prev.status !== 'preparing') return prev;
            const exercise = prev.exercises.find(item => item.id === exerciseInstanceId);
            if (!exercise || (exercise.sets || []).length <= 1) return prev;
            return ActiveWorkoutService.removeSet(prev, { exerciseInstanceId, setId });
        });
    };


    // Prep-only, and never the last exercise — the same two-layer guard as
    // removeSet (the service refuses the final one independently). An unknown
    // instance id returns prev untouched rather than silently filtering.
    const removeExerciseFromWorkout = (exerciseInstanceId) => {
        setActiveWorkout(prev => {
            if (!prev || prev.status !== 'preparing') return prev;
            const list = prev.exercises || [];
            if (list.length <= 1) return prev;
            if (!list.some(item => item?.id === exerciseInstanceId)) return prev;
            return ActiveWorkoutService.removeExercise(prev, { exerciseInstanceId });
        });
    };

    const addCustomExercise = (newExercise) => {
        const exerciseWithId = { ...newExercise, id: 'ex_custom_' + Date.now() };
        const updatedList = [...exercises, exerciseWithId];
        setExercises(updatedList);

        const customExercises = StorageService.loadCustomExercises(currentProfile?.id);
        customExercises.push(exerciseWithId);
        StorageService.saveCustomExercises(currentProfile?.id, customExercises);

        // Cloud push (best-effort, fire-and-forget so the creation UI stays
        // synchronous). Failures land in the retry queue.
        if (currentProfile?.email && ApiService.isAvailable()) {
            const uid = currentProfile.id;
            ApiService.saveCustomExercise(exerciseWithId)
                .then(resp => {
                    if (resp?.id) {
                        const stored = StorageService.loadCustomExercises(uid);
                        const idx = stored.findIndex(e => e.id === exerciseWithId.id);
                        if (idx !== -1) {
                            stored[idx].backendId = resp.id;
                            StorageService.saveCustomExercises(uid, stored);
                        }
                    }
                })
                .catch(err => {
                    console.warn('[CloudSync] Exercise push failed (non-fatal):', err.message);
                    SyncQueue.enqueue({
                        type: 'exercise',
                        key: exerciseWithId.id,
                        payload: exerciseWithId,
                        uid
                    });
                });
        }
    };

    const addWeightEntry = async (weight) => {
        const entry = {
            date: new Date().toISOString(),
            weight: parseFloat(weight)
        };
        setWeightHistory(prev => [...prev, entry]);
        // Push to backend for cloud users, preserving the recorded_at timestamp
        if (currentProfile?.email && ApiService.isAvailable()) {
            try {
                await ApiService.addWeightEntry(parseFloat(weight), entry.date);
            } catch (err) {
                console.warn('[CloudSync] Weight push failed (non-fatal):', err.message);
                SyncQueue.enqueue({
                    type: 'weight',
                    key: entry.date,
                    payload: { weight: entry.weight, date: entry.date },
                    uid: currentProfile.id
                });
            }
        }
    };

    // --- FOOD LOG (nutrition) ---
    // Every entry gets a frontend-generated client_id before it goes anywhere
    // (offline-first, same duplicate-prevention pattern as workout_history).
    // All four entry paths (manual/photo/barcode/label) funnel through here.
    const addFoodLogEntry = async (entry) => {
        const clientId = 'food_' + generateId();
        const newEntry = {
            id: clientId,
            client_id: clientId,
            backendId: null,
            logged_at: entry.logged_at || new Date().toISOString(),
            description: entry.description,
            calories: Math.max(0, Math.round(Number(entry.calories) || 0)),
            protein_g: entry.protein_g ?? null,
            carbs_g: entry.carbs_g ?? null,
            fat_g: entry.fat_g ?? null,
            source: entry.source || 'manual',
            confidence: entry.confidence ?? null,
            barcode: entry.barcode ?? null,
            items: entry.items ?? null
        };
        setFoodLog(prev => [...prev, newEntry]
            .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at)));

        if (currentProfile?.email && ApiService.isAvailable()) {
            try {
                const saved = await ApiService.createFoodLog(newEntry);
                if (saved?.id) {
                    setFoodLog(prev => prev.map(e =>
                        e.client_id === clientId ? { ...e, backendId: saved.id } : e
                    ));
                }
            } catch (err) {
                console.warn('[CloudSync] Food log push failed (non-fatal):', err.message);
                SyncQueue.enqueue({
                    type: 'food_log',
                    key: clientId,
                    payload: newEntry,
                    uid: currentProfile.id
                });
            }
        }
        return newEntry;
    };

    const updateFoodLogEntry = async (entryId, updates) => {
        const existing = foodLog.find(e => e.id === entryId);
        if (!existing) return;
        // Only the user-correctable fields are editable (mirrors the backend's
        // FoodLogUpdate schema) — provenance fields are fixed at creation.
        const { logged_at, description, calories, protein_g, carbs_g, fat_g } = {
            ...existing, ...updates
        };
        const updated = { ...existing, logged_at, description, calories, protein_g, carbs_g, fat_g };
        setFoodLog(prev => prev.map(e => (e.id === entryId ? updated : e))
            .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at)));

        if (currentProfile?.email && ApiService.isAvailable()) {
            if (existing.backendId) {
                try {
                    await ApiService.updateFoodLog(existing.backendId, updated);
                } catch (err) {
                    console.warn('[CloudSync] Food log update failed (non-fatal):', err.message);
                    SyncQueue.enqueue({
                        type: 'food_log_update',
                        key: updated.client_id || entryId,
                        payload: updated,
                        uid: currentProfile.id
                    });
                }
            } else {
                // Row created offline — its backend UUID is unknown here. The
                // executor resolves it by client_id (after any pending create
                // flushes first, by queue order).
                SyncQueue.enqueue({
                    type: 'food_log_update',
                    key: updated.client_id || entryId,
                    payload: updated,
                    uid: currentProfile.id
                });
                SyncQueue.flush();
            }
        }
        return updated;
    };

    const deleteFoodLogEntry = async (entryId) => {
        const existing = foodLog.find(e => e.id === entryId);
        if (!existing) return;
        setFoodLog(prev => prev.filter(e => e.id !== entryId));

        if (currentProfile?.email && ApiService.isAvailable()) {
            if (existing.backendId) {
                try {
                    await ApiService.deleteFoodLog(existing.backendId);
                } catch (err) {
                    console.warn('[CloudSync] Food log delete failed (non-fatal):', err.message);
                    SyncQueue.enqueue({
                        type: 'food_log_delete',
                        key: existing.client_id || entryId,
                        payload: { backendId: existing.backendId, client_id: existing.client_id },
                        uid: currentProfile.id
                    });
                }
            } else if (existing.client_id) {
                // May have been created server-side via the retry queue without
                // a local backendId — enqueue a delete that resolves by
                // client_id; a no-match resolves as a clean no-op.
                SyncQueue.enqueue({
                    type: 'food_log_delete',
                    key: existing.client_id,
                    payload: { backendId: null, client_id: existing.client_id },
                    uid: currentProfile.id
                });
                SyncQueue.flush();
            }
        }
    };

    const updateWorkoutNotes = (notes) => {
        if (!activeWorkout) return;
        setActiveWorkout(prev => ({
            ...prev,
            notes
        }));
    };

    // Per-set snapshot of a workout in template shape. Single source for both
    // template-create paths and the prep-screen in-place update (S28).
    const templateExercisesFromWorkout = (workout) => workout.exercises.map(ex => ({
        id: ex.exercise.id,
        // Save detailed set info so it can be restored
        sets: ex.sets.map(s => ({
            weight: s.weight,
            targetReps: s.reps > 0 ? s.reps : (s.targetReps || 0), // Use performed reps as next target, or fallback
            targetDistance: s.distance > 0 ? s.distance : (s.targetDistance || 0),
            targetTime: s.time > 0 ? s.time : (s.targetTime || 0)
        }))
    }));

    const saveWorkoutAsTemplate = async (templateName) => {
        if (!activeWorkout) return;
        if (!currentProfile) {
            alert("Please select a profile to save templates.");
            return;
        }

        const newTemplate = {
            id: 'tpl_custom_' + generateId(), // Robust ID
            name: templateName,
            isCustom: true,
            exercises: templateExercisesFromWorkout(activeWorkout)
        };

        const updatedTemplates = [...templates, newTemplate];
        setTemplates(updatedTemplates);

        // Persist to Profile
        // Only save the CUSTOM ones to storage (filter out defaults or just append to existing storage list)
        // Better: Read storage, append, write.
        const storedTemplates = StorageService.loadCustomTemplates(currentProfile.id);
        const newStored = [...storedTemplates, newTemplate];
        StorageService.saveCustomTemplates(currentProfile.id, newStored);

        // Cloud push (Google OAuth users only) — best-effort, non-fatal.
        // Capture the backend UUID so a later delete can target the right row.
        if (currentProfile?.email && ApiService.isAvailable()) {
            try {
                const backendResponse = await ApiService.saveCustomTemplate(newTemplate);
                if (backendResponse?.id) {
                    newTemplate.backendId = backendResponse.id;
                    // Persist the backendId onto the stored copy.
                    const stored = StorageService.loadCustomTemplates(currentProfile.id);
                    const idx = stored.findIndex(t => t.id === newTemplate.id);
                    if (idx !== -1) {
                        stored[idx].backendId = backendResponse.id;
                        StorageService.saveCustomTemplates(currentProfile.id, stored);
                    }
                }
            } catch (err) {
                console.warn('[CloudSync] Template save failed (non-fatal):', err.message);
                SyncQueue.enqueue({
                    type: 'template',
                    key: newTemplate.id,
                    payload: newTemplate,
                    uid: currentProfile.id
                });
            }
        }
    };

    const deleteTemplate = async (templateId) => {
        if (!currentProfile) return;

        // Read storage once, capturing the backend UUID BEFORE the local removal
        // (a fresh re-load after removal would no longer find the template).
        const storedTemplates = StorageService.loadCustomTemplates(currentProfile.id);
        const target = storedTemplates.find(t => t.id === templateId);

        // Remove from state
        setTemplates(prev => prev.filter(t => t.id !== templateId));

        // Remove from storage
        const updatedStored = storedTemplates.filter(t => t.id !== templateId);
        StorageService.saveCustomTemplates(currentProfile.id, updatedStored);

        // Cloud delete (Google OAuth users only) — best-effort, non-fatal.
        // Targets the backend UUID captured at save/pull time.
        if (target?.backendId && currentProfile?.email && ApiService.isAvailable()) {
            try {
                await ApiService.deleteCustomTemplate(target.backendId);
            } catch (err) {
                console.warn('[CloudSync] Template delete failed (non-fatal):', err.message);
            }
        }
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

        // Cloud push — this is the PRIMARY template-creation path (the "Build
        // My Own" builder) and previously never synced. Mirrors the
        // saveWorkoutAsTemplate push; fire-and-forget so the caller keeps its
        // synchronous return value. Failures land in the retry queue.
        if (currentProfile?.email && ApiService.isAvailable()) {
            const uid = currentProfile.id;
            trackTemplateCreate(uid, newTemplate.id, ApiService.saveCustomTemplate(newTemplate))
                .then(resp => {
                    if (resp?.id) adoptTemplateBackendId(uid, newTemplate.id, resp.id);
                })
                .catch(err => {
                    console.warn('[CloudSync] Template push failed (non-fatal):', err.message);
                    SyncQueue.enqueue({
                        type: 'template',
                        key: newTemplate.id,
                        // Latest stored payload: an in-place save may have
                        // landed while this create was out (decision D-ii).
                        payload: StorageService.loadCustomTemplates(uid).find(t => t.id === newTemplate.id) || newTemplate,
                        uid
                    });
                });
        }

        return newTemplate;
    };

    // Prep-screen save (S28 spec: docs/template_save_update_spec_s28.md).
    // The NAME decides update vs fork: own custom template with an unchanged
    // name updates in place (id/backendId preserved); any other case creates.
    // Built-ins are never written — an unchanged built-in name is refused.
    // Local persistence is the success criterion (ARCHITECTURE §14); the
    // cloud leg inside writeTemplate/saveCustomTemplate stays fire-and-forget
    // with SyncQueue fallback.
    const saveTemplateFromPrep = async (name) => {
        if (!activeWorkout) return { ok: false, error: 'No active workout.' };
        if (!currentProfile) return { ok: false, error: 'Select a profile to save templates.' };
        const trimmed = (name || '').trim();
        if (!trimmed) return { ok: false, error: 'The template needs a name.' };

        const source = activeWorkout.sourceTemplateId
            ? templates.find(t => t.id === activeWorkout.sourceTemplateId)
            : null;

        if (source && !source.isCustom && trimmed === source.name) {
            return { ok: false, error: `"${source.name}" is a built-in template. Change the name to save your own copy.` };
        }

        if (source && source.isCustom && trimmed === source.name) {
            const result = await writeTemplate(source.id, tpl => ({
                ...tpl,
                exercises: templateExercisesFromWorkout(activeWorkout)
            }));
            return result.ok ? { ...result, mode: 'updated' } : result;
        }

        // Fork or brand-new: reuse the existing create path (synchronous
        // local write, fire-and-forget cloud).
        const created = saveCustomTemplate(trimmed, templateExercisesFromWorkout(activeWorkout));
        if (!created) return { ok: false, error: 'Could not save the template.' };
        // Re-point the session at the saved copy so live set edits
        // (syncToTemplate) and post-workout recommendations target it —
        // the original template must stay untouched from here on.
        setActiveWorkout(prev => (prev ? { ...prev, sourceTemplateId: created.id } : prev));
        return { ok: true, template: created, mode: 'created' };
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

        if (currentProfile?.email && ApiService.isAvailable()) {
            const uid = currentProfile.id;
            ApiService.saveAssessment(newAssessment)
                .then(resp => {
                    if (!resp?.id) return;
                    const stored = StorageService.loadAssessments(uid);
                    const idx = stored.findIndex(item => item.id === newAssessment.id);
                    if (idx !== -1) {
                        stored[idx].backendId = resp.id;
                        StorageService.saveAssessments(uid, stored);
                    }
                })
                .catch(err => {
                    console.warn('[CloudSync] Assessment push failed (non-fatal):', err.message);
                    SyncQueue.enqueue({
                        type: 'assessment',
                        key: newAssessment.id,
                        payload: newAssessment,
                        uid,
                    });
                });
        }
    };

    // --- 10. HISTORY LOOKUP (Previous Stats) ---


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
                    const existing = updatedExercises.find(e => {
                        const en = String(e.name ?? '').toLowerCase().trim();
                        const xn = String(exData.name ?? '').toLowerCase().trim();
                        return en === xn || en === xn + 's' || en + 's' === xn;
                    });
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
            if (wDate < cutoff || workout.status !== 'completed') return;

            if (!workout.exercises) return;

            workout.exercises.forEach(exData => {
                let group = exData.exercise.primary_muscle;

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
                // Warm-ups don't count toward training volume. Sets predating
                // setType (undefined) are treated as 'normal' and counted.
                if (set.setType === 'warmup') return setTotal;
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

    // Derived: cloud sync is active when an auth token exists AND an API URL is configured.
    const isCloudSynced = !!(StorageService.loadAuthToken() && import.meta.env.VITE_API_URL);

    // Memoized so timer ticks (now in TimerContext) and unrelated parent
    // re-renders don't hand consumers a brand-new value object every render.
    // Setter/context fns are intentionally omitted from the deps below — see the
    // eslint-disable on the dependency array.
    const getCompatibleExercises = () => {
        const equipmentList = getActiveEquipmentList(
            activeEquipmentProfileId,
            DEFAULT_EQUIPMENT_PROFILES,
            customEquipmentItems,
            sessionEquipmentOverride
        );
        return exercises.filter(ex =>
            isExerciseCompatible(ex, equipmentList)
        );
    };

    const saveEquipmentEnvironment = ({ name, equipment, source = 'manual' }) => {
        if (!currentProfile || !Array.isArray(equipment) || equipment.length === 0) return null;
        const normalizedName = String(name || 'Current location').trim().slice(0, 60) || 'Current location';
        const normalizedEquipment = [...new Set(equipment.map(String))];
        const next = {
            id: 'env_' + generateId(),
            name: normalizedName,
            equipment: normalizedEquipment,
            source,
            updatedAt: new Date().toISOString()
        };
        equipmentEnvironmentsEditedRef.current = true;
        setEquipmentEnvironments(prev => normalizeEquipmentEnvironments([
            next,
            ...prev.filter(env => env.name.toLowerCase() !== normalizedName.toLowerCase()),
        ]));
        setSessionEquipmentOverride(normalizedEquipment);
        return next;
    };

    const activateEquipmentEnvironment = (environmentId) => {
        const environment = equipmentEnvironments.find(env => env.id === environmentId);
        if (!environment) return false;
        setSessionEquipmentOverride(environment.equipment);
        return true;
    };

    const deleteEquipmentEnvironment = (environmentId) => {
        equipmentEnvironmentsEditedRef.current = true;
        setEquipmentEnvironments(prev => prev.filter(env => env.id !== environmentId));
    };

    const value = useMemo(() => ({
        activeWorkout,
        prepValidation,
        exercises,
        templates,
        history,
        isCloudSynced,
        profiles,
        currentProfile,
        setCurrentProfile,
        authChecked,
        canSyncToBackend,
        theme,
        setTheme,
        units,
        setUnits,
        soundEnabled,
        setSoundEnabled,
        coachPersonality,
        setCoachPersonality,
        coachVoiceId,
        setCoachVoiceId,
        experienceLevel,
        setExperienceLevel,
        startWorkout,
        startWorkoutFromTemplate,
        finishWorkout,
        cancelWorkout,
        pauseWorkout,
        resumeWorkout,
        addExerciseToWorkout,
        removeExerciseFromWorkout,
        addSet,
        updateSet,
        removeSet,
        toggleSetComplete,
        writeTemplate,
        applyRecommendation,
        calculateVolume,
        createProfile,
        switchProfile,
        deleteProfile,
        updateProfile,
        addCustomExercise,
        saveWorkoutAsTemplate,
        saveTemplateFromPrep,
        // Exported so the prep screen can serialize exactly what a save
        // would persist (dirty-state detection) — never re-derive this shape.
        templateExercisesFromWorkout,
        deleteTemplate,
        saveCustomTemplate, // NEW
        exportData, // NEW
        importData, // NEW
        updateWorkoutNotes,
        userStats,
        setUserStats,
        weightHistory,
        addWeightEntry,
        foodLog,
        addFoodLogEntry,
        updateFoodLogEntry,
        deleteFoodLogEntry,
        deleteWorkout,
        importProgram, // NEW
        assessments,   // NEW
        saveAssessment, // NEW
        lastPerformance: getLastExerciseStats, // Alias for legacy if needed, or just use below
        getLastExerciseStats, // NEW
        checkPersonalRecord, // NEW - Phase E
        getMuscleVolumeDistribution, // NEW - Phase B
        // Guided Mode Exports
        currentExerciseIndex,
        setCurrentExerciseIndex,
        currentSetIndex,
        setCurrentSetIndex,
        startGuidedSession,

        // Smart Progression Exports
        smartProgressionEnabled,
        setSmartProgressionEnabled,
        progressionMode,
        setProgressionMode,
        progressionType,
        setProgressionType,
        progressionIncrement,
        setProgressionIncrement,

        // Equipment Profile System
        equipmentProfiles: DEFAULT_EQUIPMENT_PROFILES,
        activeEquipmentProfileId,
        setActiveEquipmentProfileId,
        customEquipmentItems,
        setCustomEquipmentItems,
        equipmentEnvironments,
        saveEquipmentEnvironment,
        activateEquipmentEnvironment,
        deleteEquipmentEnvironment,
        sessionEquipmentOverride,
        setSessionEquipmentOverride,
        getCompatibleExercises
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [
        activeWorkout, exercises, templates, history,
        profiles, currentProfile, theme, units,
        soundEnabled, coachPersonality, coachVoiceId, userStats, weightHistory,
        foodLog,
        assessments, currentExerciseIndex, currentSetIndex,
        smartProgressionEnabled, progressionMode,
        progressionType, progressionIncrement,
        authChecked,
        activeEquipmentProfileId, customEquipmentItems, equipmentEnvironments, sessionEquipmentOverride,
    ]);

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
