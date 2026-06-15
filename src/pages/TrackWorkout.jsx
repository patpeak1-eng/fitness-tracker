import React, { useContext, useState, useEffect } from 'react';
import { WorkoutContext } from '../context/WorkoutContext';
import ExerciseResult from '../components/workout/ExerciseResult';
import CreateTemplateModal from '../components/workout/CreateTemplateModal';
import GuidedWorkoutView from '../components/workout/GuidedWorkoutView';
import Modal from '../components/common/Modal'; // Import reusable Modal
import { Play, Plus, Clock, XCircle, Check } from 'lucide-react';
import './TrackWorkout.css';

const TrackWorkout = () => {
    const { activeWorkout, exercises, cancelWorkout, templates, startWorkoutFromTemplate, startWorkout, deleteTemplate, startGuidedSession } = useContext(WorkoutContext);
    const [showSelector, setShowSelector] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);

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

    if (!activeWorkout) {
        return (
            <div className="track-workout-container">
                <div className="start-screen-container">
                    {/* Quick Start Card */}
                    {/* Quick Start Card - DISABLED FOR V0 STABILIZATION (P0-1) */}
                    {/* <div className="quick-start-card" onClick={() => startWorkout("Quick Workout")}>
                        <div className="glow-effect"></div>
                        <div className="quick-start-content">
                            <div className="quick-play-icon">
                                <Play size={32} fill="currentColor" />
                            </div>
                            <h2>Quick Start</h2>
                            <p>Jump straight in, track on the fly</p>
                        </div>
                    </div> */}

                    {/* Templates Section */}
                    <div>
                        <div className="section-header">
                            <h3>Your Templates</h3>
                        </div>
                        <div className="templates-grid">
                            {templates.map(template => (
                                <div
                                    key={template.id}
                                    className="template-tile"
                                    onClick={() => startWorkoutFromTemplate(template.id)}
                                >
                                    <div className="template-tile-header">
                                        <div className="template-name">{template.name}</div>
                                        {template.isCustom && (
                                            <button
                                                className="delete-mini-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteConfirmation({
                                                        isOpen: true,
                                                        templateId: template.id,
                                                        templateName: template.name
                                                    });
                                                }}
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="template-meta">
                                        {template.exercises.length} Exercises
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="create-btn-area">
                            <button
                                className="create-template-btn"
                                onClick={() => setShowSelector(true)}
                            >
                                <Plus size={20} />
                                <span>Create New Template</span>
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
    const isGuidedMode = activeWorkout.status === 'active';

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
                            onClick={() => {
                                startGuidedSession();
                            }}
                            className="finish-btn"
                            style={{ width: '100%', padding: '15px 0', fontSize: '1.2rem', background: 'var(--primary)', color: 'black', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <Play size={20} fill="currentColor" />
                            START WORKOUT
                        </button>
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
                            />
                        );
                    })}

                    <div style={{ padding: '0 20px', marginTop: '20px' }}>
                        <button
                            onClick={() => {
                                startGuidedSession();
                            }}
                            className="finish-btn"
                            style={{ width: '100%', padding: '15px 0', fontSize: '1.2rem', background: 'var(--primary)', color: 'black', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
