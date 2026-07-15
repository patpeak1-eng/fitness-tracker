import { isAvailable, saveWorkout, saveActiveWorkout, clearActiveWorkout } from './ApiService';
import { DEFAULT_VOICE_ID } from '../constants/voiceIds';
import { DEFAULT_PERSONALITY } from '../constants/coachPersonalities';
import { STORAGE_KEYS } from '../constants/storageKeys';

const LEGACY_PREFIX = 'fitness_';
const USER_SEGMENT = '_user_';

// Coach settings use bare (non-fitness_-prefixed) keys, so the prefix-based
// snapshot filter misses them — include them explicitly in backup/restore.
const COACH_KEYS = Object.values(STORAGE_KEYS);

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
    defaultTimers: 'fitness_default_timers',
    stats: 'fitness_stats',
    weightHistory: 'fitness_weight_history',
    exercisePrefs: 'fitness_exercise_prefs',
    smartProg: 'fitness_smart_prog',
    progMode: 'fitness_prog_mode',
    progType: 'fitness_prog_type',
    progInc: 'fitness_prog_inc',
    customTemplates: 'fitness_custom_templates',
    customExercises: 'fitness_custom_exercises',
    equipmentProfile: 'fitness_equipment_profile',
    customEquipment: 'fitness_custom_equipment',
    experienceLevel: 'fitness_experience_level',
    foodLog: 'fitness_food_log',
    nutritionTargets: 'fitness_nutrition_targets'
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
    KEY.defaultTimers,
    KEY.stats,
    KEY.weightHistory,
    KEY.exercisePrefs,
    KEY.smartProg,
    KEY.progMode,
    KEY.progType,
    KEY.progInc,
    KEY.customTemplates,
    KEY.customExercises,
    KEY.equipmentProfile,
    KEY.customEquipment,
    KEY.experienceLevel,
    KEY.foodLog,
    KEY.nutritionTargets
];

const safeParse = (raw, fallback) => {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

// localStorage.setItem throws (QuotaExceededError) when the store is full.
// Persist writes run inside React effects, where an uncaught throw takes down
// the tree — warn and carry on instead. Returns false on failure.
const safeSetItem = (key, value) => {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn(`[Storage] write failed for ${key} (quota?):`, e);
        return false;
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
    safeSetItem(key, String(value));

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
        safeSetItem(next, legacyValue);
    }
    localStorage.removeItem(legacy);
};

const StorageService = {
    KEY,

    startupCleanup(profiles = []) {
        localStorage.removeItem(KEY.activeWorkout);

        profiles.forEach(profile => {
            const uid = profile?.id;
            if (!uid) return;
            PROFILE_SCOPED_BASE_KEYS.forEach(baseKey => migrateLegacyProfileKey(baseKey, uid));
        });
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

    // --- AI Coach settings (device-level, not profile-scoped for now) ---
    // Keys come from STORAGE_KEYS (single source of truth for coach_*).
    // Booleans are persisted as the strings "true"/"false".
    loadCoachEnabled() {
        return readRaw(STORAGE_KEYS.COACH_ENABLED, 'true', { global: true }) !== 'false';
    },
    saveCoachEnabled(enabled) {
        writeRaw(STORAGE_KEYS.COACH_ENABLED, !!enabled, { global: true });
    },

    loadCoachPersonality() {
        return readRaw(STORAGE_KEYS.COACH_PERSONALITY, DEFAULT_PERSONALITY, { global: true });
    },
    saveCoachPersonality(personality) {
        writeRaw(STORAGE_KEYS.COACH_PERSONALITY, personality, { global: true });
    },

    loadCoachVoiceId() {
        return readRaw(STORAGE_KEYS.COACH_VOICE_ID, DEFAULT_VOICE_ID, { global: true });
    },
    saveCoachVoiceId(voiceId) {
        writeRaw(STORAGE_KEYS.COACH_VOICE_ID, voiceId, { global: true });
    },

    loadCoachVoiceInput() {
        return readRaw(STORAGE_KEYS.COACH_VOICE_INPUT, 'false', { global: true }) === 'true';
    },
    saveCoachVoiceInput(enabled) {
        writeRaw(STORAGE_KEYS.COACH_VOICE_INPUT, !!enabled, { global: true });
    },

    loadCoachAutoplay() {
        return readRaw(STORAGE_KEYS.COACH_AUTOPLAY, 'true', { global: true }) !== 'false';
    },
    saveCoachAutoplay(enabled) {
        writeRaw(STORAGE_KEYS.COACH_AUTOPLAY, !!enabled, { global: true });
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
            // Don't auto-create if the user explicitly logged out — let the auth gate fire.
            if (this.isLoggedOut()) {
                this.startupCleanup([]);
                return [];
            }

            // Original auto-create behavior for first-time users.
            const defaultProfile = {
                id: 'user_default',
                name: 'Main User',
                color: '#ff5c2a',
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
            // Timers live in one JSON key so the rest/work pair is written
            // atomically; fall back to the legacy split keys for older data.
            defaultRestTime: Number(
                readJSON(KEY.defaultTimers, {}, { uid }).rest ??
                readRaw(KEY.defaultRest, '45', { uid })
            ),
            defaultWorkTime: Number(
                readJSON(KEY.defaultTimers, {}, { uid }).work ??
                readRaw(KEY.defaultWork, '45', { uid })
            ),
            userStats: readJSON(KEY.stats, {
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
            }, { uid }),
            weightHistory: readJSON(KEY.weightHistory, [], { uid }),
            exercisePrefs: readJSON(KEY.exercisePrefs, {}, { uid }),
            smartProgressionEnabled: readRaw(KEY.smartProg, 'false', { uid }) === 'true',
            progressionMode: readRaw(KEY.progMode, 'linear', { uid }),
            progressionType: readRaw(KEY.progType, 'fixed', { uid }),
            progressionIncrement: Number(readRaw(KEY.progInc, '5', { uid })),
            equipmentProfileId: readRaw(KEY.equipmentProfile, 'full_gym', { uid }),
            customEquipmentItems: readJSON(KEY.customEquipment, [], { uid }),
            experienceLevel: readRaw(KEY.experienceLevel, 'intermediate', { uid }),
            foodLog: readJSON(KEY.foodLog, [], { uid })
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
    saveEquipmentProfile(uid, profileId) { writeRaw(KEY.equipmentProfile, profileId, { uid }); },
    saveCustomEquipment(uid, items) { writeJSON(KEY.customEquipment, items, { uid }); },
    saveSound(uid, soundEnabled) { writeRaw(KEY.sound, soundEnabled, { uid }); },
    saveDefaultTimers(uid, rest, work) {
        // Single-key JSON write: localStorage.setItem is atomic, so rest/work
        // can never be persisted mismatched. Legacy split keys are removed so
        // the load fallback can't resurrect stale values.
        writeJSON(KEY.defaultTimers, { rest, work }, { uid });
        remove(KEY.defaultRest, { uid });
        remove(KEY.defaultWork, { uid });
    },
    saveUserStats(uid, stats) { writeJSON(KEY.stats, stats, { uid }); },
    saveWeightHistory(uid, weightHistory) { writeJSON(KEY.weightHistory, weightHistory, { uid }); },
    saveFoodLog(uid, foodLog) { writeJSON(KEY.foodLog, foodLog, { uid }); },
    // Optional manual daily targets (spec: no TDEE calculator in v1) —
    // page-local read/write, deliberately not WorkoutContext state.
    loadNutritionTargets(uid) { return readJSON(KEY.nutritionTargets, null, { uid }); },
    saveNutritionTargets(uid, targets) { writeJSON(KEY.nutritionTargets, targets, { uid }); },
    saveExercisePrefs(uid, prefs) { writeJSON(KEY.exercisePrefs, prefs, { uid }); },
    saveExperienceLevel(uid, level) { writeRaw(KEY.experienceLevel, level, { uid }); },
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
            if (key && (key.startsWith(LEGACY_PREFIX) || COACH_KEYS.includes(key))) {
                data[key] = localStorage.getItem(key);
            }
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
            if (key && (key.startsWith(LEGACY_PREFIX) || COACH_KEYS.includes(key))) {
                toRemove.push(key);
            }
        }
        toRemove.forEach(k => localStorage.removeItem(k));

        // Quota-guarded writes, but a restore must not fail silently: the old
        // keys are already cleared above, so any failed write means a partial
        // restore — surface it to the import UI instead of swallowing it.
        const failed = Object.entries(data)
            .filter(([k, v]) => !safeSetItem(k, String(v)))
            .map(([k]) => k);
        if (failed.length > 0) {
            throw new Error(
                `Backup restore incomplete — ${failed.length} item(s) failed to write (storage full?).`
            );
        }
    },

    async syncToApi(uid) {
        if (!isAvailable()) return false;
        try {
            const state = this.loadProfileState(uid);
            // Best-effort sync — the caller need not await this; localStorage stays the source of truth.
            // Per-call failures are warned and swallowed so one bad request can't abort the rest.
            // Sync history. Only push workouts that carry a client_id:
            // locally-created workouts always have one (crypto.randomUUID at
            // creation), so a client_id-less item is a cloud-origin row that
            // is already server-side — re-posting it would bypass the
            // backend's client_id idempotency and duplicate it on every boot.
            if (state.history && state.history.length > 0) {
                const lastWorkout = state.history[0];
                if (lastWorkout.client_id) {
                    await saveWorkout(lastWorkout).catch(e => console.warn('API sync: saveWorkout failed', e));
                }
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
        safeSetItem('fitness_auth_token', token);
    },

    loadAuthToken() {
        return localStorage.getItem('fitness_auth_token');
    },

    clearAuthToken() {
        localStorage.removeItem('fitness_auth_token');
    },

    setLoggedOut() {
        safeSetItem('fitness_logged_out', 'true');
    },

    isLoggedOut() {
        return localStorage.getItem('fitness_logged_out') === 'true';
    },

    clearLoggedOut() {
        localStorage.removeItem('fitness_logged_out');
    }
};

export default StorageService;
