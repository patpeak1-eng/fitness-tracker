import { isAvailable, saveWorkout, saveActiveWorkout, clearActiveWorkout } from './ApiService';

const LEGACY_PREFIX = 'fitness_';
const USER_SEGMENT = '_user_';

const KEY = {
    profiles: 'fitness_profiles',
    currentProfileId: 'fitness_current_profile_id',
    autoSync: 'fitness_auto_sync',
    history: 'fitness_history',
    activeWorkout: 'fitness_active_workout',
    assessments: 'fitness_assessments',
    theme: 'fitness_theme',
    units: 'fitness_units',
    sound: 'fitness_sound',
    defaultRest: 'fitness_default_rest',
    defaultWork: 'fitness_default_work',
    stats: 'fitness_stats',
    weightHistory: 'fitness_weight_history',
    exercisePrefs: 'fitness_exercise_prefs',
    smartProg: 'fitness_smart_prog',
    progMode: 'fitness_prog_mode',
    progType: 'fitness_prog_type',
    progInc: 'fitness_prog_inc',
    customTemplates: 'fitness_custom_templates',
    customExercises: 'fitness_custom_exercises'
};

const PROFILE_SCOPED_BASE_KEYS = [
    KEY.history,
    KEY.activeWorkout,
    KEY.assessments,
    KEY.theme,
    KEY.units,
    KEY.sound,
    KEY.defaultRest,
    KEY.defaultWork,
    KEY.stats,
    KEY.weightHistory,
    KEY.exercisePrefs,
    KEY.smartProg,
    KEY.progMode,
    KEY.progType,
    KEY.progInc,
    KEY.customTemplates,
    KEY.customExercises
];

const safeParse = (raw, fallback) => {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const scopedKey = (baseKey, uid) => `${baseKey}${USER_SEGMENT}${uid}`;
const legacyScopedKey = (baseKey, uid) => `${baseKey}_${uid}`;

const resolveKey = (baseKey, { uid, global = false } = {}) => {
    if (!global && uid) return scopedKey(baseKey, uid);
    return baseKey;
};

const readRaw = (baseKey, fallback = null, opts = {}) => {
    const key = resolveKey(baseKey, opts);
    const value = localStorage.getItem(key);
    if (value !== null) return value;

    if (!opts.global && opts.uid) {
        const legacyValue = localStorage.getItem(legacyScopedKey(baseKey, opts.uid));
        if (legacyValue !== null) return legacyValue;
    }

    return fallback;
};

const writeRaw = (baseKey, value, opts = {}) => {
    const key = resolveKey(baseKey, opts);
    localStorage.setItem(key, String(value));

    if (!opts.global && opts.uid) {
        localStorage.removeItem(legacyScopedKey(baseKey, opts.uid));
    }
};

const readJSON = (baseKey, fallback, opts = {}) => safeParse(readRaw(baseKey, null, opts), fallback);
const writeJSON = (baseKey, value, opts = {}) => writeRaw(baseKey, JSON.stringify(value), opts);
const remove = (baseKey, opts = {}) => {
    localStorage.removeItem(resolveKey(baseKey, opts));
    if (!opts.global && opts.uid) {
        localStorage.removeItem(legacyScopedKey(baseKey, opts.uid));
    }
};

const migrateLegacyProfileKey = (baseKey, uid) => {
    const legacy = legacyScopedKey(baseKey, uid);
    const next = scopedKey(baseKey, uid);

    const legacyValue = localStorage.getItem(legacy);
    if (legacyValue !== null && localStorage.getItem(next) === null) {
        localStorage.setItem(next, legacyValue);
    }
    localStorage.removeItem(legacy);
};

const StorageService = {
    KEY,

    makeProfileKey(baseKey, uid) {
        return scopedKey(baseKey, uid);
    },

    startupCleanup(profiles = []) {
        localStorage.removeItem(KEY.activeWorkout);

        profiles.forEach(profile => {
            const uid = profile?.id;
            if (!uid) return;
            PROFILE_SCOPED_BASE_KEYS.forEach(baseKey => migrateLegacyProfileKey(baseKey, uid));
        });
    },

    readString(baseKey, fallback = null, opts = {}) {
        return readRaw(baseKey, fallback, opts);
    },

    writeString(baseKey, value, opts = {}) {
        writeRaw(baseKey, value, opts);
    },

    readJSON(baseKey, fallback, opts = {}) {
        return readJSON(baseKey, fallback, opts);
    },

    writeJSON(baseKey, value, opts = {}) {
        writeJSON(baseKey, value, opts);
    },

    remove(baseKey, opts = {}) {
        remove(baseKey, opts);
    },

    loadProfiles() {
        return readJSON(KEY.profiles, [], { global: true });
    },

    saveProfiles(profiles) {
        writeJSON(KEY.profiles, profiles, { global: true });
    },

    loadCurrentProfileId() {
        return readRaw(KEY.currentProfileId, null, { global: true });
    },

    saveCurrentProfileId(uid) {
        writeRaw(KEY.currentProfileId, uid, { global: true });
    },

    loadAutoSyncEnabled() {
        return readRaw(KEY.autoSync, 'false', { global: true }) === 'true';
    },

    saveAutoSyncEnabled(enabled) {
        writeRaw(KEY.autoSync, enabled, { global: true });
    },

    migrateLegacyData(uid) {
        if (!uid) return;

        const legacyHistory = readRaw(KEY.history, null, { global: true });
        if (legacyHistory) writeRaw(KEY.history, legacyHistory, { uid });

        const legacyTheme = readRaw(KEY.theme, null, { global: true });
        if (legacyTheme) writeRaw(KEY.theme, legacyTheme, { uid });

        const legacyUnits = readRaw(KEY.units, null, { global: true });
        if (legacyUnits) writeRaw(KEY.units, legacyUnits, { uid });

        const legacySound = readRaw(KEY.sound, null, { global: true });
        if (legacySound) writeRaw(KEY.sound, legacySound, { uid });

        const legacyActive = readRaw(KEY.activeWorkout, null, { global: true });
        if (legacyActive) writeRaw(KEY.activeWorkout, legacyActive, { uid });

        this.clearLegacyKeys();
    },

    clearLegacyKeys() {
        remove(KEY.activeWorkout, { global: true });
    },

    getOrCreateProfiles() {
        let profiles = this.loadProfiles();

        if (profiles.length === 0) {
            const defaultProfile = {
                id: 'user_default',
                name: 'Main User',
                color: '#bfff00',
                avatar: 'M'
            };
            profiles = [defaultProfile];
            this.saveProfiles(profiles);
            this.migrateLegacyData(defaultProfile.id);
        }

        this.startupCleanup(profiles);
        return profiles;
    },

    loadProfileScopedState(uid) {
        return this.loadProfileState(uid);
    },

    loadProfileState(uid) {
        let units = readRaw(KEY.units, null, { uid });
        if (units === null) {
            const legacyUnits = readRaw(KEY.units, null, { global: true });
            if (legacyUnits) {
                units = legacyUnits;
                writeRaw(KEY.units, units, { uid });
                remove(KEY.units, { global: true });
            } else {
                units = 'metric';
            }
        }

        return {
            history: readJSON(KEY.history, [], { uid }),
            activeWorkout: readJSON(KEY.activeWorkout, null, { uid }),
            assessments: readJSON(KEY.assessments, [], { uid }),
            theme: readRaw(KEY.theme, 'dark', { uid }),
            units,
            soundEnabled: readRaw(KEY.sound, 'true', { uid }) !== 'false',
            defaultRestTime: Number(readRaw(KEY.defaultRest, '45', { uid })),
            defaultWorkTime: Number(readRaw(KEY.defaultWork, '45', { uid })),
            userStats: readJSON(KEY.stats, {
                age: '',
                height: '',
                currentWeight: '',
                targetWeight: '',
                goal: 'maintenance',
                motivation: '',
                bodyFat: '',
                muscleMass: '',
                boneDensity: ''
            }, { uid }),
            weightHistory: readJSON(KEY.weightHistory, [], { uid }),
            exercisePrefs: readJSON(KEY.exercisePrefs, {}, { uid }),
            smartProgressionEnabled: readRaw(KEY.smartProg, 'false', { uid }) === 'true',
            progressionMode: readRaw(KEY.progMode, 'linear', { uid }),
            progressionType: readRaw(KEY.progType, 'fixed', { uid }),
            progressionIncrement: Number(readRaw(KEY.progInc, '5', { uid }))
        };
    },

    saveHistory(uid, history) { writeJSON(KEY.history, history, { uid }); },
    saveActiveWorkout(uid, workoutOrNull) {
        if (workoutOrNull) writeJSON(KEY.activeWorkout, workoutOrNull, { uid });
        else remove(KEY.activeWorkout, { uid });
    },
    saveAssessments(uid, assessments) { writeJSON(KEY.assessments, assessments, { uid }); },
    saveTheme(uid, theme) { writeRaw(KEY.theme, theme, { uid }); },
    saveUnits(uid, units) { writeRaw(KEY.units, units, { uid }); },
    saveSound(uid, soundEnabled) { writeRaw(KEY.sound, soundEnabled, { uid }); },
    saveDefaultTimers(uid, rest, work) {
        writeRaw(KEY.defaultRest, rest, { uid });
        writeRaw(KEY.defaultWork, work, { uid });
    },
    saveUserStats(uid, stats) { writeJSON(KEY.stats, stats, { uid }); },
    saveWeightHistory(uid, weightHistory) { writeJSON(KEY.weightHistory, weightHistory, { uid }); },
    saveExercisePrefs(uid, prefs) { writeJSON(KEY.exercisePrefs, prefs, { uid }); },
    saveProgressionSettings(uid, s) {
        writeRaw(KEY.smartProg, s.smartProgressionEnabled, { uid });
        writeRaw(KEY.progMode, s.progressionMode, { uid });
        writeRaw(KEY.progType, s.progressionType, { uid });
        writeRaw(KEY.progInc, s.progressionIncrement, { uid });
    },

    loadCustomTemplates(uid) {
        return readJSON(KEY.customTemplates, [], uid ? { uid } : { global: true });
    },

    saveCustomTemplates(uid, templates) {
        writeJSON(KEY.customTemplates, templates, uid ? { uid } : { global: true });
    },

    loadCustomExercises(uid) {
        return readJSON(KEY.customExercises, [], uid ? { uid } : { global: true });
    },

    saveCustomExercises(uid, exercises) {
        writeJSON(KEY.customExercises, exercises, uid ? { uid } : { global: true });
    },

    clearProfileData(uid) {
        PROFILE_SCOPED_BASE_KEYS.forEach(baseKey => remove(baseKey, { uid }));
    },

    exportSnapshot() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LEGACY_PREFIX)) data[key] = localStorage.getItem(key);
        }
        return data;
    },

    importSnapshot(data) {
        const keys = Object.keys(data || {});
        if (!keys.some(k => k.startsWith(LEGACY_PREFIX))) {
            throw new Error('Invalid backup file: no fitness data found.');
        }

        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LEGACY_PREFIX)) toRemove.push(key);
        }
        toRemove.forEach(k => localStorage.removeItem(k));

        Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, String(v)));
    },

    async syncToApi(uid) {
        if (!isAvailable()) return false;
        try {
            const state = this.loadProfileState(uid);
            // Best-effort sync — the caller need not await this; localStorage stays the source of truth.
            // Per-call failures are warned and swallowed so one bad request can't abort the rest.
            // Sync history
            if (state.history && state.history.length > 0) {
                const lastWorkout = state.history[0];
                await saveWorkout(lastWorkout).catch(e => console.warn('API sync: saveWorkout failed', e));
            }
            // Sync active workout
            if (state.activeWorkout) {
                await saveActiveWorkout(state.activeWorkout).catch(e => console.warn('API sync: saveActiveWorkout failed', e));
            } else {
                await clearActiveWorkout().catch(e => console.warn('API sync: clearActiveWorkout failed', e));
            }
            return true;
        } catch (e) {
            console.warn('API sync failed, localStorage is source of truth', e);
            return false;
        }
    },

    saveAuthToken(token) {
        localStorage.setItem('fitness_auth_token', token);
    },

    loadAuthToken() {
        return localStorage.getItem('fitness_auth_token');
    },

    clearAuthToken() {
        localStorage.removeItem('fitness_auth_token');
    }
};

export default StorageService;
