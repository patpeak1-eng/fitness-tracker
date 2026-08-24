import React, { useMemo, useState } from 'react';
import { useWorkout } from '../../context/WorkoutContext';
import { CATEGORIES, MUSCLE_GROUPS } from '../../utils/exerciseFilters';
import './ExerciseSelector.css'; // owns .custom-exercise-form styles

// The single custom-exercise form, shared by ExerciseSelector (Build My Own)
// and the Exercise Library page. Extracted in S27 so creating an exercise no
// longer requires starting a template build.
const CustomExerciseForm = ({ exercises, onCreated, onCancel }) => {
    const { addCustomExercise } = useWorkout();
    const [name, setName] = useState('');
    const [category, setCategory] = useState('Weights');
    const [muscle, setMuscle] = useState('Full Body');
    const [equipment, setEquipment] = useState('None');
    const [isDurationBased, setIsDurationBased] = useState(false);

    // Equipment choices come from the library itself — the distinct values
    // already on exercises (compound "A/B" strings included; both filter
    // matchers understand them). 'None' is always offered.
    const equipmentOptions = useMemo(() => {
        const values = new Set();
        (exercises || []).forEach(ex => {
            if (ex.equipment && ex.equipment !== 'None') values.add(ex.equipment);
        });
        return ['None', ...[...values].sort()];
    }, [exercises]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        addCustomExercise({
            name: name.trim(),
            category, // canonical labels ARE the data values
            primary_muscle: muscle,
            equipment,
            // Drives the work timer: duration exercises keep it (S26 rule).
            isDurationBased,
            instructions: 'Custom user exercise',
            isCustom: true
        });
        onCreated?.(name.trim());
    };

    return (
        <form className="custom-exercise-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label>Exercise Name</label>
                <input
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Weighted Pullup"
                    required
                />
            </div>
            <div className="form-group">
                <label>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.filter(c => c !== 'All').map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <label>Muscle Focus</label>
                <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
                    {MUSCLE_GROUPS.filter(m => m !== 'All').map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <label>Equipment</label>
                <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                    {equipmentOptions.map(eq => (
                        <option key={eq} value={eq}>{eq}</option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <label className="form-toggle-row">
                    <input
                        type="checkbox"
                        checked={isDurationBased}
                        onChange={(e) => setIsDurationBased(e.target.checked)}
                    />
                    <span>Timed exercise (plank, hold, carry) — uses the work timer</span>
                </label>
            </div>

            <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="primary-btn">
                    Create Exercise
                </button>
            </div>
        </form>
    );
};

export default CustomExerciseForm;
