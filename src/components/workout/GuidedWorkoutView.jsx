import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, Square, SkipForward, SkipBack, CheckCircle2, RotateCcw, Minus, Plus, X, ChevronLeft, ChevronRight, StickyNote, Info, Trophy } from 'lucide-react';
import { useWorkout } from '../../context/WorkoutContext';
import Modal from '../common/Modal';

import WorkoutNotesModal from './WorkoutNotesModal';
import ExerciseMedia from './ExerciseMedia';
import InstructionModal from './InstructionModal';
import './GuidedWorkoutView.css';

const GuidedWorkoutView = () => {
    const {
        activeWorkout,
        currentExerciseIndex,
        setCurrentExerciseIndex,
        currentSetIndex,
        setCurrentSetIndex,
        finishWorkout,
        cancelWorkout,
        exercisePrefs,
        updateTimerPref,
        updateSet,
        // Timer controls
        restTimer,
        startRestTimer,
        toggleRestTimer,
        addTimeRest,
        skipRest,
        workTimer,
        startWorkTimer,
        stopWorkTimer,
        toggleWorkTimer,
        resetWorkTimer,
        addTimeWork,
        toggleSetComplete,
        units // Grab units context
    } = useWorkout();

    const navigate = useNavigate();

    // Notes Modal State
    const [notesModalOpen, setNotesModalOpen] = React.useState(false);
    // Instruction Modal State
    const [infoModalOpen, setInfoModalOpen] = React.useState(false);

    const [confirmModal, setConfirmModal] = React.useState({ isOpen: false });
    // Guard against double-submit on the Finish button (finishWorkout is async).
    const [isFinishing, setIsFinishing] = React.useState(false);

    // Require confirmation before discarding an in-progress session.
    const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);

    // TARGET ADJUSTMENT STATE
    const [targetModal, setTargetModal] = React.useState({ isOpen: false, type: '', value: 0 });

    // REP COUNTER STATE
    const [activeRepCount, setActiveRepCount] = React.useState(0);

    // POST SET INPUT STATE — hoisted above the early returns (Rules of Hooks).
    const [showInputModal, setShowInputModal] = React.useState(false);
    const [inputValues, setInputValues] = React.useState({ weight: 0, reps: 0, distance: 0, time: 0 });

    // Auto-advance trackers — hoisted above the early returns (Rules of Hooks).
    const wasRestingRef = React.useRef(false);
    const wasWorkingRef = React.useRef(false);

    // Derived values, computed null-safe so every hook below runs on every
    // render — even before activeWorkout / the current exercise exist. The
    // early returns further down still guard the actual render output.
    const currentExerciseInstance = activeWorkout?.exercises[currentExerciseIndex];
    const nextExerciseInstance = activeWorkout?.exercises[currentExerciseIndex + 1];
    const isDurationBased = currentExerciseInstance?.exercise.isDurationBased === true || currentExerciseInstance?.exercise.default_duration > 0 || currentExerciseInstance?.exercise.category === 'Yoga' || currentExerciseInstance?.exercise.category === 'Cardio';
    const currentSet = currentExerciseInstance?.sets[currentSetIndex];
    const isResting = restTimer.isActive;
    const isWorking = workTimer.isActive;

    // Reset rep count when set changes
    useEffect(() => {
        setActiveRepCount(0);
    }, [currentSetIndex, currentExerciseIndex]);

    // --- CHECK PREFS ON EXERCISE LOAD ---
    useEffect(() => {
        if (!currentExerciseInstance) return;
        const exId = currentExerciseInstance.exercise.id;
        const savedWork = exercisePrefs[exId]?.work;
        const savedRest = exercisePrefs[exId]?.rest;

        if (savedWork && !isWorking) {
            startWorkTimer(savedWork);
            stopWorkTimer();
        }
        if (savedRest && !isResting) {
            startRestTimer(savedRest);
            skipRest();
        }
    }, [currentExerciseInstance?.id, exercisePrefs]);

    // --- AUTO-ADVANCE LOGIC ---
    useEffect(() => {
        if (!currentExerciseInstance) return;
        if (wasRestingRef.current && !restTimer.isActive && restTimer.timeLeft === 0) {
            goToNext();
        }
        wasRestingRef.current = restTimer.isActive;
    }, [restTimer.isActive, restTimer.timeLeft]);

    useEffect(() => {
        if (!currentExerciseInstance) return;
        if (wasWorkingRef.current && !workTimer.isActive && workTimer.timeLeft === 0) {
            openInputModal();
        }
        wasWorkingRef.current = workTimer.isActive;
    }, [workTimer.isActive, workTimer.timeLeft]);

    // --- EARLY RETURNS (safety guards) — every hook above runs on each render ---
    if (!activeWorkout) return null;
    if (!currentExerciseInstance) return null;

    // --- NAV HELPERS ---
    const prevExercise = () => {
        if (currentExerciseIndex > 0) {
            stopWorkTimer();
            skipRest();
            setCurrentExerciseIndex(currentExerciseIndex - 1);
            setCurrentSetIndex(0);
            resetWorkTimer();
        }
    };

    const nextExercise = () => {
        if (currentExerciseIndex < activeWorkout.exercises.length - 1) {
            stopWorkTimer();
            skipRest();
            setCurrentExerciseIndex(currentExerciseIndex + 1);
            setCurrentSetIndex(0);
            resetWorkTimer();
        }
    };

    // --- TIMER ADJUSTMENTS (PERSISTED) ---
    const adjustTimer = (seconds) => {
        const exId = currentExerciseInstance.exercise.id;

        if (isResting) {
            addTimeRest(seconds);
            const newDuration = Math.max(10, restTimer.duration + seconds);
            updateTimerPref(exId, 'rest', newDuration);
        } else {
            if (isWorking) {
                addTimeWork(seconds);
                const newDuration = Math.max(10, workTimer.duration + seconds);
                updateTimerPref(exId, 'work', newDuration);
            } else {
                const newDuration = Math.max(10, workTimer.duration + seconds);
                startWorkTimer(newDuration);
                stopWorkTimer();
                updateTimerPref(exId, 'work', newDuration);
            }
        }
    };

    const isWorkPaused = !workTimer.isActive && workTimer.timeLeft < workTimer.duration && workTimer.timeLeft > 0;
    const isRestPaused = !restTimer.isActive && restTimer.timeLeft < restTimer.duration && restTimer.timeLeft > 0;

    let displayTime;
    let displayLabel;
    let pulseClass = '';

    if (restTimer.isActive || isRestPaused) {
        displayTime = restTimer.timeLeft;
        displayLabel = isRestPaused ? 'PAUSED' : 'REST';
    } else if (workTimer.isActive || isWorkPaused) {
        displayTime = workTimer.timeLeft;
        displayLabel = isWorkPaused ? 'PAUSED' : 'WORK';
        pulseClass = isWorkPaused ? '' : (isDurationBased ? 'pulse-text-cyan' : 'pulse-text-lime');
    } else {
        displayTime = workTimer.duration;
        displayLabel = 'READY';
    }



    const goToNext = () => {
        stopWorkTimer();
        skipRest();
        const totalSets = currentExerciseInstance.sets.length;

        if (currentSetIndex < totalSets - 1) {
            setCurrentSetIndex(currentSetIndex + 1);
            resetWorkTimer();
        } else if (currentExerciseIndex < activeWorkout.exercises.length - 1) {
            setCurrentExerciseIndex(currentExerciseIndex + 1);
            setCurrentSetIndex(0);
            resetWorkTimer();
        } else {
            setConfirmModal({ isOpen: true });
        }
    };

    const handleConfirmFinish = async () => {
        if (isFinishing) return;
        setIsFinishing(true);
        setConfirmModal({ isOpen: false });
        // finishWorkout() already pushes the completed workout to the cloud
        // internally (non-fatal), so no extra ApiService.saveWorkout call here.
        const completedWorkout = await finishWorkout();
        navigate('/summary', { state: { workout: completedWorkout } });
    };

    const handleMainButton = () => {
        if (isResting) {
            skipRest();
        } else if (isWorking) {
            stopWorkTimer();
            openInputModal();
        } else {
            if (currentSet.completed) {
                goToNext();
            } else {
                if (isDurationBased) {
                    const duration = currentSet.targetTime || currentExerciseInstance.exercise.default_duration || 60;
                    startWorkTimer(duration);
                } else {
                    startWorkTimer();
                }
            }
        }
    };

    const openInputModal = () => {
        setInputValues({
            weight: currentSet.weight || 0,
            reps: activeRepCount > 0 ? activeRepCount : (currentSet.reps || currentSet.targetReps || 0),
            distance: currentSet.distance || currentSet.targetDistance || 0,
            time: currentSet.time || currentSet.targetTime || 0
        });
        setShowInputModal(true);
    };

    const confirmSetCompletion = () => {
        const updates = {};
        if (inputValues.weight !== currentSet.weight) updates.weight = Number(inputValues.weight);
        if (inputValues.reps !== currentSet.reps) updates.reps = Number(inputValues.reps);
        if (inputValues.distance !== currentSet.distance) updates.distance = Number(inputValues.distance);
        if (inputValues.time !== currentSet.time) updates.time = Number(inputValues.time);

        updateSet(currentExerciseInstance.id, currentSet.id, updates);
        toggleSetComplete(currentExerciseInstance.id, currentSet.id, false);
        setShowInputModal(false);
    };

    const isCardio = currentExerciseInstance.exercise.category === 'Cardio';
    const isYoga = currentExerciseInstance.exercise.category === 'Yoga';

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleOpenNotes = () => {
        if (workTimer.isActive) stopWorkTimer();
        setNotesModalOpen(true);
    };

    const progressPercent = ((currentExerciseIndex + (currentSetIndex / currentExerciseInstance.sets.length)) / activeWorkout.exercises.length) * 100;

    return (
        <div className="guided-view">
            {/* Progress Bar - Top Edge */}
            <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
            </div>

            {/* SPLIT LAYOUT CONTAINER */}
            <div className="guided-layout-container">

                {/* LEFT PANEL: Context & Navigation */}
                <div className="left-panel">
                    <div className="set-indicator-large" style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--primary)', marginBottom: '20px' }}>
                        Set {currentSetIndex + 1}/{currentExerciseInstance.sets.length}
                    </div>

                    <div className="exercise-card">
                        <span className="label-small">Current Exercise</span>
                        <h1 className="exercise-title-split">{currentExerciseInstance.exercise.name}</h1>

                        <button className="view-instructions-btn" onClick={() => setInfoModalOpen(true)}>
                            <Info size={18} /> Description
                        </button>

                        <span className="label-small" style={{ marginTop: '20px' }}>Up Next</span>
                        <div className="up-next-name">
                            {nextExerciseInstance ? nextExerciseInstance.exercise.name : "Workout Complete"}
                        </div>
                    </div>

                    {/* Navigation Controls */}
                    <div className="nav-controls">
                        <button className="nav-arrow-btn" onClick={prevExercise} disabled={currentExerciseIndex === 0}>
                            <ChevronLeft size={32} />
                        </button>
                        <span className="nav-indicator">
                            Exercise {currentExerciseIndex + 1}/{activeWorkout.exercises.length}
                        </span>
                        <button className="nav-arrow-btn" onClick={nextExercise} disabled={currentExerciseIndex === activeWorkout.exercises.length - 1}>
                            <ChevronRight size={32} />
                        </button>
                    </div>
                </div>

                {/* RIGHT PANEL: Stats, Timer, Action */}
                <div className="right-panel">

                    {/* Header Controls (Exit) */}
                    <div style={{ position: 'absolute', top: 0, right: 0, padding: '20px' }}>
                        <button className="exit-btn-styled" onClick={() => setShowCancelConfirm(true)} style={{ borderColor: 'transparent', background: 'transparent', color: '#666' }}>
                            <X size={24} /> End Session
                        </button>
                    </div>

                    {/* Set Stats Pills */}
                    <div className="set-details">
                        <button
                            className="detail-pill clickable"
                            onClick={() => setTargetModal({ isOpen: true, type: 'weight', value: currentSet.weight || 0 })}
                        >
                            <span style={{ color: 'var(--primary)' }}>{currentSet.weight > 0 ? `${currentSet.weight}` : 'BW'}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{units === 'imperial' ? 'LBS' : 'KGS'}</span>
                        </button>

                        <button
                            className="detail-pill clickable"
                            onClick={() => setTargetModal({ isOpen: true, type: 'reps', value: currentSet.targetReps || 8 })}
                        >
                            <span style={{ color: 'var(--accent)' }}>{currentSet.targetReps || '8'}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>REPS</span>
                        </button>
                    </div>

                    {/* TIMER CIRCLE */}
                    <div className="timer-container-row">
                        <button className="timer-adjust-side" onClick={() => adjustTimer(-10)}>
                            <Minus size={24} />
                        </button>

                        <div className={`timer-circle ${isResting ? 'resting' : isWorking ? (isDurationBased ? 'working duration-mode' : 'working') : 'ready'}`}>
                            <div className="timer-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span className="timer-label">{displayLabel}</span>
                                <h1 className={`timer-value ${pulseClass}`}>{formatTime(displayTime)}</h1>

                                {(isResting || isWorking || isRestPaused || isWorkPaused) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isResting || (restTimer.timeLeft > 0 && !restTimer.isActive)) toggleRestTimer();
                                            else toggleWorkTimer();
                                        }}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '50px',
                                            height: '50px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {(isResting || isWorking) ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                                    </button>
                                )}
                            </div>
                        </div>

                        <button className="timer-adjust-side" onClick={() => adjustTimer(10)}>
                            <Plus size={24} />
                        </button>
                    </div>

                    {/* MAIN ACTION BUTTON */}
                    <div className="action-buttons-container" style={{ maxWidth: '400px' }}>
                        <button
                            className={`main-action-btn ${isResting ? 'skip' : (isWorking && !isDurationBased) ? 'finish' : 'start'}`}
                            style={{ width: '100%' }}
                            onClick={handleMainButton}
                        >
                            {isResting ? (
                                <>Skip Rest &nbsp; <SkipForward size={24} /></>
                            ) : isWorking ? (
                                isDurationBased ? (
                                    <>End Timer &nbsp; <Square size={24} fill="currentColor" /></>
                                ) : (
                                    <>Log Set &nbsp; <CheckCircle2 size={24} /></>
                                )
                            ) : (
                                isDurationBased ? (
                                    <>Start Timer &nbsp; <Play size={24} fill="currentColor" /></>
                                ) : (
                                    <>Start Set &nbsp; <Play size={24} fill="currentColor" /></>
                                )
                            )}
                        </button>
                    </div>

                    {/* MENU FAB */}
                    <button className="menu-fab" onClick={handleOpenNotes} aria-label="Menu">
                        <StickyNote size={24} color="#000" />
                    </button>
                </div>
            </div>

            {/* MODALS */}
            {showInputModal && (
                <div className="modal-overlay">
                    <div className="modal-content input-modal">
                        <h3>Set Complete</h3>
                        <div className={isCardio ? "input-grid" : "input-single-centered"}>
                            <div className="input-group">
                                <label>Reps Completed</label>
                                <input
                                    type="number"
                                    value={inputValues.reps}
                                    onChange={e => setInputValues({ ...inputValues, reps: e.target.value })}
                                    autoFocus
                                    style={{ fontSize: '2rem', textAlign: 'center', width: '120px' }}
                                />
                            </div>
                            <div className="input-group">
                                <label>Weight ({units === 'imperial' ? 'lbs' : 'kgs'})</label>
                                <input
                                    type="number"
                                    value={inputValues.weight}
                                    onChange={e => setInputValues({ ...inputValues, weight: e.target.value })}
                                    style={{ fontSize: '1.5rem', textAlign: 'center', width: '100px', color: 'var(--text-secondary)' }}
                                />
                            </div>
                        </div>
                        <button className="primary-btn" style={{ width: '100%', marginTop: '20px' }} onClick={confirmSetCompletion}>
                            Save
                        </button>
                    </div>
                </div>
            )}

            {targetModal.isOpen && (
                <div className="modal-overlay">
                    <div className="modal-content input-modal">
                        <h3>Adjust Target</h3>
                        <input
                            type="number"
                            value={targetModal.value}
                            onChange={e => setTargetModal({ ...targetModal, value: e.target.value })}
                            autoFocus
                            style={{ fontSize: '2rem', textAlign: 'center', width: '100%', margin: '20px 0', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--primary)' }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="secondary-btn" style={{ flex: 1 }} onClick={() => setTargetModal({ isOpen: false, type: '', value: 0 })}>Cancel</button>
                            <button className="primary-btn" style={{ flex: 1 }} onClick={() => {
                                const val = Number(targetModal.value);
                                if (targetModal.type === 'weight') updateSet(currentExerciseInstance.id, currentSet.id, { weight: val });
                                else updateSet(currentExerciseInstance.id, currentSet.id, { targetReps: val });
                                setTargetModal({ isOpen: false, type: '', value: 0 });
                            }}>Update</button>
                        </div>
                    </div>
                </div>
            )}

            <Modal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false })}
                title="Finish Workout?"
                actions={
                    <button className="primary-btn" style={{ width: '100%' }} onClick={handleConfirmFinish} disabled={isFinishing}>{isFinishing ? 'Finishing...' : 'Finish Workout'}</button>
                }
            >
                <p>Great job! Ready to save this session?</p>
            </Modal>

            <Modal
                isOpen={showCancelConfirm}
                onClose={() => setShowCancelConfirm(false)}
                title="End Workout?"
                actions={
                    <>
                        <button className="modal-btn-secondary" onClick={() => setShowCancelConfirm(false)}>
                            Keep Going
                        </button>
                        <button
                            className="modal-btn-primary"
                            style={{ background: 'var(--danger)', color: '#fff', boxShadow: '0 0 10px rgba(255, 51, 102, 0.4)' }}
                            onClick={() => {
                                setShowCancelConfirm(false);
                                cancelWorkout();
                            }}
                        >
                            End Workout
                        </button>
                    </>
                }
            >
                <p>Your progress will be lost. This cannot be undone.</p>
            </Modal>

            <InstructionModal exercise={currentExerciseInstance.exercise} isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} />
            <WorkoutNotesModal isOpen={notesModalOpen} onClose={() => setNotesModalOpen(false)} />

        </div>
    );
};

export default GuidedWorkoutView;
