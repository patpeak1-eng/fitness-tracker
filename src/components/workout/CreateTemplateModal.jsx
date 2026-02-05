import React, { useState } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { useWorkout } from '../../context/WorkoutContext';
import ExerciseSelector from '../workout/ExerciseSelector';
import Modal from '../common/Modal';
import './TemplateSelector.css'; // Reusing styles

const CreateTemplateModal = ({ onClose }) => {
    const { saveCustomTemplate, startWorkoutFromTemplate, exercises: availableExercises } = useWorkout();
    const [name, setName] = useState('');
    const [exercises, setExercises] = useState([]);
    const [showExerciseSelector, setShowExerciseSelector] = useState(false);

    // Temp state for exercise selector
    const handleAddExercise = (exercise) => {
        // Default set structure
        const newExercise = {
            id: exercise.id, // Keep original ID reference
            name: exercise.name, // Snapshot name
            sets: [
                { id: Date.now(), weight: 0, targetReps: 0, completed: false }
            ]
        };
        setExercises(prev => [...prev, newExercise]);
        setShowExerciseSelector(false);
    };

    const removeExercise = (index) => {
        setExercises(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        if (!name.trim()) {
            alert("Please identify this template.");
            return;
        }
        if (exercises.length === 0) {
            alert("Please add at least one exercise.");
            return;
        }

        // Format for context
        // Context expects: { id, sets: [...] } OR plain ID string (legacy)
        // We will send the rich object structure to support default sets/reps if we want to expand later
        // But for now context's saveCustomTemplate expects 'exercisesList'

        // Actually, looking at WorkoutContext structure:
        // saveCustomTemplate takes (name, exercisesList)
        // where exercisesList is array of objects { id: exerciseId, sets: numSets } or just ID strings

        // Let's standardise on the object format the context uses:
        // { id: "ex_id", sets: 3 } (simple) or full object?
        // Context `startWorkoutFromTemplate` handles "typeof exItem === 'object' && item.exercise" ??
        // Let's look at `startWorkoutFromTemplate`:
        // const exId = (typeof item === 'object' && item.exercise) ? item.exercise.id : item;
        // Wait, if it's an object, it expects `item.exercise.id`? 
        // OR `const exId = typeof exItem === 'string' ? exItem : exItem.id;` (Line 784 in context)

        // Let's stick to the cleanest format supported by `startWorkoutFromTemplate` at line 782:
        // It maps over template.exercises. 
        // If exItem has .id, it uses that.
        // So we should save an array of { id: exerciseId, sets: 3 }

        const templateData = exercises.map(ex => ({
            id: ex.id,           // Required for Context compatibility
            exerciseId: ex.id,   // Requested by User (redundant but explicit)
            name: ex.name,       // Requested by User (Snapshot name)
            sets: 3 // Default for now
        }));

        const newTemplate = saveCustomTemplate(name, templateData);
        if (newTemplate) {
            startWorkoutFromTemplate(newTemplate);
        }
        onClose();
    };

    return (
        <div className="template-selector-overlay">
            <div className="template-selector-content" style={{ height: '90vh' }}>
                <header className="selector-header">
                    <h2>New Template</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </header>

                <div style={{ padding: '0 1.5rem 1rem' }}>
                    <input
                        type="text"
                        placeholder="Template Name (e.g., Leg Day)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '1.1rem',
                            marginBottom: '1rem'
                        }}
                    />
                </div>

                <div className="template-list" style={{ flex: 1 }}>
                    {exercises.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            <p>No exercises added yet.</p>
                            <button
                                onClick={() => setShowExerciseSelector(true)}
                                className="secondary-btn"
                                style={{ marginTop: '1rem' }}
                            >
                                <Plus size={16} /> Add Exercise
                            </button>
                        </div>
                    ) : (
                        exercises.map((ex, idx) => (
                            <div key={`${ex.id}-${idx}`} className="template-card" style={{ cursor: 'default' }}>
                                <div className="template-info">
                                    <h3>{ex.name}</h3>
                                    <p>3 Sets (Default)</p>
                                </div>
                                <button
                                    onClick={() => removeExercise(idx)}
                                    className="delete-tpl-btn"
                                    style={{ color: 'var(--error)' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))
                    )}

                    {exercises.length > 0 && (
                        <button
                            onClick={() => setShowExerciseSelector(true)}
                            className="secondary-btn"
                            style={{ margin: '1rem 0' }}
                        >
                            <Plus size={16} /> Add Another Exercise
                        </button>
                    )}
                </div>

                <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                        className="primary-btn-large"
                        onClick={handleSave}
                        disabled={!name.trim() || exercises.length === 0}
                        style={{ opacity: (!name.trim() || exercises.length === 0) ? 0.5 : 1 }}
                    >
                        Save Template
                    </button>
                </div>

                {showExerciseSelector && (
                    <ExerciseSelector
                        exercises={availableExercises}
                        onSelect={handleAddExercise}
                        onClose={() => setShowExerciseSelector(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default CreateTemplateModal;
