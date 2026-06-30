import React, { useState, useMemo } from 'react';
import { X, Plus, Search, Filter } from 'lucide-react';
import { useWorkout } from '../../context/WorkoutContext';
import ExerciseIllustration from '../common/ExerciseIllustration';
import './ExerciseSelector.css';

const CATEGORIES = ['All', 'Weight Lifting', 'Calisthenics', 'Yoga', 'Cardio', 'Functional'];
const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Abs', 'Full Body'];

const ExerciseSelector = ({ exercises, onSelect, onClose }) => {
    const { addCustomExercise } = useWorkout();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeMuscle, setActiveMuscle] = useState('All');
    const [showCustomForm, setShowCustomForm] = useState(false);

    // Custom Form State
    const [customName, setCustomName] = useState('');
    const [customCategory, setCustomCategory] = useState('Weight Lifting');
    const [customMuscle, setCustomMuscle] = useState('Full Body');

    const filteredExercises = useMemo(() => {
        return exercises.filter(ex => {
            const matchesSearch = ex.name.toLowerCase().includes(searchTerm.toLowerCase());

            // Map UI category to Data category
            let targetCategory = activeCategory;
            if (activeCategory === 'Weight Lifting') targetCategory = 'Weights';

            const matchesCategory = activeCategory === 'All' || ex.category === targetCategory;

            // Map property name 'primary_muscle'
            const matchesMuscle = activeMuscle === 'All' || ex.primary_muscle === activeMuscle;

            return matchesSearch && matchesCategory && matchesMuscle;
        });
    }, [exercises, searchTerm, activeCategory, activeMuscle]);

    const handleCreateCustom = (e) => {
        e.preventDefault();
        if (!customName.trim()) return;

        const newExercise = {
            name: customName,
            category: customCategory === 'Weight Lifting' ? 'Weights' : customCategory,
            primary_muscle: customMuscle, // Use correct property name
            instructions: 'Custom user exercise',
            isCustom: true
        };

        addCustomExercise(newExercise);
        // We'll rely on the context update to refresh the list, and then we could select it
        // Or we pass it directly to onSelect? 
        // Let's just reset form and let user select it (it will appear in search/list)
        setShowCustomForm(false);
        setCustomName('');
        setSearchTerm(customName); // Pre-fill search to find it immediately
    };

    return (
        <div className="exercise-selector-overlay">
            <div className="exercise-selector-content">
                <header className="selector-header">
                    <h2>{showCustomForm ? 'Create Custom Exercise' : 'Add Exercise'}</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </header>

                {!showCustomForm ? (
                    <>
                        {/* SEARCH & FILTERS */}
                        <div className="selector-filters">
                            <div className="search-bar">
                                <Search size={18} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="filter-chips-row">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat}
                                        className={`filter-chip ${activeCategory === cat ? 'active' : ''}`}
                                        onClick={() => setActiveCategory(cat)}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            <div className="filter-chips-row secondary">
                                {MUSCLE_GROUPS.map(muscle => (
                                    <button
                                        key={muscle}
                                        className={`filter-chip-sm ${activeMuscle === muscle ? 'active' : ''}`}
                                        onClick={() => setActiveMuscle(muscle)}
                                    >
                                        {muscle}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* LIST */}
                        <div className="exercise-list">
                            <button className="create-custom-btn-list" onClick={() => setShowCustomForm(true)}>
                                <Plus size={18} />
                                <span>Create New Exercise</span>
                            </button>

                            {filteredExercises.length === 0 ? (
                                <div className="no-results">No exercises found. Create one?</div>
                            ) : (
                                filteredExercises.map((exercise) => (
                                    <div
                                        key={exercise.id}
                                        className="exercise-item"
                                        onClick={() => onSelect(exercise)}
                                    >
                                        <div className="exercise-info">
                                            <span className="exercise-name">{exercise.name}</span>
                                            {exercise.illustration && (
                                                <ExerciseIllustration
                                                    exerciseId={exercise.id}
                                                    illustration={exercise.illustration}
                                                    size="thumbnail"
                                                />
                                            )}
                                            <span className="exercise-meta">
                                                {exercise.primary_muscle} • {exercise.subMuscle || exercise.category}
                                            </span>
                                        </div>
                                        <button className="add-btn">
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    /* CUSTOM FORM */
                    <form className="custom-exercise-form" onSubmit={handleCreateCustom}>
                        <div className="form-group">
                            <label>Exercise Name</label>
                            <input
                                type="text"
                                autoFocus
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder="e.g. Weighted Pullup"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Category</label>
                            <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}>
                                {CATEGORIES.filter(c => c !== 'All').map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Muscle Focus</label>
                            <select value={customMuscle} onChange={(e) => setCustomMuscle(e.target.value)}>
                                {MUSCLE_GROUPS.filter(m => m !== 'All').map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-actions">
                            <button type="button" className="secondary-btn" onClick={() => setShowCustomForm(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="primary-btn">
                                Create Exercise
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ExerciseSelector;
