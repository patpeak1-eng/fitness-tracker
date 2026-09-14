import React, { useState } from 'react';
import { Info, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useWorkout } from '../../context/WorkoutContext';
import InstructionModal from './InstructionModal';
import './ExerciseResult.css';

// Prep mode may pass `onRequestRemoveExercise(instanceId, name)`: the page owns
// the confirmation and the collection (S32). `canRemoveExercise` is false when
// this is the last exercise — the control stays visible, disabled, with a
// reason, rather than vanishing.
const ExerciseResult = ({ exerciseId, exercises, workoutData, isPrep = false, invalidWeightSetKeys = [], canRemoveExercise = true, onRequestRemoveExercise = null }) => {
    const { units, updateSet, addSet, removeSet } = useWorkout();
    const [showModal, setShowModal] = useState(false);
    const showRemoveExercise = isPrep && !!workoutData && typeof onRequestRemoveExercise === 'function';
    const removeReasonId = workoutData ? `remove-reason-${workoutData.id}` : undefined;

    // CRITICAL: Find the exercise safely
    const safeExercises = exercises || [];
    const exercise = safeExercises.find(ex => ex.id === exerciseId);

    // Check if bodyweight
    const isBodyweight = exercise?.category === 'Calisthenics' || exercise?.category === 'Yoga' || exercise?.equipment === 'None';

    // Default sets state (normally this would sync with context/backend)
    const initialSets = (workoutData && workoutData.sets && workoutData.sets.length > 0)
        ? workoutData.sets
        : [
            { id: 1, weight: '', reps: '', completed: false },
            { id: 2, weight: '', reps: '', completed: false },
            { id: 3, weight: '', reps: '', completed: false }
        ];

    const sets = initialSets;

    // If exercise is missing, show a non-crashing UI
    if (!exercise || exercise.id === 'unknown') {
        return (
            <div className="p-4 border border-red-500 bg-red-500/10 rounded-lg my-2">
                <p className="text-red-500 font-bold">
                    <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} />
                    Data Mismatch: {exerciseId}
                </p>
            </div>
        );
    }

    // Grid Columns Logic: Prep Mode adds a compact action column so an athlete
    // can adjust a proposed plan before the guided workout begins.
    const gridStyle = isPrep
        ? { gridTemplateColumns: '0.5fr 1fr 1fr 44px' }
        : { gridTemplateColumns: '0.5fr 1fr 1fr 1fr' };

    return (
        <div className="exercise-result-card">
            <header className="exercise-header">
                <div className="header-left">
                    <h3>{exercise.name}</h3>
                    <button className="info-btn" onClick={() => setShowModal(true)}>
                        <Info size={16} />
                    </button>
                </div>
                {showRemoveExercise && (
                    // aria-disabled, not disabled: a `disabled` button leaves the
                    // tab order, so a screen reader never reaches it and the
                    // reason below is never announced. Keep it focusable and
                    // refuse the action in the handler (S32 code review P3).
                    <button
                        type="button"
                        className="remove-exercise-btn"
                        aria-label={`Remove ${exercise.name} from this workout`}
                        title={canRemoveExercise ? `Remove ${exercise.name}` : 'A workout needs at least one exercise'}
                        aria-describedby={canRemoveExercise ? undefined : removeReasonId}
                        aria-disabled={!canRemoveExercise}
                        onClick={() => {
                            if (!canRemoveExercise) return;
                            onRequestRemoveExercise(workoutData.id, exercise.name);
                        }}
                    >
                        <Trash2 size={18} />
                    </button>
                )}
            </header>
            {showRemoveExercise && !canRemoveExercise && (
                <p id={removeReasonId} className="remove-exercise-reason">
                    This is the only exercise left. A workout needs at least one.
                </p>
            )}

            {/* Sets Header */}
            <div className="sets-header" style={gridStyle}>
                <div className="col-set">SET</div>
                <div className="col-weight">{units === 'imperial' ? 'LBS' : 'KGS'}</div>
                <div className="col-reps">REPS</div>
                {isPrep && <div className="col-actions" aria-label="Set actions" />}
                {!isPrep && <div className="col-reps">RPE (1-10)</div>}
            </div>

            {/* Sets Rows */}
            <div className="sets-container">
                {sets.map((set, index) => (
                    <div key={index} className="set-row" style={gridStyle}>
                        <div className="col-set">{index + 1}</div>
                        <div className="col-weight">
                            <input
                                type={isBodyweight ? "text" : "number"}
                                placeholder={isBodyweight ? "BW" : "--"}
                                value={isBodyweight ? "BW" : (set.weight || '')}
                                min={isBodyweight ? undefined : "0"}
                                step={isBodyweight ? undefined : "any"}
                                disabled={isBodyweight}
                                className={isPrep && invalidWeightSetKeys.includes(`${workoutData?.id}:${set.id}`) ? 'invalid-prep-input' : ''}
                                aria-invalid={isPrep && invalidWeightSetKeys.includes(`${workoutData?.id}:${set.id}`)}
                                onChange={(event) => {
                                    if (!isPrep || isBodyweight || !workoutData) return;
                                    const weight = event.target.value === '' ? '' : Number(event.target.value);
                                    updateSet(workoutData.id, set.id, { weight });
                                }}
                            />
                        </div>
                        <div className="col-reps">
                            <input
                                type="number"
                                placeholder="--"
                                min="0"
                                value={set.targetReps || ''}
                                onChange={(event) => {
                                    if (!isPrep || !workoutData) return;
                                    const targetReps = event.target.value === '' ? '' : Number(event.target.value);
                                    updateSet(workoutData.id, set.id, { targetReps });
                                }}
                            />
                        </div>
                        {!isPrep && (
                            <div className="col-reps">
                                <input type="number" placeholder="-" />
                            </div>
                        )}
                        {isPrep && (
                            <div className="col-actions">
                                {workoutData && sets.length > 1 && (
                                    <button
                                        type="button"
                                        className="delete-set-btn"
                                        aria-label={`Remove set ${index + 1}`}
                                        title={`Remove set ${index + 1}`}
                                        onClick={() => removeSet(workoutData.id, set.id)}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <button
                className="add-set-btn"
                onClick={() => workoutData && addSet(workoutData.id)}
                disabled={!workoutData}
            >
                <Plus size={16} style={{ display: 'inline', marginRight: '5px' }} />
                Add Set
            </button>

            {showModal && (
                <InstructionModal
                    exercise={exercise}
                    isOpen={true}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
};

export default ExerciseResult;
