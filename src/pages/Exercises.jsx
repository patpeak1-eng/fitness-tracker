import React, { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';
import BackButton from '../components/common/BackButton';
import './Exercises.css';

const CATEGORIES = ['All', 'Weights', 'Calisthenics', 'Cardio', 'Yoga'];

const Exercises = () => {
    const { exercises } = useWorkout();
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [expandedId, setExpandedId] = useState(null);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return (exercises || []).filter((ex) => {
            const matchesCategory = activeCategory === 'All' || ex.category === activeCategory;
            const matchesSearch = !q || (ex.name || '').toLowerCase().includes(q);
            return matchesCategory && matchesSearch;
        });
    }, [exercises, search, activeCategory]);

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
