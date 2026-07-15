import React, { useState } from 'react';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';
import Modal from '../components/common/Modal';
import FoodLogFlow from '../components/nutrition/FoodLogFlow';
import './Nutrition.css';

// T3 shell: title + today's entries + the logging flow. The daily dashboard
// (totals, EMA chart) and history view land in Task 5 on this same page.
const Nutrition = () => {
    const { foodLog, deleteFoodLogEntry } = useWorkout();
    const [showLog, setShowLog] = useState(false);

    const todayKey = new Date().toDateString();
    const todayEntries = foodLog.filter(
        e => new Date(e.logged_at).toDateString() === todayKey
    );
    const todayCalories = todayEntries.reduce((sum, e) => sum + (e.calories || 0), 0);

    return (
        <div className="nutrition-page">
            <header className="nutrition-header">
                <h1>Nutrition</h1>
                <button className="entry-save-btn" onClick={() => setShowLog(true)}>
                    <Plus size={16} /> Log food
                </button>
            </header>

            <section className="nutrition-today-card">
                <span className="nutrition-today-label">Today</span>
                <span className="nutrition-today-value">{todayCalories}</span>
                <span className="nutrition-today-unit">kcal · {todayEntries.length} entries</span>
            </section>

            {todayEntries.length === 0 ? (
                <div className="nutrition-empty">
                    <UtensilsCrossed size={28} />
                    <p>Nothing logged today. Tap "Log food" to add your first entry.</p>
                </div>
            ) : (
                <ul className="nutrition-entry-list">
                    {todayEntries.map(e => (
                        <li key={e.id} className="nutrition-entry-row">
                            <div className="nutrition-entry-main">
                                <span className="nutrition-entry-desc">{e.description}</span>
                                <span className="nutrition-entry-meta">
                                    {new Date(e.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {e.source !== 'manual' ? ` · ${e.source}` : ''}
                                </span>
                            </div>
                            <span className="nutrition-entry-cal">{e.calories}</span>
                            <button
                                className="nutrition-entry-delete"
                                aria-label={`Delete ${e.description}`}
                                onClick={() => deleteFoodLogEntry(e.id)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <Modal isOpen={showLog} onClose={() => setShowLog(false)} title="Log food">
                <FoodLogFlow onDone={() => setShowLog(false)} onCancel={() => setShowLog(false)} />
            </Modal>
        </div>
    );
};

export default Nutrition;
