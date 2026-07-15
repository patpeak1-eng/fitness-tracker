import React, { useMemo, useState } from 'react';
import {
    Camera, ChevronDown, ChevronRight, Pencil, Plus, ScanLine, Target,
    Trash2, UtensilsCrossed, Tag
} from 'lucide-react';
import {
    CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { useWorkout } from '../context/WorkoutContext';
import StorageService from '../services/StorageService';
import Modal from '../components/common/Modal';
import FoodLogFlow from '../components/nutrition/FoodLogFlow';
import EntryForm from '../components/nutrition/EntryForm';
import { ema } from '../utils/ema';
import './Nutrition.css';

const dayKey = (d) => new Date(d).toDateString();

// Last n calendar days, ascending, midnight-anchored.
const buildDays = (n) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (n - 1 - i));
        return d;
    });
};

const SOURCE_ICONS = {
    photo: Camera,
    label: Tag,
    barcode: ScanLine
};

const RANGES = [7, 30, 90];

const Nutrition = () => {
    const {
        foodLog, weightHistory, currentProfile,
        deleteFoodLogEntry, updateFoodLogEntry
    } = useWorkout();

    const [showLog, setShowLog] = useState(false);
    const [editEntry, setEditEntry] = useState(null);
    const [rangeDays, setRangeDays] = useState(7);
    const [expandedDays, setExpandedDays] = useState(() => new Set([dayKey(new Date())]));
    const [showTargets, setShowTargets] = useState(false);
    const [targets, setTargets] = useState(() =>
        currentProfile ? StorageService.loadNutritionTargets(currentProfile.id) : null
    );
    const [targetDraft, setTargetDraft] = useState({ calories: '', protein_g: '' });

    // --- Today ---
    const todayEntries = useMemo(() => {
        const k = dayKey(new Date());
        return foodLog.filter(e => dayKey(e.logged_at) === k);
    }, [foodLog]);

    const todayTotals = useMemo(() => todayEntries.reduce((acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein_g: acc.protein_g + (e.protein_g || 0),
        carbs_g: acc.carbs_g + (e.carbs_g || 0),
        fat_g: acc.fat_g + (e.fat_g || 0)
    }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }), [todayEntries]);

    // --- Trend chart (last 30 days, local data only — works offline) ---
    const chartData = useMemo(() => {
        const days = buildDays(30);
        const calsByDay = new Map();
        foodLog.forEach(e => {
            const k = dayKey(e.logged_at);
            calsByDay.set(k, (calsByDay.get(k) || 0) + (e.calories || 0));
        });
        const weightByDay = new Map();
        [...weightHistory]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .forEach(w => weightByDay.set(dayKey(w.date), w.weight)); // last of the day wins

        const calSeries = days.map(d => calsByDay.has(dayKey(d)) ? calsByDay.get(dayKey(d)) : null);
        const wtSeries = days.map(d => weightByDay.has(dayKey(d)) ? weightByDay.get(dayKey(d)) : null);
        const calEma = ema(calSeries);
        const wtEma = ema(wtSeries);

        return days.map((d, i) => ({
            label: `${d.getMonth() + 1}/${d.getDate()}`,
            cal: calSeries[i],
            calEma: calEma[i] === null ? null : Math.round(calEma[i]),
            wt: wtSeries[i],
            wtEma: wtEma[i] === null ? null : Math.round(wtEma[i] * 10) / 10
        }));
    }, [foodLog, weightHistory]);

    const hasChartData = chartData.some(d => d.calEma !== null || d.wtEma !== null);

    // --- History (day groups, reverse-chronological) ---
    const historyGroups = useMemo(() => {
        const since = new Date();
        since.setHours(0, 0, 0, 0);
        since.setDate(since.getDate() - (rangeDays - 1));
        const groups = new Map();
        foodLog
            .filter(e => new Date(e.logged_at) >= since)
            .forEach(e => {
                const k = dayKey(e.logged_at);
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(e);
            });
        return [...groups.entries()]
            .sort((a, b) => new Date(b[0]) - new Date(a[0]))
            .map(([k, entries]) => ({
                key: k,
                date: new Date(k),
                entries: entries.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at)),
                calories: entries.reduce((s, e) => s + (e.calories || 0), 0)
            }));
    }, [foodLog, rangeDays]);

    const toggleDay = (k) => setExpandedDays(prev => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k); else next.add(k);
        return next;
    });

    const confirmDelete = (entry) => {
        if (window.confirm(`Delete "${entry.description}"?`)) {
            deleteFoodLogEntry(entry.id);
        }
    };

    const openTargets = () => {
        setTargetDraft({
            calories: targets?.calories ?? '',
            protein_g: targets?.protein_g ?? ''
        });
        setShowTargets(true);
    };

    const saveTargets = () => {
        const cal = Number(targetDraft.calories);
        const pro = Number(targetDraft.protein_g);
        const next = {
            calories: Number.isFinite(cal) && cal > 0 ? Math.round(cal) : null,
            protein_g: Number.isFinite(pro) && pro > 0 ? Math.round(pro) : null
        };
        const normalized = (next.calories || next.protein_g) ? next : null;
        setTargets(normalized);
        if (currentProfile) StorageService.saveNutritionTargets(currentProfile.id, normalized);
        setShowTargets(false);
    };

    const renderEntryRow = (e) => {
        const SourceIcon = SOURCE_ICONS[e.source];
        return (
            <li key={e.id} className="nutrition-entry-row">
                <div className="nutrition-entry-main">
                    <span className="nutrition-entry-desc">
                        {e.description}
                        {e.confidence && <span className="entry-estimated-chip">est.</span>}
                    </span>
                    <span className="nutrition-entry-meta">
                        {new Date(e.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {SourceIcon && <SourceIcon size={11} className="entry-source-icon" />}
                    </span>
                </div>
                <span className="nutrition-entry-cal">{e.calories}</span>
                <button className="entry-icon-btn" aria-label={`Edit ${e.description}`}
                    onClick={() => setEditEntry(e)}>
                    <Pencil size={15} />
                </button>
                <button className="entry-icon-btn danger" aria-label={`Delete ${e.description}`}
                    onClick={() => confirmDelete(e)}>
                    <Trash2 size={15} />
                </button>
            </li>
        );
    };

    return (
        <div className="nutrition-page">
            <header className="nutrition-header">
                <h1>Nutrition</h1>
                <button className="entry-save-btn" onClick={() => setShowLog(true)}>
                    <Plus size={16} /> Log food
                </button>
            </header>

            {/* Today band */}
            <section className="nutrition-today-card">
                <div className="nutrition-today-top">
                    <span className="nutrition-today-label">Today</span>
                    <button className="targets-btn" onClick={openTargets} aria-label="Set daily targets">
                        <Target size={14} /> {targets ? 'Targets' : 'Set targets'}
                    </button>
                </div>
                <span className="nutrition-today-value">
                    {todayTotals.calories}
                    {targets?.calories ? <span className="nutrition-today-target"> / {targets.calories}</span> : null}
                </span>
                <span className="nutrition-today-unit">kcal · {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'}</span>
                <div className="macro-row">
                    <div className="macro-cell">
                        <span className="macro-value">
                            {Math.round(todayTotals.protein_g)}
                            {targets?.protein_g ? `/${targets.protein_g}` : ''}
                        </span>
                        <span className="macro-label">Protein g</span>
                    </div>
                    <div className="macro-cell">
                        <span className="macro-value">{Math.round(todayTotals.carbs_g)}</span>
                        <span className="macro-label">Carbs g</span>
                    </div>
                    <div className="macro-cell">
                        <span className="macro-value">{Math.round(todayTotals.fat_g)}</span>
                        <span className="macro-label">Fat g</span>
                    </div>
                </div>
            </section>

            {/* 7-day EMA trend — smoothed calories + weight, raw points muted */}
            <section className="nutrition-chart-card">
                <h2>Trend <span className="chart-sub">7-day smoothed · ~ values are directional</span></h2>
                {hasChartData ? (
                    <div className="nutrition-chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -18, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={11}
                                    tickLine={false} axisLine={false} dy={8} interval={6} />
                                <YAxis yAxisId="cal" stroke="var(--text-secondary)" fontSize={11}
                                    tickLine={false} axisLine={false} />
                                <YAxis yAxisId="wt" orientation="right" stroke="var(--text-secondary)"
                                    fontSize={11} tickLine={false} axisLine={false} width={38}
                                    domain={['auto', 'auto']} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-card)',
                                        borderColor: 'var(--border)',
                                        borderRadius: '8px',
                                        color: 'var(--text-primary)'
                                    }}
                                    labelStyle={{ color: 'var(--text-secondary)', marginBottom: '5px' }}
                                />
                                {/* raw points, muted */}
                                <Line yAxisId="cal" dataKey="cal" name="Calories (day)" stroke="none"
                                    dot={{ r: 2, fill: 'var(--text-muted)', strokeWidth: 0 }} isAnimationActive={false} />
                                <Line yAxisId="wt" dataKey="wt" name="Weight (day)" stroke="none"
                                    dot={{ r: 2, fill: 'var(--text-muted)', strokeWidth: 0 }} isAnimationActive={false} />
                                {/* smoothed series */}
                                <Line yAxisId="cal" type="monotone" dataKey="calEma" name="Calories (7d avg)"
                                    stroke="var(--primary)" strokeWidth={2.5} dot={false} connectNulls />
                                <Line yAxisId="wt" type="monotone" dataKey="wtEma" name="Weight (7d avg)"
                                    stroke="var(--text-secondary)" strokeWidth={2} dot={false} connectNulls />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="chart-empty">Log meals and weigh-ins for a few days to see your trend.</p>
                )}
            </section>

            {/* Today's entries */}
            {todayEntries.length === 0 ? (
                <div className="nutrition-empty">
                    <UtensilsCrossed size={28} />
                    <p>Nothing logged today. Tap "Log food" to add your first entry.</p>
                </div>
            ) : (
                <ul className="nutrition-entry-list">
                    {[...todayEntries]
                        .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at))
                        .map(renderEntryRow)}
                </ul>
            )}

            {/* History */}
            <section className="nutrition-history">
                <div className="nutrition-history-head">
                    <h2>History</h2>
                    <div className="range-tabs">
                        {RANGES.map(r => (
                            <button key={r}
                                className={`range-tab ${rangeDays === r ? 'active' : ''}`}
                                onClick={() => setRangeDays(r)}>
                                {r}d
                            </button>
                        ))}
                    </div>
                </div>
                {historyGroups.length === 0 ? (
                    <p className="chart-empty">No entries in this range.</p>
                ) : (
                    <div className="history-groups">
                        {historyGroups.map(g => (
                            <div key={g.key} className="history-group">
                                <button className="history-day-head" onClick={() => toggleDay(g.key)}
                                    aria-expanded={expandedDays.has(g.key)}>
                                    {expandedDays.has(g.key)
                                        ? <ChevronDown size={16} />
                                        : <ChevronRight size={16} />}
                                    <span className="history-day-date">
                                        {g.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </span>
                                    <span className="history-day-total">{g.calories} kcal</span>
                                </button>
                                {expandedDays.has(g.key) && (
                                    <ul className="nutrition-entry-list nested">
                                        {g.entries.map(renderEntryRow)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Log flow */}
            <Modal isOpen={showLog} onClose={() => setShowLog(false)} title="Log food">
                <FoodLogFlow onDone={() => setShowLog(false)} onCancel={() => setShowLog(false)} />
            </Modal>

            {/* Edit entry */}
            <Modal isOpen={!!editEntry} onClose={() => setEditEntry(null)} title="Edit entry">
                {editEntry && (
                    <EntryForm
                        initial={editEntry}
                        estimated={!!editEntry.confidence}
                        confidence={editEntry.confidence}
                        saveLabel="Save changes"
                        onSave={async (draft) => {
                            await updateFoodLogEntry(editEntry.id, draft);
                            setEditEntry(null);
                        }}
                        onCancel={() => setEditEntry(null)}
                    />
                )}
            </Modal>

            {/* Targets */}
            <Modal isOpen={showTargets} onClose={() => setShowTargets(false)} title="Daily targets">
                <div className="nutrition-entry-form">
                    <p className="photo-hint">
                        Optional. Leave blank to clear — nothing is calculated for you.
                    </p>
                    <div className="form-group">
                        <label>Calories target</label>
                        <input type="number" inputMode="numeric" min="0"
                            value={targetDraft.calories}
                            onChange={e => setTargetDraft(t => ({ ...t, calories: e.target.value }))}
                            placeholder="e.g. 2200" />
                    </div>
                    <div className="form-group">
                        <label>Protein target (g)</label>
                        <input type="number" inputMode="numeric" min="0"
                            value={targetDraft.protein_g}
                            onChange={e => setTargetDraft(t => ({ ...t, protein_g: e.target.value }))}
                            placeholder="e.g. 140" />
                    </div>
                    <div className="entry-form-actions">
                        <button className="entry-cancel-btn" onClick={() => setShowTargets(false)}>Cancel</button>
                        <button className="entry-save-btn" onClick={saveTargets}>Save targets</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Nutrition;
