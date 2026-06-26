import { createContext, useContext, useState, useEffect, useRef } from 'react';
import StorageService from '../services/StorageService';
import * as ApiService from '../services/ApiService';

// Timer state lives here, split out of WorkoutContext (H4). The rest/work
// countdowns tick every second; keeping that state in its own provider means a
// tick only re-renders useTimer() consumers, not every useWorkout() consumer.
//
// Dependency direction is ONE-WAY: TimerContext never imports WorkoutContext.
// currentProfile and soundEnabled arrive as props; WorkoutContext reaches the
// imperative timer actions through the `apiRef` bridge (it can't useTimer()
// because TimerProvider is rendered as its descendant).
export const TimerContext = createContext();

export const TimerProvider = ({ children, currentProfile, soundEnabled, apiRef, canSyncToBackend }) => {
    const [restTimer, setRestTimer] = useState({ timeLeft: 0, isActive: false, duration: 45 });
    const [workTimer, setWorkTimer] = useState({ timeLeft: 0, isActive: false, duration: 45 });
    const [defaultRestTime, setDefaultRestTime] = useState(45);
    const [defaultWorkTime, setDefaultWorkTime] = useState(45);
    const [exercisePrefs, setExercisePrefs] = useState({});

    // Latest-value ref for the sync guard so the persist effect can call it
    // without listing the prop as a dependency (avoids a redundant sync when
    // canSyncToBackend flips on auth-resolve).
    const canSyncRef = useRef(canSyncToBackend);
    canSyncRef.current = canSyncToBackend;

    // Load this profile's timer prefs (the timer slice of WorkoutContext's
    // former profile-load routine). Runs on mount and on profile switch.
    useEffect(() => {
        if (!currentProfile) return;
        const ps = StorageService.loadProfileState(currentProfile.id);
        setDefaultRestTime(ps.defaultRestTime);
        setDefaultWorkTime(ps.defaultWorkTime);
        // Timers aren't running on profile load — sync their durations to defaults.
        setRestTimer(prev => ({ ...prev, duration: ps.defaultRestTime }));
        setWorkTimer(prev => ({ ...prev, duration: ps.defaultWorkTime }));
        setExercisePrefs(ps.exercisePrefs);
    }, [currentProfile]);

    // --- Audio ---
    const playBeep = (type = 'success') => {
        if (!soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            const playNote = (freq, startTime, duration = 0.5, vol = 0.1) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);

                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;

            if (type === 'rest') {
                playNote(880.00, now, 0.4, 0.2); // A5
                playNote(1318.51, now + 0.15, 0.8, 0.2); // E6
            } else {
                playNote(1046.50, now, 0.6, 0.2);       // C6
                playNote(1318.51, now + 0.05, 0.6, 0.2); // E6
                playNote(1567.98, now + 0.1, 0.8, 0.2);  // G6
            }
        } catch (e) {
            console.error('Audio play failed', e);
        }
    };

    // --- Rest timer countdown ---
    useEffect(() => {
        let interval;
        if (restTimer.isActive && restTimer.timeLeft > 0) {
            interval = setInterval(() => {
                setRestTimer(prev => {
                    const nextTime = prev.timeLeft - 1;
                    if (nextTime === 0) {
                        playBeep('rest');
                        return { timeLeft: 0, isActive: false };
                    }
                    return { ...prev, timeLeft: nextTime };
                });
            }, 1000);
        }
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restTimer.isActive, restTimer.timeLeft, soundEnabled]);

    const startRestTimer = (seconds) => {
        const duration = seconds || defaultRestTime;
        setRestTimer({ timeLeft: duration, isActive: true, duration: duration });
    };

    const addTimeRest = (seconds) => {
        setRestTimer(prev => {
            const newTime = Math.max(0, prev.timeLeft + seconds);
            const newDuration = Math.max(0, prev.duration + seconds);
            return { ...prev, timeLeft: newTime, duration: newDuration };
        });
    };

    const skipRest = () => {
        setRestTimer({ timeLeft: 0, isActive: false, duration: defaultRestTime });
    };

    const toggleRestTimer = () => {
        setRestTimer(prev => ({ ...prev, isActive: !prev.isActive }));
    };

    const toggleWorkTimer = () => {
        setWorkTimer(prev => ({ ...prev, isActive: !prev.isActive }));
    };

    // --- Work timer countdown ---
    useEffect(() => {
        let interval;
        if (workTimer.isActive && workTimer.timeLeft > 0) {
            interval = setInterval(() => {
                setWorkTimer(prev => {
                    const nextTime = prev.timeLeft - 1;
                    if (nextTime === 0) {
                        playBeep('success');
                        return { ...prev, timeLeft: 0, isActive: false };
                    }
                    return { ...prev, timeLeft: nextTime };
                });
            }, 1000);
        }
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workTimer.isActive, workTimer.timeLeft, soundEnabled]);

    const startWorkTimer = (seconds) => {
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

    const updateTimerPref = (exerciseId, type, duration) => {
        setExercisePrefs(prev => ({
            ...prev,
            [exerciseId]: {
                ...prev[exerciseId],
                [type]: duration
            }
        }));
    };

    // --- Persist timer defaults (skip first mount so initial defaults don't
    // clobber stored values before the load effect runs). ---
    const timersMountRef = useRef(true);
    const timersSyncedProfileRef = useRef(null);
    useEffect(() => {
        if (timersMountRef.current) {
            timersMountRef.current = false;
            timersSyncedProfileRef.current = currentProfile?.id ?? null;
            return;
        }
        if (currentProfile) {
            StorageService.saveDefaultTimers(currentProfile.id, defaultRestTime, defaultWorkTime);
            // Best-effort backend sync — only on genuine user edits (same profile),
            // not the login/profile-switch restore run. canSyncToBackend comes from
            // WorkoutContext via prop (one-way dep: TimerContext can't import it).
            const sameProfile = timersSyncedProfileRef.current === currentProfile.id;
            timersSyncedProfileRef.current = currentProfile.id;
            if (sameProfile && canSyncRef.current?.()) {
                ApiService.saveProfile({ default_rest_time: defaultRestTime, default_work_time: defaultWorkTime })
                    .catch(err => console.error('[settings-sync] timers:', err));
            }
        }
    }, [defaultRestTime, defaultWorkTime, currentProfile]);

    // --- Persist exercise preferences ---
    const prefsMountRef = useRef(true);
    useEffect(() => {
        if (prefsMountRef.current) { prefsMountRef.current = false; return; }
        if (currentProfile) {
            StorageService.saveExercisePrefs(currentProfile.id, exercisePrefs);
        }
    }, [exercisePrefs, currentProfile]);

    // --- Bridge: expose imperative timer actions to WorkoutContext (Option A).
    // Re-populated every render so the closures (which read defaultRestTime)
    // stay current. WorkoutContext calls these only on user interaction, long
    // after this provider has mounted and filled the ref. ---
    useEffect(() => {
        if (apiRef) {
            apiRef.current = { skipRest, resetWorkTimer, stopWorkTimer, startRestTimer };
        }
    });

    const value = {
        restTimer, startRestTimer, toggleRestTimer, skipRest, addTimeRest,
        workTimer, startWorkTimer, stopWorkTimer, toggleWorkTimer, resetWorkTimer, addTimeWork,
        defaultRestTime, setDefaultRestTime,
        defaultWorkTime, setDefaultWorkTime,
        exercisePrefs, updateTimerPref,
        playBeep,
    };

    return (
        <TimerContext.Provider value={value}>
            {children}
        </TimerContext.Provider>
    );
};

export const useTimer = () => {
    const context = useContext(TimerContext);
    if (!context) throw new Error('useTimer must be used within a TimerProvider');
    return context;
};
