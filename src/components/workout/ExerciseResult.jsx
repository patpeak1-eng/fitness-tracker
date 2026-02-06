import React, { useState } from 'react';
import { Info, Plus, Check } from 'lucide-react';
import { useWorkout } from '../../context/WorkoutContext';
import InstructionModal from './InstructionModal';
import './ExerciseResult.css';

const ExerciseResult = ({ exerciseId, exercises, workoutData, isPrep = false }) => {
    const { units } = useWorkout();
    const [showModal, setShowModal] = useState(false);

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

    const [sets, setSets] = useState(initialSets);

    // If exercise is missing, show a non-crashing UI
    if (!exercise || exercise.id === 'unknown') {
        return (
            <div className="p-4 border border-red-500 bg-red-500/10 rounded-lg my-2">
                <p className="text-red-500 font-bold">⚠️ Data Mismatch: {exerciseId}</p>
            </div>
        );
    }

    // Grid Columns Logic: Prep Mode = 3 columns (Set, Weight, Reps). Active Mode = 4 cols (Set, Weight, Reps, RPE)
    const gridStyle = isPrep
        ? { gridTemplateColumns: '0.5fr 1fr 1fr' }
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
            </header>

            {/* Sets Header */}
            <div className="sets-header" style={gridStyle}>
                <div className="col-set">SET</div>
                <div className="col-weight">{units === 'imperial' ? 'LBS' : 'KGS'}</div>
                <div className="col-reps">REPS</div>
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
                                placeholder={isBodyweight ? "Body Wt" : "-"}
                                defaultValue={isBodyweight ? "Body Wt" : set.weight}
                                disabled={isBodyweight}
                            />
                        </div>
                        <div className="col-reps">
                            <input type="number" placeholder="-" defaultValue={set.reps} />
                        </div>
                        {!isPrep && (
                            <div className="col-reps">
                                <input type="number" placeholder="-" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <button className="add-set-btn">
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
