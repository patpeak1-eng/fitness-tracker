import React, { useState, useMemo } from 'react';
import { X, Plus, Search, Check } from 'lucide-react';
import ExerciseIllustration from '../common/ExerciseIllustration';
import CustomExerciseForm from './CustomExerciseForm';
import {
    CATEGORIES, MUSCLE_GROUPS, EQUIPMENT,
    matchesSearch, matchesCategory, matchesMuscle, matchesEquipmentTerm,
} from '../../utils/exerciseFilters';
import '../../styles/filter-chips.css';
import './ExerciseSelector.css';

const ExerciseSelector = ({
    exercises,
    onSelect,
    onClose,
    activeCategory,
    setActiveCategory,
    activeEquipment,
    setActiveEquipment,
    activeMuscle,
    setActiveMuscle,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    // Multi-select: exercise IDs staged for adding this open cycle
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [showCustomForm, setShowCustomForm] = useState(false);

    const filteredExercises = useMemo(() => {
        return exercises.filter(ex =>
            matchesSearch(ex, searchTerm) &&
            matchesCategory(ex, activeCategory) &&
            matchesMuscle(ex, activeMuscle) &&
            matchesEquipmentTerm(ex, activeEquipment)
        );
    }, [exercises, searchTerm, activeCategory, activeMuscle, activeEquipment]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleConfirmSelection = () => {
        if (selectedIds.size === 0) return;
        // Preserve data order; add each staged exercise via the existing onSelect contract
        exercises.filter(ex => selectedIds.has(ex.id)).forEach(ex => onSelect(ex));
        onClose();
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
                                {EQUIPMENT.map(equip => (
                                    <button
                                        key={equip}
                                        className={`filter-chip-sm ${activeEquipment === equip ? 'active' : ''}`}
                                        onClick={() => setActiveEquipment(equip)}
                                    >
                                        {equip}
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
                                <div className="no-results">No exercises match these filters</div>
                            ) : (
                                filteredExercises.map((exercise) => {
                                    const isSelected = selectedIds.has(exercise.id);
                                    return (
                                        <div
                                            key={exercise.id}
                                            className="exercise-item"
                                            onClick={() => toggleSelect(exercise.id)}
                                            style={isSelected ? {
                                                borderLeft: '2px solid var(--primary)',
                                                background: 'rgba(var(--primary-rgb), 0.08)'
                                            } : undefined}
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
                                            <button
                                                className="add-btn"
                                                aria-pressed={isSelected}
                                                aria-label={isSelected ? `Deselect ${exercise.name}` : `Select ${exercise.name}`}
                                                style={isSelected ? {
                                                    background: 'var(--primary)',
                                                    color: '#000',
                                                    borderColor: 'var(--primary)'
                                                } : undefined}
                                            >
                                                {isSelected ? <Check size={20} /> : <Plus size={20} />}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {selectedIds.size > 0 && (
                            <div style={{
                                padding: '1rem 1.5rem',
                                borderTop: '1px solid var(--border-color)',
                                background: 'var(--bg-card)'
                            }}>
                                <button
                                    onClick={handleConfirmSelection}
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        background: 'var(--primary)',
                                        color: '#000',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontSize: '1rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Add {selectedIds.size} exercise{selectedIds.size === 1 ? '' : 's'}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    /* CUSTOM FORM — shared component, also used by the Exercise Library page */
                    <CustomExerciseForm
                        exercises={exercises}
                        onCancel={() => setShowCustomForm(false)}
                        onCreated={(name) => {
                            setShowCustomForm(false);
                            setSearchTerm(name); // pre-fill search to find it immediately
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default ExerciseSelector;
