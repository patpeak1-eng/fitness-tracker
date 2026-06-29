import React, { useContext, useState, useEffect, useMemo } from 'react';
import { WorkoutContext } from '../context/WorkoutContext';
import ExerciseResult from '../components/workout/ExerciseResult';
import CreateTemplateModal from '../components/workout/CreateTemplateModal';
import GuidedWorkoutView from '../components/workout/GuidedWorkoutView';
import PlateCalculator from '../components/workout/PlateCalculator';
import Modal from '../components/common/Modal'; // Import reusable Modal
import { Play, Plus, Clock, XCircle, Check, Calculator, ChevronDown, ChevronUp, Dumbbell, Home, Flame, User, Settings } from 'lucide-react';
import './TrackWorkout.css';

// --- Template Picker filter helpers (Iteration 2) ---
const PROFILE_ICONS = {
    full_gym: Dumbbell,
    home_gym: Home,
    fire_station: Flame,
    bodyweight_only: User,
    custom: Settings
};

const MUSCLE_CHIPS = ['Full Body', 'Upper Body', 'Lower Body', 'Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Mobility'];
const DURATION_CHIPS = ['Any', 'Under 30 min', '30–45 min', '45–60 min', '60+ min'];

// Map a single exercise to the set of Muscle Focus chips it satisfies.
const exerciseFocusTags = (ex) => {
    const tags = new Set();
    const pm = ex.primary_muscle;
    const name = (ex.name || '').toLowerCase();
    if (ex.category === 'Yoga') tags.add('Mobility');
    if (['Chest', 'Back', 'Shoulders', 'Arms'].includes(pm)) tags.add('Upper Body');
    if (pm === 'Legs') { tags.add('Lower Body'); tags.add('Legs'); }
    if (pm === 'Abs') tags.add('Core');
    if (pm === 'Cardio') tags.add('Cardio');
    // Push = chest/shoulders + tricep-style arm work (primary_muscle can't split
    // tricep vs bicep, so disambiguate Arms by exercise name).
    if (pm === 'Chest' || pm === 'Shoulders') tags.add('Push');
    if (pm === 'Arms' && /tricep|pushdown|skull|extension|dip|push/.test(name)) tags.add('Push');
    // Pull = back + bicep-style arm work
    if (pm === 'Back') tags.add('Pull');
    if (pm === 'Arms' && /bicep|curl|chin/.test(name)) tags.add('Pull');
    return tags;
};

// Union of focus tags across a template's exercises.
const templateFocusTags = (template, exMap) => {
    const tags = new Set();
    (template.exercises || []).forEach(id => {
        const ex = exMap[id];
        if (ex) exerciseFocusTags(ex).forEach(t => tags.add(t));
    });
    return tags;
};

// Distinct primary muscles a template covers (for the preview).
const templateMuscles = (template, exMap) => {
    const set = new Set();
    (template.exercises || []).forEach(id => {
        const ex = exMap[id];
        if (ex && ex.primary_muscle) set.add(ex.primary_muscle);
    });
    return [...set];
};

// Estimated duration: explicit field, else a rough fallback for custom templates.
const templateDuration = (template) => {
    if (typeof template.estimatedDuration === 'number') return template.estimatedDuration;
    const sets = template.sets || 3;
    return Math.max(10, Math.round((template.exercises?.length || 0) * sets * 2.5));
};

const matchesDuration = (minutes, selected) => {
    switch (selected) {
        case 'Under 30 min': return minutes <= 30;
        case '30–45 min': return minutes >= 30 && minutes <= 45;
        case '45–60 min': return minutes > 45 && minutes <= 60;
        case '60+ min': return minutes > 60;
        default: return true; // 'Any'
    }
};

const matchesMuscleFocus = (tags, selected) => {
    if (selected.has('Full Body') || selected.size === 0) return true;
    for (const tag of tags) if (selected.has(tag)) return true;
    return false;
};

const TrackWorkout = () => {
    const { activeWorkout, exercises, cancelWorkout, templates, startWorkoutFromTemplate, startWorkout, deleteTemplate, startGuidedSession, prepValidation,
        equipmentProfiles, activeEquipmentProfileId, setSessionEquipmentOverride, getCompatibleExercises, customEquipmentItems } = useContext(WorkoutContext);
    const [showSelector, setShowSelector] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [showPlateCalc, setShowPlateCalc] = useState(false);
    // Template picker filter state (Iteration 2)
    const [selectedProfileId, setSelectedProfileId] = useState(activeEquipmentProfileId);
    const [selectedMuscles, setSelectedMuscles] = useState(() => new Set(MUSCLE_CHIPS));
    const [selectedDuration, setSelectedDuration] = useState('Any');

    // Timer Logic
    useEffect(() => {
        let interval;
        if (activeWorkout) {
            // Calculate elapsed seconds since start or default to 0
            const startTime = activeWorkout.startTime ? new Date(activeWorkout.startTime).getTime() : Date.now();

            // Initial set
            setElapsedTime(Math.floor((Date.now() - startTime) / 1000));

            interval = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [activeWorkout]);

    // Format MM:SS
    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return "--:--";
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Confirm Delete Modal State
    const [deleteConfirmation, setDeleteConfirmation] = useState({
        isOpen: false,
        templateId: null,
        templateName: ''
    });

    const exMap = useMemo(() => {
        const map = {};
        exercises.forEach(ex => { map[ex.id] = ex; });
        return map;
    }, [exercises]);

    // Tapping a profile card is a session-only override; it never overwrites the
    // user's saved default (activeEquipmentProfileId).
    const selectProfile = (p) => {
        setSelectedProfileId(p.id);
        if (p.id === activeEquipmentProfileId) {
            setSessionEquipmentOverride(null);
        } else {
            setSessionEquipmentOverride(p.id === 'custom' ? customEquipmentItems : p.equipment);
        }
    };

    const toggleMuscle = (m) => {
        setSelectedMuscles(prev => {
            const next = new Set(prev);
            if (next.has(m)) next.delete(m); else next.add(m);
            return next;
        });
    };

    if (!activeWorkout) {
        const compatibleIds = new Set(getCompatibleExercises().map(e => e.id));
        const visibleTemplates = templates.filter(t =>
            (t.exercises || []).length > 0 &&
            t.exercises.every(id => compatibleIds.has(id)) &&
            matchesMuscleFocus(templateFocusTags(t, exMap), selectedMuscles) &&
            matchesDuration(templateDuration(t), selectedDuration)
        );

        return (
            <div className="track-workout-container">
                <div className="picker-screen">
                    {/* ZONE 1 — Equipment Profile Selector */}
                    <div className="picker-zone">
                        <div className="section-header"><h3>Equipment</h3></div>
                        <div className="profile-scroll-row">
                            {equipmentProfiles.map(p => {
                                const Icon = PROFILE_ICONS[p.id] || Settings;
                                const isActive = p.id === selectedProfileId;
                                return (
                                    <button
                                        key={p.id}
                                        className={`profile-card${isActive ? ' active' : ''}`}
                                        onClick={() => selectProfile(p)}
                                        aria-pressed={isActive}
                                    >
                                        <div className="profile-card-icon"><Icon size={22} /></div>
                                        <div className="profile-card-name">{p.name}</div>
                                        <div className="profile-card-desc">{p.description}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ZONE 2 — Chip Filters */}
                    <div className="picker-zone">
                        <div className="chip-row-label">Muscle Focus</div>
                        <div className="chip-row">
                            {MUSCLE_CHIPS.map(m => (
                                <button
                                    key={m}
                                    className={`filter-chip${selectedMuscles.has(m) ? ' active' : ''}`}
                                    onClick={() => toggleMuscle(m)}
                                    aria-pressed={selectedMuscles.has(m)}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                        <div className="chip-row-label">Duration</div>
                        <div className="chip-row">
                            {DURATION_CHIPS.map(d => (
                                <button
                                    key={d}
                                    className={`filter-chip${selectedDuration === d ? ' active' : ''}`}
                                    onClick={() => setSelectedDuration(d)}
                                    aria-pressed={selectedDuration === d}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ZONE 3 — Template Results */}
                    <div className="picker-zone">
                        <div className="section-header">
                            <h3>{visibleTemplates.length} Workout{visibleTemplates.length === 1 ? '' : 's'}</h3>
                        </div>
                        <div className="template-list">
                            {visibleTemplates.map(t => {
                                const muscles = templateMuscles(t, exMap);
                                const mins = templateDuration(t);
                                return (
                                    <div key={t.id} className="result-card">
                                        <div className="result-card-body">
                                            <div className="result-card-top">
                                                <div className="result-name">{t.name}</div>
                                                {t.isCustom && (
                                                    <button
                                                        className="delete-mini-btn static"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteConfirmation({
                                                                isOpen: true,
                                                                templateId: t.id,
                                                                templateName: t.name
                                                            });
                                                        }}
                                                        aria-label="Delete template"
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="result-meta">
                                                <span><Dumbbell size={13} /> {t.exercises.length} exercises</span>
                                                <span><Clock size={13} /> ~{mins} min</span>
                                            </div>
                                            {muscles.length > 0 && (
                                                <div className="result-muscles">
                                                    {muscles.map(m => <span key={m} className="muscle-pill">{m}</span>)}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className="start-btn"
                                            onClick={() => startWorkoutFromTemplate(t.id)}
                                        >
                                            <Play size={16} fill="currentColor" /> START
                                        </button>
                                    </div>
                                );
                            })}

                            {visibleTemplates.length === 0 && (
                                <div className="picker-empty-hint">
                                    No workouts match these filters. Try a different equipment profile or clearing some chips.
                                </div>
                            )}

                            {/* Build My Own — always visible */}
                            <button className="build-own-card" onClick={() => setShowSelector(true)}>
                                <div className="build-own-icon"><Plus size={20} /></div>
                                <div className="build-own-text">
                                    <div className="build-own-title">Build My Own</div>
                                    <div className="build-own-sub">Create a custom workout from scratch</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Create Template Modal */}
                {showSelector && (
                    <CreateTemplateModal
                        onClose={() => setShowSelector(false)}
                    />
                )}

                {/* Delete Confirmation Modal */}
                <Modal
                    isOpen={deleteConfirmation.isOpen}
                    onClose={() => setDeleteConfirmation({ ...deleteConfirmation, isOpen: false })}
                    title="Delete Template"
                    actions={
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
                            <button
                                className="secondary-btn"
                                onClick={() => setDeleteConfirmation({ ...deleteConfirmation, isOpen: false })}
                                style={{ padding: '8px 16px' }}
                            >
                                Cancel
                            </button>
                            <button
                                className="delete-tpl-btn"
                                onClick={() => {
                                    deleteTemplate(deleteConfirmation.templateId);
                                    setDeleteConfirmation({ ...deleteConfirmation, isOpen: false });
                                }}
                                style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                    color: '#ef4444',
                                    border: '1px solid #ef4444',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <XCircle size={16} /> Delete
                            </button>
                        </div>
                    }
                >
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.5' }}>
                        Are you sure you want to permanently delete <strong>{deleteConfirmation.templateName}</strong>?
                    </p>
                </Modal>
            </div>
        );
    }

    // 2. WORKOUT PREP & REVIEW (The "Preparation" Phase)
    // Check local state OR persisted status from context
    // 'paused' stays in the guided view so the pause overlay + Resume render there
    // (rather than dropping back to the prep screen).
    const isGuidedMode = activeWorkout.status === 'active' || activeWorkout.status === 'paused';

    if (!isGuidedMode) {
        return (
            <div className="track-workout-container" style={{ paddingBottom: '140px' }}>
                <header className="active-header">
                    <div>
                        <span className="status-badge" style={{ background: '#facc15', color: '#000' }}>PREPARATION</span>
                        <h1 style={{ marginTop: '10px' }}>{activeWorkout.name}</h1>
                    </div>
                    <button
                        onClick={cancelWorkout}
                        style={{ position: 'absolute', right: '20px', top: '25px', background: 'transparent', border: 'none', color: '#666' }}
                    >
                        <XCircle size={24} />
                    </button>
                </header>

                <div className="workout-stream">
                    {/* Top Actions in Prep Mode */}
                    <div style={{ padding: '0 20px', marginBottom: '10px' }}>
                        <button
                            onClick={startGuidedSession}
                            disabled={!prepValidation.canStartGuidedWorkout}
                            className="finish-btn"
                            style={{ width: '100%', padding: '15px 0', fontSize: '1.2rem', background: 'var(--primary)', color: 'black', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: prepValidation.canStartGuidedWorkout ? 1 : 0.5, cursor: prepValidation.canStartGuidedWorkout ? 'pointer' : 'not-allowed' }}
                        >
                            <Play size={20} fill="currentColor" />
                            START WORKOUT
                        </button>
                        {!prepValidation.canStartGuidedWorkout && (
                            <p style={{ margin: '0 0 15px', color: '#fca5a5', fontSize: '0.9rem', textAlign: 'center' }}>
                                Enter a weight greater than 0 for every weighted set before starting.
                            </p>
                        )}
                    </div>

                    {activeWorkout.exercises && activeWorkout.exercises.map((item, index) => {
                        // Robust check for object structure vs legacy ID string
                        const exData = (typeof item === 'object' && item.exercise) ? item.exercise : exercises.find(e => e.id === item);
                        const exId = exData ? exData.id : 'unknown';

                        // Force List View for Prep Mode (No circular timers here)
                        // This ensures the user sees the setup list for EVERYTHING, including Cardio/Planks
                        return (
                            <ExerciseResult
                                key={`${exId}-${index}-prep`}
                                exerciseId={exId}
                                exercises={exercises}
                                workoutData={typeof item === 'object' ? item : null}
                                isPrep={true}
                                invalidWeightSetKeys={prepValidation.invalidWeightSetKeys}
                            />
                        );
                    })}

                    {/* Collapsible Plate Calculator (utility for the prep screen) */}
                    <div style={{ padding: '0 20px', marginTop: '10px' }}>
                        <button
                            onClick={() => setShowPlateCalc(v => !v)}
                            aria-expanded={showPlateCalc}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '12px 0',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '1rem'
                            }}
                        >
                            <Calculator size={18} />
                            Plate Calculator
                            {showPlateCalc ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                        {showPlateCalc && (
                            <div style={{ marginTop: '12px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <PlateCalculator />
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '0 20px', marginTop: '20px' }}>
                        <button
                            onClick={startGuidedSession}
                            disabled={!prepValidation.canStartGuidedWorkout}
                            className="finish-btn"
                            style={{ width: '100%', padding: '15px 0', fontSize: '1.2rem', background: 'var(--primary)', color: 'black', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: prepValidation.canStartGuidedWorkout ? 1 : 0.5, cursor: prepValidation.canStartGuidedWorkout ? 'pointer' : 'not-allowed' }}
                        >
                            <Play size={20} fill="currentColor" />
                            START WORKOUT
                        </button>
                    </div>

                    {!activeWorkout.isCustom && (
                        <div style={{ padding: '20px' }}>
                            {/* Placeholder for Save Template logic if needed later */}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 2. LIVE SESSION VIEW
    return (
        <div className="track-workout-container" style={{ padding: 0 }}>
            <GuidedWorkoutView />
        </div>
    );
};

export default TrackWorkout;
