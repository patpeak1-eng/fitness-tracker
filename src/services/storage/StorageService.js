// src/services/storage/StorageService.js

const PREFIX = "fitness_";

const safeParse = (raw, fallback) => {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

// ---------- Internal Helpers (No 'this' dependency) ----------

const readString = (key, fallback = null) => {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
};

const writeString = (key, value) => {
    localStorage.setItem(key, String(value));
};

const readJSON = (key, fallback) => {
    return safeParse(localStorage.getItem(key), fallback);
};

const writeJSON = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const remove = (key) => {
    localStorage.removeItem(key);
};

const keyProfile = (uid, base) => {
    return `${PREFIX}${base}_${uid}`;
};

const StorageService = {
    // ---------- Exported Helpers ----------
    readString,
    writeString,
    readJSON,
    writeJSON,
    remove,
    keyProfile,

    // ---------- Global ----------
    loadProfiles() {
        return readJSON(`${PREFIX}profiles`, []);
    },

    saveProfiles(profiles) {
        writeJSON(`${PREFIX}profiles`, profiles);
    },

    loadCurrentProfileId() {
        return readString(`${PREFIX}current_profile_id`, null);
    },

    saveCurrentProfileId(uid) {
        writeString(`${PREFIX}current_profile_id`, uid);
    },

    loadAutoSyncEnabled() {
        return readString(`${PREFIX}auto_sync`, "false") === "true";
    },

    saveAutoSyncEnabled(enabled) {
        writeString(`${PREFIX}auto_sync`, enabled);
    },

    // ---------- Profile state loads ----------
    loadProfileState(uid) {
        // Migration: Units (Legacy -> Profile Scoped)
        let units = readString(keyProfile(uid, "units"), null);
        if (units === null) {
            const legacyUnits = readString(`${PREFIX}units`, null);
            if (legacyUnits) {
                units = legacyUnits;
                writeString(keyProfile(uid, "units"), units);
                remove(`${PREFIX}units`);
            } else {
                units = "metric";
            }
        }

        return {
            history: readJSON(keyProfile(uid, "history"), []),
            activeWorkout: readJSON(keyProfile(uid, "active_workout"), null),
            assessments: readJSON(keyProfile(uid, "assessments"), []),

            theme: readString(keyProfile(uid, "theme"), "dark"),
            units: units,
            soundEnabled: readString(keyProfile(uid, "sound"), "true") !== "false",

            defaultRestTime: Number(readString(keyProfile(uid, "default_rest"), "45")),
            defaultWorkTime: Number(readString(keyProfile(uid, "default_work"), "45")),

            userStats: readJSON(keyProfile(uid, "stats"), {
                age: "",
                height: "",
                currentWeight: "",
                targetWeight: "",
                goal: "maintenance",
                motivation: "",
                bodyFat: "",
                muscleMass: "",
                boneDensity: ""
            }),

            weightHistory: readJSON(keyProfile(uid, "weight_history"), []),
            exercisePrefs: readJSON(keyProfile(uid, "exercise_prefs"), {}),

            smartProgressionEnabled: readString(keyProfile(uid, "smart_prog"), "false") === "true",
            progressionMode: readString(keyProfile(uid, "prog_mode"), "linear"),
            progressionType: readString(keyProfile(uid, "prog_type"), "fixed"),
            progressionIncrement: Number(readString(keyProfile(uid, "prog_inc"), "5")),
        };
    },

    // ---------- Profile state saves (optional helpers) ----------
    saveHistory(uid, history) {
        writeJSON(keyProfile(uid, "history"), history);
    },

    saveActiveWorkout(uid, workoutOrNull) {
        const key = keyProfile(uid, "active_workout");
        if (workoutOrNull) writeJSON(key, workoutOrNull);
        else remove(key);
    },

    saveAssessments(uid, assessments) {
        writeJSON(keyProfile(uid, "assessments"), assessments);
    },

    saveTheme(uid, theme) {
        writeString(keyProfile(uid, "theme"), theme);
    },

    saveUnits(uid, units) {
        writeString(keyProfile(uid, "units"), units);
    },

    saveSound(uid, soundEnabled) {
        writeString(keyProfile(uid, "sound"), soundEnabled);
    },

    saveDefaultTimers(uid, rest, work) {
        writeString(keyProfile(uid, "default_rest"), rest);
        writeString(keyProfile(uid, "default_work"), work);
    },

    saveUserStats(uid, stats) {
        writeJSON(keyProfile(uid, "stats"), stats);
    },

    saveWeightHistory(uid, weightHistory) {
        writeJSON(keyProfile(uid, "weight_history"), weightHistory);
    },

    saveExercisePrefs(uid, prefs) {
        writeJSON(keyProfile(uid, "exercise_prefs"), prefs);
    },

    saveProgressionSettings(uid, s) {
        writeString(keyProfile(uid, "smart_prog"), s.smartProgressionEnabled);
        writeString(keyProfile(uid, "prog_mode"), s.progressionMode);
        writeString(keyProfile(uid, "prog_type"), s.progressionType);
        writeString(keyProfile(uid, "prog_inc"), s.progressionIncrement);
    },

    // ---------- Custom/global (to be scoped later) ----------
    loadCustomTemplates() {
        return readJSON(`${PREFIX}custom_templates`, []);
    },

    saveCustomTemplates(templates) {
        writeJSON(`${PREFIX}custom_templates`, templates);
    },

    loadCustomExercises() {
        return readJSON(`${PREFIX}custom_exercises`, []);
    },

    saveCustomExercises(exercises) {
        writeJSON(`${PREFIX}custom_exercises`, exercises);
    },

    // ---------- Backup ----------
    getBackupData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PREFIX)) {
                data[key] = localStorage.getItem(key);
            }
        }
        return data;
    },

    importBackupData(data) {
        const keys = Object.keys(data || {});
        if (!keys.some(k => k.startsWith(PREFIX))) {
            throw new Error("Invalid backup: no fitness_ keys");
        }

        // remove existing fitness_ keys
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PREFIX)) toRemove.push(key);
        }
        toRemove.forEach(k => localStorage.removeItem(k));

        // restore
        Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
    }
};

export default StorageService;
