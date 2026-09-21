import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { WorkoutContext } from '../context/WorkoutContext';
import ExerciseResult from '../components/workout/ExerciseResult';
import CreateTemplateModal from '../components/workout/CreateTemplateModal';
import GuidedWorkoutView from '../components/workout/GuidedWorkoutView';
import PlateCalculator from '../components/workout/PlateCalculator';
import Modal from '../components/common/Modal'; // Import reusable Modal
import { Play, Plus, Clock, XCircle, Check, Calculator, ChevronDown, ChevronUp, Dumbbell, Home, Flame, User, Settings, Save, Trash2 } from 'lucide-react';
import { firstFreeTemplateName, isTemplateNameTaken } from '../utils/templateNames';
import '../styles/filter-chips.css';
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

// Template exercise entries are either bare exercise-id strings (default
// templates) or objects carrying an `id` (custom templates).
const templateExerciseId = (item) => (typeof item === 'string' ? item : item?.id);

// Union of focus tags across a template's exercises.
const templateFocusTags = (template, exMap) => {
    const tags = new Set();
    (template.exercises || []).forEach(item => {
        const ex = exMap[templateExerciseId(item)];
        if (ex) exerciseFocusTags(ex).forEach(t => tags.add(t));
    });
    return tags;
};

// Distinct primary muscles a template covers (for the preview).
const templateMuscles = (template, exMap) => {
    const set = new Set();
    (template.exercises || []).forEach(item => {
        const ex = exMap[templateExerciseId(item)];
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
        equipmentProfiles, activeEquipmentProfileId, setSessionEquipmentOverride, getCompatibleExercises, customEquipmentItems, saveTemplateFromPrep, templateExercisesFromWorkout,
        removeExerciseFromWorkout, reorderExerciseInWorkout } = useContext(WorkoutContext);
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

    // --- Save-as-template from the prep screen (S28) ---
    // Visible for EVERY prep workout. The NAME decides what saving does
    // (saveTemplateFromPrep): own custom + unchanged name updates in place,
    // anything else creates; built-ins must be renamed and are never written.
    const canSaveTemplate = !!activeWorkout && activeWorkout.status === 'preparing';
    const sourceTemplate = useMemo(() => (
        activeWorkout?.sourceTemplateId
            ? templates.find(t => t.id === activeWorkout.sourceTemplateId) || null
            : null
    ), [templates, activeWorkout?.sourceTemplateId]);
    const isBuiltInSource = !!sourceTemplate && !sourceTemplate.isCustom;
    // Dirty-state tracking (S28 follow-up): the serialized save payload at
    // the moment of the last successful save. "Saved" holds only while the
    // current prep content still serializes to the same bytes — any edit
    // re-enables Save and re-arms START's auto-save. A boolean flag here
    // silently dropped post-save edits.
    const [savedSnapshot, setSavedSnapshot] = useState(null);
    const prepSerialized = canSaveTemplate
        ? JSON.stringify(templateExercisesFromWorkout(activeWorkout))
        : null;
    const isSaved = savedSnapshot !== null && savedSnapshot === prepSerialized;
    const [saveTplModal, setSaveTplModal] = useState({ isOpen: false, name: '', error: '' });
    const [saveNotice, setSaveNotice] = useState(null); // { kind: 'success'|'error', text }
    // Remove-an-exercise from prep (S32). The row asks; this page confirms and
    // owns the collection rule: never below one exercise.
    const [removeTarget, setRemoveTarget] = useState(null); // { instanceId, name }
    const canRemoveExercise = !!activeWorkout && (activeWorkout.exercises || []).length > 1;

    // --- Drag to reorder (S34) -------------------------------------------
    // Pointer Events, no dependency: one code path for mouse, touch and pen.
    // The grip carries `touch-action: none`, so a drag started there never
    // scrolls the page — which is the hard part of touch reordering, and the
    // reason a dedicated handle is worth having.
    //
    // Live pointer maths sit in a ref, not state: a re-render mid-drag must not
    // discard them, and `setPointerCapture` lives on the grip element, which
    // stays mounted because prep rows are keyed by instance id.
    const [draggingId, setDraggingId] = useState(null);
    const dragRef = useRef(null); // { instanceId, pointerId, startY, started }

    const exerciseIds = () => (activeWorkout?.exercises || []).map(ex => ex.id);

    const handleReorderByKey = (instanceId, delta) => {
        const ids = exerciseIds();
        const from = ids.indexOf(instanceId);
        if (from === -1) return;
        const to = from + delta;
        if (to < 0 || to >= ids.length) return;
        reorderExerciseInWorkout(instanceId, to);
    };

    const handleReorderPointerDown = (e, instanceId) => {
        if (e.button !== undefined && e.button !== 0) return; // left / primary only
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = { instanceId, pointerId: e.pointerId, startY: e.clientY, started: false };
    };

    useEffect(() => {
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;

            // A 6px threshold, not a hold: the grip is dedicated, so a press
            // there can only mean reorder. A hold would add latency for nothing.
            if (!d.started) {
                if (Math.abs(e.clientY - d.startY) < 6) return;
                d.started = true;
                setDraggingId(d.instanceId);
            }

            // Target index from MEASURED row midpoints — prep rows vary in
            // height with set count, so assumed heights would drift.
            const cards = Array.from(document.querySelectorAll('.exercise-result-card'));
            const ids = exerciseIds();
            if (cards.length !== ids.length) return;
            const from = ids.indexOf(d.instanceId);
            if (from === -1) return;

            let to = from;
            for (let i = 0; i < cards.length; i++) {
                const r = cards[i].getBoundingClientRect();
                const mid = r.top + r.height / 2;
                if (i < from && e.clientY < mid) { to = i; break; }
                if (i > from && e.clientY > mid) { to = i; }
            }
            if (to !== from) reorderExerciseInWorkout(d.instanceId, to);
        };

        const onEnd = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            setDraggingId(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
        };
    });

    // New session → fresh save state (the page persists across workouts).
    useEffect(() => {
        setSavedSnapshot(null);
        setSaveNotice(null);
        setSaveTplModal({ isOpen: false, name: '', error: '' });
        setRemoveTarget(null);
    }, [activeWorkout?.id]);

    const confirmRemoveExercise = () => {
        if (!removeTarget) return;
        removeExerciseFromWorkout(removeTarget.instanceId);
        setRemoveTarget(null);
    };

    // The save notice is transient, not a permanent banner.
    useEffect(() => {
        if (!saveNotice) return;
        const t = setTimeout(() => setSaveNotice(null), 4000);
        return () => clearTimeout(t);
    }, [saveNotice]);

    const confirmSaveTemplate = async () => {
        const trimmed = saveTplModal.name.trim();
        if (!trimmed) return;
        // Decision B (S32): an exact same-name save of your own custom template
        // is the in-place update and needs no collision check. Anything else
        // creates, so a normalized match against ANY custom — including a
        // case-only rename of the source — is refused here, before the create.
        const isInPlaceUpdate = !!sourceTemplate?.isCustom && trimmed === sourceTemplate.name;
        if (!isInPlaceUpdate && isTemplateNameTaken(trimmed, templates)) {
            setSaveTplModal(prev => ({ ...prev, error: `A template named "${trimmed}" already exists. Choose another name.` }));
            return;
        }
        // Local persistence inside is synchronous; only the cloud push is
        // async and already falls back to SyncQueue.
        const result = await saveTemplateFromPrep(trimmed)
            .catch(() => ({ ok: false, error: 'Could not save the template.' }));
        if (result?.ok) {
            setSavedSnapshot(prepSerialized);
            setSaveTplModal({ isOpen: false, name: '', error: '' });
            const base = result.mode === 'updated' ? `"${trimmed}" updated.` : 'Template Saved.';
            setSaveNotice({
                kind: 'success',
                text: prepValidation.canStartGuidedWorkout ? base : `${base} Some sets have no weight yet.`
            });
        } else {
            // Honest failure: dialog stays open, no "Template Saved" anywhere.
            setSaveTplModal(prev => ({ ...prev, error: result?.error || 'Could not save the template.' }));
        }
    };

    // Both START WORKOUT buttons: starting also saves (decision 3) — an own
    // custom template updates in place, an ad-hoc draft is created once —
    // EXCEPT built-ins, which are never silently forked, and clean state
    // (nothing changed since the last save, so no duplicate write). The
    // local write is synchronous; a failed cloud push never blocks the start.
    const handleStartWorkout = () => {
        if (!isSaved) {
            if (sourceTemplate && sourceTemplate.isCustom) {
                saveTemplateFromPrep(sourceTemplate.name).catch(() => {});
            } else if (!sourceTemplate) {
                saveTemplateFromPrep(activeWorkout.name).catch(() => {});
            }
        }
        startGuidedSession();
    };

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
            t.exercises.every(item => compatibleIds.has(templateExerciseId(item))) &&
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
                                    backgroundColor: 'color-mix(in srgb, var(--danger) 20%, transparent)',
                                    color: 'var(--danger)',
                                    border: '1px solid var(--danger)',
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
                        <span className="status-badge" style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>PREPARATION</span>
                        <h1 style={{ marginTop: '10px' }}>{activeWorkout.name}</h1>
                    </div>
                    <button
                        onClick={cancelWorkout}
                        style={{ position: 'absolute', right: '20px', top: '25px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                    >
                        <XCircle size={24} />
                    </button>
                </header>

                <div className="workout-stream">
                    {/* Top Actions in Prep Mode */}
                    <div style={{ padding: '0 20px', marginBottom: '10px' }}>
                        <button
                            onClick={handleStartWorkout}
                            disabled={!prepValidation.canStartGuidedWorkout}
                            className="finish-btn"
                            style={{ width: '100%', padding: '15px 0', fontSize: '1.2rem', background: 'var(--primary)', color: 'black', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: prepValidation.canStartGuidedWorkout ? 1 : 0.5, cursor: prepValidation.canStartGuidedWorkout ? 'pointer' : 'not-allowed' }}
                        >
                            <Play size={20} fill="currentColor" />
                            START WORKOUT
                        </button>
                        {!prepValidation.canStartGuidedWorkout && (
                            <p style={{ margin: '0 0 15px', color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center' }}>
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
                                // Keyed by INSTANCE id, never by position:
                                // reordering changes the index, and an
                                // index-based key makes React discard and
                                // rebuild the row — which destroys the element
                                // holding pointer capture, killing the drag
                                // mid-gesture (S34 plan review P1).
                                key={(typeof item === 'object' && item.id) ? item.id : `${exId}-${index}-prep`}
                                exerciseId={exId}
                                exercises={exercises}
                                workoutData={typeof item === 'object' ? item : null}
                                isPrep={true}
                                invalidWeightSetKeys={prepValidation.invalidWeightSetKeys}
                                canRemoveExercise={canRemoveExercise}
                                onRequestRemoveExercise={(instanceId, name) => setRemoveTarget({ instanceId, name })}
                                onReorderPointerDown={handleReorderPointerDown}
                                onReorderByKey={handleReorderByKey}
                                isDragging={draggingId === (typeof item === 'object' ? item.id : null)}
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
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
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
                            onClick={handleStartWorkout}
                            disabled={!prepValidation.canStartGuidedWorkout}
                            className="finish-btn"
                            style={{ width: '100%', padding: '15px 0', fontSize: '1.2rem', background: 'var(--primary)', color: 'black', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: prepValidation.canStartGuidedWorkout ? 1 : 0.5, cursor: prepValidation.canStartGuidedWorkout ? 'pointer' : 'not-allowed' }}
                        >
                            <Play size={20} fill="currentColor" />
                            START WORKOUT
                        </button>
                        {canSaveTemplate && (
                            <button
                                onClick={() => setSaveTplModal({
                                    isOpen: true,
                                    // A built-in must be renamed to save; prefill the
                                    // first free "(my version)" so the refusal is a
                                    // one-tap fix, not a dead end (decision 2).
                                    name: isBuiltInSource
                                        ? firstFreeTemplateName(sourceTemplate.name, templates)
                                        : (sourceTemplate?.name || activeWorkout.name || ''),
                                    error: ''
                                })}
                                disabled={isSaved}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px 0',
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    color: isSaved ? 'var(--text-muted)' : 'var(--text-primary)',
                                    cursor: isSaved ? 'default' : 'pointer',
                                    fontSize: '1rem'
                                }}
                            >
                                {isSaved
                                    ? <><Check size={18} /> Template Saved</>
                                    : <><Save size={18} /> Save Template</>}
                            </button>
                        )}
                        {saveNotice && (
                            <p className={`prep-save-notice ${saveNotice.kind}`}>
                                {saveNotice.text}
                            </p>
                        )}
                    </div>
                </div>

                {/* Save Template name confirm */}
                <Modal
                    isOpen={saveTplModal.isOpen}
                    onClose={() => setSaveTplModal({ isOpen: false, name: '', error: '' })}
                    title="Save Template"
                    actions={
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
                            <button
                                className="secondary-btn"
                                onClick={() => setSaveTplModal({ isOpen: false, name: '', error: '' })}
                                style={{ padding: '8px 16px' }}
                            >
                                Cancel
                            </button>
                            <button
                                className="primary-btn"
                                onClick={confirmSaveTemplate}
                                disabled={!saveTplModal.name.trim()}
                                style={{ padding: '8px 16px', opacity: saveTplModal.name.trim() ? 1 : 0.5 }}
                            >
                                <Save size={16} /> Save
                            </button>
                        </div>
                    }
                >
                    <input
                        type="text"
                        value={saveTplModal.name}
                        onChange={(e) => setSaveTplModal(prev => ({ ...prev, name: e.target.value, error: '' }))}
                        placeholder="Template name"
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            fontSize: '1rem'
                        }}
                    />
                    {sourceTemplate && !saveTplModal.error && (
                        <p className="save-tpl-hint">
                            {isBuiltInSource
                                ? `"${sourceTemplate.name}" is a built-in template. Change the name to save your own copy.`
                                : `Keeping the name updates "${sourceTemplate.name}". A new name saves a copy.`}
                        </p>
                    )}
                    {saveTplModal.error && (
                        <p className="save-tpl-error">{saveTplModal.error}</p>
                    )}
                </Modal>

                {/* Remove-exercise confirm (S32) */}
                <Modal
                    isOpen={!!removeTarget}
                    onClose={() => setRemoveTarget(null)}
                    title="Remove Exercise"
                    actions={
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
                            <button
                                className="secondary-btn"
                                onClick={() => setRemoveTarget(null)}
                                style={{ padding: '8px 16px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRemoveExercise}
                                style={{
                                    backgroundColor: 'color-mix(in srgb, var(--danger) 20%, transparent)',
                                    color: 'var(--danger)',
                                    border: '1px solid var(--danger)',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Trash2 size={16} /> Remove
                            </button>
                        </div>
                    }
                >
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.5' }}>
                        Remove <strong>{removeTarget?.name}</strong> from this workout?{' '}
                        {isBuiltInSource
                            ? 'The built-in template stays as it is. Save under a new name to keep your version.'
                            : sourceTemplate
                                ? `Saving or starting will update "${sourceTemplate.name}".`
                                : ''}
                    </p>
                </Modal>
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
