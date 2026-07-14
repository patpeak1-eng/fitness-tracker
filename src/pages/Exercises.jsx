import React, { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';
import BackButton from '../components/common/BackButton';
import ExerciseIllustration from '../components/common/ExerciseIllustration';
import {
    CATEGORIES, MUSCLE_GROUPS,
    matchesSearch, matchesCategory, matchesMuscle, matchesEquipmentProfile,
} from '../utils/exerciseFilters';
import '../styles/filter-chips.css';
import './Exercises.css';

const Exercises = () => {
    const { exercises, equipmentProfiles, customEquipmentItems } = useWorkout();
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    // Local-only browsing filters — deliberately do NOT touch the saved
    // activeEquipmentProfileId or sessionEquipmentOverride (this page is
    // read-only reference; TrackWorkout owns the real equipment selection).
    const [equipmentProfileId, setEquipmentProfileId] = useState('all');
    const [activeMuscle, setActiveMuscle] = useState('All');
    const [expandedId, setExpandedId] = useState(null);

    const filtered = useMemo(() => {
        let equipmentList = null; // null = no equipment filter
        if (equipmentProfileId !== 'all') {
            const p = (equipmentProfiles || []).find(p => p.id === equipmentProfileId);
            if (p) equipmentList = p.id === 'custom' ? customEquipmentItems : p.equipment;
        }
        return (exercises || []).filter((ex) =>
            matchesSearch(ex, search) &&
            matchesCategory(ex, activeCategory) &&
            matchesMuscle(ex, activeMuscle) &&
            matchesEquipmentProfile(ex, equipmentList)
        );
    }, [exercises, search, activeCategory, activeMuscle, equipmentProfileId, equipmentProfiles, customEquipmentItems]);

    const toggle = (id) => setExpandedId((prev) => (prev === id ? null : id));

    return (
        <div className="exercises-page">
            <header className="ex-header">
                <BackButton />
                <h1>Exercise Library</h1>
            </header>

            <div className="ex-search">
                <Search size={18} className="ex-search-icon" />
                <input
                    type="text"
                    className="ex-search-input"
                    placeholder="Search exercises..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="ex-tabs">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat}
                        className={`ex-tab ${activeCategory === cat ? 'active' : ''}`}
                        onClick={() => setActiveCategory(cat)}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="ex-filter-row" aria-label="Filter by equipment profile">
                <button
                    className={`filter-chip${equipmentProfileId === 'all' ? ' active' : ''}`}
                    onClick={() => setEquipmentProfileId('all')}
                >
                    Any Equipment
                </button>
                {(equipmentProfiles || []).map((p) => (
                    <button
                        key={p.id}
                        className={`filter-chip${equipmentProfileId === p.id ? ' active' : ''}`}
                        onClick={() => setEquipmentProfileId(p.id)}
                    >
                        {p.name}
                    </button>
                ))}
            </div>

            <div className="ex-filter-row" aria-label="Filter by muscle group">
                {MUSCLE_GROUPS.map((muscle) => (
                    <button
                        key={muscle}
                        className={`filter-chip${activeMuscle === muscle ? ' active' : ''}`}
                        onClick={() => setActiveMuscle(muscle)}
                    >
                        {muscle}
                    </button>
                ))}
            </div>

            <div className="ex-count">
                {filtered.length} exercise{filtered.length === 1 ? '' : 's'}
            </div>

            <div className="ex-list">
                {filtered.map((ex) => {
                    const isOpen = expandedId === ex.id;
                    return (
                        <div
                            key={ex.id}
                            className={`ex-card ${isOpen ? 'open' : ''}`}
                            onClick={() => toggle(ex.id)}
                        >
                            <div className="ex-card-main">
                                <div className="ex-card-info">
                                    <h3 className="ex-name">{ex.name}</h3>
                                    {ex.illustration && (
                                        <ExerciseIllustration
                                            exerciseId={ex.id}
                                            illustration={ex.illustration}
                                            size="thumbnail"
                                        />
                                    )}
                                    <div className="ex-meta">
                                        {ex.primary_muscle && <span className="ex-muscle">{ex.primary_muscle}</span>}
                                        {ex.equipment && <span className="ex-equip">{ex.equipment}</span>}
                                    </div>
                                </div>
                                <div className="ex-card-right">
                                    <span className="ex-badge">{ex.category}</span>
                                    <ChevronDown size={18} className={`ex-chevron ${isOpen ? 'open' : ''}`} />
                                </div>
                            </div>
                            {isOpen && (
                                <p className="ex-instructions">
                                    {ex.instructions || 'No instructions available for this exercise.'}
                                </p>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="ex-empty">No exercises match your search.</div>
                )}
            </div>
        </div>
    );
};

export default Exercises;
