import React, { useState, useMemo } from 'react';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { TrendingUp, BarChart3, Info, X, Dumbbell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import BackButton from '../components/common/BackButton';
import CustomSelect from '../components/common/CustomSelect';
import { displayWeight } from '../utils/units';
import './AnalyticsView.css';

const RANGES = [
    { key: '1m', label: '1M', days: 30 },
    { key: '3m', label: '3M', days: 90 },
    { key: '1y', label: '1Y', days: 365 },
    { key: 'all', label: 'All', days: null }
];

// PR-proximity ring: how close the most recent session's e1RM sits to the
// all-time best (the percentage-based metric this screen owns; the weekly
// goal ring lives on the Dashboard).
const PrRing = ({ percent }) => {
    const r = 34;
    const c = 2 * Math.PI * r;
    const clamped = Math.min(100, Math.max(0, percent));
    return (
        <div className="pr-ring">
            <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r={r} fill="none" stroke="var(--input-bg)" strokeWidth="7" />
                <circle
                    cx="44" cy="44" r={r} fill="none"
                    stroke="var(--primary)" strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c - (clamped / 100) * c}
                    transform="rotate(-90 44 44)"
                />
            </svg>
            <div className="pr-ring-center">
                <span className="pr-ring-value">{clamped}%</span>
            </div>
        </div>
    );
};

const Analytics = () => {
    const { history, exercises, units } = useWorkout();
    const navigate = useNavigate();

    const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0]?.id || '');
    const [timeRange, setTimeRange] = useState('all');
    const [metric, setMetric] = useState('strength');
    const [showInfo, setShowInfo] = useState(false);

    const selectedExercise = exercises.find(ex => ex.id === selectedExerciseId);

    // One data point per session containing the selected exercise.
    const chartData = useMemo(() => {
        if (!history || history.length === 0 || !selectedExerciseId) return [];

        const dataPoints = [];
        history.forEach(workout => {
            const exerciseData = workout.exercises.find(ex => ex.exercise.id === selectedExerciseId);
            if (!exerciseData) return;

            let maxWeight = 0;
            let totalVolume = 0;
            let bestSet = null;

            exerciseData.sets.forEach(set => {
                const weight = set.weight || 0;
                const reps = set.reps || 0;
                const e1rm = reps > 1 ? Math.round(weight * (1 + reps / 30) * 10) / 10 : weight;
                if (e1rm > maxWeight) {
                    maxWeight = e1rm;
                    bestSet = set;
                }
                totalVolume += (weight * reps);
            });

            if (maxWeight > 0) {
                // Convert from the unit the workout was logged in to the
                // currently-selected display unit (legacy workouts → metric).
                const workoutUnit = workout.units || 'metric';
                dataPoints.push({
                    date: new Date(workout.endTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    fullDate: new Date(workout.endTime).toLocaleDateString(),
                    weight: displayWeight(maxWeight, workoutUnit, units),
                    volume: displayWeight(totalVolume, workoutUnit, units),
                    bestSetWeight: displayWeight(bestSet?.weight || 0, workoutUnit, units),
                    reps: bestSet ? bestSet.reps : 0,
                    originalDate: new Date(workout.endTime)
                });
            }
        });

        return dataPoints.sort((a, b) => a.originalDate - b.originalDate);
    }, [history, selectedExerciseId, units]);

    // All-time records (never range-filtered — a PR is a PR).
    const records = useMemo(() => {
        if (chartData.length === 0) return { maxStrength: 0, maxVolume: 0 };
        return {
            maxStrength: Math.max(...chartData.map(d => d.weight)),
            maxVolume: Math.max(...chartData.map(d => d.volume))
        };
    }, [chartData]);

    // Chart + session list respect the selected time range.
    const rangedData = useMemo(() => {
        const days = RANGES.find(r => r.key === timeRange)?.days;
        if (!days) return chartData;
        const cutoff = Date.now() - days * 86400000;
        return chartData.filter(d => d.originalDate.getTime() >= cutoff);
    }, [chartData, timeRange]);

    const latest = chartData[chartData.length - 1];
    const prPercent = records.maxStrength > 0 && latest
        ? Math.round((latest.weight / records.maxStrength) * 100)
        : 0;

    const recentSessions = useMemo(
        () => [...rangedData].reverse().slice(0, 5),
        [rangedData]
    );

    const weightUnit = units === 'metric' ? 'kg' : 'lbs';

    return (
        <div className="page analytics-page">
            <header className="page-header sticky-header">
                <div className="analytics-header-row">
                    <div className="analytics-header-title">
                        <BackButton />
                        <h1>Progress</h1>
                    </div>
                    <button
                        className="info-toggle-btn"
                        onClick={() => setShowInfo(!showInfo)}
                        title="How this works"
                        aria-label={showInfo ? 'Close explanation' : 'How this works'}
                    >
                        {showInfo ? <X size={22} /> : <Info size={22} />}
                    </button>
                </div>
            </header>

            {showInfo && (
                <div className="info-panel">
                    <div className="info-panel-block">
                        <strong><TrendingUp size={14} /> Est. 1RM (Epley)</strong>
                        Tracks the heaviest weight you lifted in a single set during the workout. Aim to increase this over time for strength gains.
                    </div>
                    <div className="info-panel-block">
                        <strong><BarChart3 size={14} /> Volume</strong>
                        Tracks the total load (Sets × Reps × Weight) moved in the session. Increasing volume is key for building muscle endurance and size.
                    </div>
                </div>
            )}

            <div className="analytics-controls">
                <div className="control-group">
                    <label>Exercise</label>
                    <CustomSelect
                        options={exercises.map(ex => ({ value: ex.id, label: ex.name }))}
                        value={selectedExerciseId}
                        onChange={(val) => setSelectedExerciseId(val)}
                        placeholder="Choose Exercise"
                    />
                </div>
            </div>

            {chartData.length === 0 ? (
                <div className="empty-chart-state">
                    <BarChart3 size={44} />
                    <p>Complete a workout with {selectedExercise?.name || 'this exercise'} to see your progress here.</p>
                    <button className="empty-state-action" onClick={() => navigate('/track')}>
                        <Dumbbell size={16} />
                        Start a workout
                    </button>
                </div>
            ) : (
                <>
                    {/* Overview: PR proximity ring + all-time records */}
                    <section className="overview-band">
                        <PrRing percent={prPercent} />
                        <div className="overview-stats">
                            <span className="overview-caption">Last session vs. best</span>
                            <div className="overview-stat-row">
                                <span className="overview-label">Best e1RM</span>
                                <span className="overview-value">
                                    {records.maxStrength} <span className="overview-unit">{weightUnit}</span>
                                </span>
                            </div>
                            <div className="overview-stat-row">
                                <span className="overview-label">Best volume</span>
                                <span className="overview-value">
                                    {(records.maxVolume / 1000).toFixed(1)}k <span className="overview-unit">{weightUnit}</span>
                                </span>
                            </div>
                            <div className="overview-stat-row">
                                <span className="overview-label">Sessions logged</span>
                                <span className="overview-value">{chartData.length}</span>
                            </div>
                        </div>
                    </section>

                    {/* Metric switch */}
                    <div className="metric-segment" role="tablist" aria-label="Chart metric">
                        <button
                            role="tab"
                            aria-selected={metric === 'strength'}
                            className={metric === 'strength' ? 'active' : ''}
                            onClick={() => setMetric('strength')}
                        >
                            <TrendingUp size={15} /> Strength
                        </button>
                        <button
                            role="tab"
                            aria-selected={metric === 'volume'}
                            className={metric === 'volume' ? 'active' : ''}
                            onClick={() => setMetric('volume')}
                        >
                            <BarChart3 size={15} /> Volume
                        </button>
                    </div>

                    {/* Chart */}
                    <div className="chart-container-card">
                        <div className="chart-header">
                            <h3>{metric === 'strength' ? 'Estimated 1RM' : 'Volume Load'}</h3>
                            <div className="range-chips" role="tablist" aria-label="Time range">
                                {RANGES.map(r => (
                                    <button
                                        key={r.key}
                                        role="tab"
                                        aria-selected={timeRange === r.key}
                                        className={`range-chip ${timeRange === r.key ? 'active' : ''}`}
                                        onClick={() => setTimeRange(r.key)}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="chart-wrapper">
                            {rangedData.length === 0 ? (
                                <div className="chart-range-empty">
                                    <p>No sessions in this range.</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={rangedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis
                                            dataKey="date"
                                            stroke="var(--text-secondary)"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={10}
                                        />
                                        <YAxis
                                            stroke="var(--text-secondary)"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => metric === 'volume' ? `${(val / 1000).toFixed(1)}k` : val}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'var(--bg-card)',
                                                borderColor: 'var(--border)',
                                                borderRadius: '8px',
                                                color: 'var(--text-primary)'
                                            }}
                                            itemStyle={{ color: 'var(--primary)' }}
                                            formatter={(value) => [`${value} ${weightUnit}`, metric === 'strength' ? 'Est. 1RM' : 'Volume']}
                                            labelStyle={{ color: 'var(--text-secondary)', marginBottom: '5px' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey={metric === 'strength' ? 'weight' : 'volume'}
                                            stroke="var(--primary)"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorMetric)"
                                            activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--text-primary)' }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Recent sessions for the selected exercise */}
                    {recentSessions.length > 0 && (
                        <section className="recent-sessions">
                            <h3>Recent Sessions</h3>
                            <ul>
                                {recentSessions.map(s => (
                                    <li key={s.originalDate.getTime()} className="session-row">
                                        <div className="session-row-left">
                                            <span className="session-date">{s.fullDate}</span>
                                            <span className="session-best-set">
                                                Best set {s.bestSetWeight} {weightUnit} × {s.reps}
                                            </span>
                                        </div>
                                        <span className="session-value">
                                            {metric === 'strength' ? s.weight : s.volume}
                                            <span className="session-unit"> {weightUnit}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </div>
    );
};

export default Analytics;
