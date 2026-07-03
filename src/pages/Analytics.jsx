import React, { useState, useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { ChevronLeft, TrendingUp, BarChart3, Calendar, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import BackButton from '../components/common/BackButton';
import CustomSelect from '../components/common/CustomSelect'; // Using new custom select
import { displayWeight } from '../utils/units';
import './AnalyticsView.css';

const Analytics = () => {
    const { history, exercises, units } = useWorkout();
    const navigate = useNavigate();

    // State
    const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0]?.id || '');
    const [timeRange, setTimeRange] = useState('all'); // 'all', 'month', 'year'
    const [metric, setMetric] = useState('strength'); // 'strength', 'volume'
    const [showInfo, setShowInfo] = useState(false); // Info modal state

    // Get current exercise details
    const selectedExercise = exercises.find(ex => ex.id === selectedExerciseId);

    // Process Data based on selection
    const chartData = useMemo(() => {
        if (!history || history.length === 0 || !selectedExerciseId) return [];

        const dataPoints = [];

        // Loop through all past workouts
        history.forEach(workout => {
            // Find if this workout included the selected exercise
            const exerciseData = workout.exercises.find(ex => ex.exercise.id === selectedExerciseId);

            if (exerciseData) {
                // Calculate metrics for this session
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

                    // Volume: weight * reps
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
                        // maxWeight now holds e1RM
                        volume: displayWeight(totalVolume, workoutUnit, units),
                        reps: bestSet ? bestSet.reps : 0,
                        originalDate: new Date(workout.endTime) // For sorting
                    });
                }
            }
        });

        // Sort by date
        return dataPoints.sort((a, b) => a.originalDate - b.originalDate);

    }, [history, selectedExerciseId, units]);

    // Calculate Personal Records
    const records = useMemo(() => {
        if (chartData.length === 0) return { maxStrength: 0, maxVolume: 0 };
        return {
            maxStrength: Math.max(...chartData.map(d => d.weight)),
            maxVolume: Math.max(...chartData.map(d => d.volume))
        };
    }, [chartData]);


    const weightUnit = units === 'metric' ? 'kg' : 'lbs';

    return (
        <div className="page analytics-page">
            <header className="page-header sticky-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <BackButton />
                        <h1>Progress</h1>
                    </div>
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        title="How this works"
                    >
                        {showInfo ? <X size={24} /> : <Info size={24} />}
                    </button>
                </div>
            </header>

            {/* INFO PANEL */}
            {showInfo && (
                <div className="info-panel" style={{
                    margin: '0 20px 20px',
                    padding: '15px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: '1.5'
                }}>
                    <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><TrendingUp size={14} /> Est. 1RM (Epley)</strong>
                        Tracks the heaviest weight you lifted in a single set during the workout. Aim to increase this over time for strength gains.
                    </div>
                    <div>
                        <strong style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><BarChart3 size={14} /> Max Volume</strong>
                        Tracks the total load (Sets × Reps × Weight) moved in the session. Increasing volume is key for building muscle endurance and size.
                    </div>
                </div>
            )}

            <div className="analytics-controls">
                {/* Exercise Selector */}
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
                    <BarChart3 size={48} />
                    <h3>No Data Available</h3>
                    <p>Complete a workout with {selectedExercise?.name} to see your progress.</p>
                </div>
            ) : (
                <>
                    {/* Stats Summary Cards */}
                    <div className="stats-grid">
                        <div className={`stat-card ${metric === 'strength' ? 'active' : ''}`} onClick={() => setMetric('strength')}>
                            <div className="stat-icon"><TrendingUp size={20} /></div>
                            <div className="stat-info">
                                <span className="label">Best Lift</span>
                                <span className="value">{records.maxStrength} <span className="unit">{weightUnit}</span></span>
                            </div>
                        </div>
                        <div className={`stat-card ${metric === 'volume' ? 'active' : ''}`} onClick={() => setMetric('volume')}>
                            <div className="stat-icon"><BarChart3 size={20} /></div>
                            <div className="stat-info">
                                <span className="label">Max Volume</span>
                                <span className="value">{(records.maxVolume / 1000).toFixed(1)}k <span className="unit">{weightUnit}</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Main Chart */}
                    <div className="chart-container-card">
                        <div className="chart-header">
                            <h3>{metric === 'strength' ? 'Estimated 1RM History' : 'Volume Load History'}</h3>
                        </div>

                        <div className="chart-wrapper">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
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
                                            borderColor: 'var(--border-glass)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)'
                                        }}
                                        itemStyle={{ color: 'var(--primary)' }}
                                        formatter={(value) => [`${value} ${weightUnit}`, metric === 'strength' ? 'Max Weight' : 'Volume']}
                                        labelStyle={{ color: 'var(--text-secondary)', marginBottom: '5px' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey={metric === 'strength' ? 'weight' : 'volume'}
                                        stroke="var(--primary)"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorMetric)"
                                        activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Analytics;
