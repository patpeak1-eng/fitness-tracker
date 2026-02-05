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
    Area,
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis
} from 'recharts';
import { ChevronLeft, TrendingUp, BarChart3, Calendar, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import BackButton from '../components/common/BackButton';
import './AnalyticsView.css';

const AnalyticsView = () => {
    const { workoutHistory, exercises, units, getMuscleVolumeDistribution } = useWorkout();
    const navigate = useNavigate();

    // State
    const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0]?.id || '');
    const [timeRange, setTimeRange] = useState('all'); // 'all', 'month', 'year'
    const [metric, setMetric] = useState('strength'); // 'strength', 'volume'

    // --- PHASE B: MUSCLE BALANCE RADAR ---
    const { radarData, insight } = useMemo(() => {
        return getMuscleVolumeDistribution ? getMuscleVolumeDistribution() : { data: [], insight: '' };
    }, [workoutHistory, getMuscleVolumeDistribution]);

    // Get current exercise details
    const selectedExercise = exercises.find(ex => ex.id === selectedExerciseId);

    // Process Data based on selection
    const chartData = useMemo(() => {
        if (!workoutHistory || workoutHistory.length === 0 || !selectedExerciseId) return [];
        // ... (existing chartData logic skipped for brevity, but I must keep it)
        const dataPoints = [];
        // Loop through all past workouts
        workoutHistory.forEach(workout => {
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

                    // Strength: simple max weight for now (could do 1RM calc later)
                    if (weight > maxWeight) {
                        maxWeight = weight;
                        bestSet = set;
                    }

                    // Volume: weight * reps
                    totalVolume += (weight * reps);
                });

                if (maxWeight > 0) {
                    dataPoints.push({
                        date: new Date(workout.endTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                        fullDate: new Date(workout.endTime).toLocaleDateString(),
                        weight: maxWeight,
                        volume: totalVolume,
                        reps: bestSet ? bestSet.reps : 0,
                        originalDate: new Date(workout.endTime) // For sorting
                    });
                }
            }
        });

        // Sort by date
        return dataPoints.sort((a, b) => a.originalDate - b.originalDate);

    }, [workoutHistory, selectedExerciseId]);

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <BackButton />
                    <h1>Progress</h1>
                </div>
            </header>

            <div className="analytics-content" style={{ paddingBottom: '20px' }}>

                {/* --- MUSCLE BALANCE RADAR (PHASE B) --- */}
                <div className="chart-container-card" style={{ marginBottom: '20px' }}>
                    <div className="chart-header">
                        <h3>Muscle Balance</h3>
                    </div>
                    <div className="chart-wrapper" style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                    name="Focus"
                                    dataKey="A"
                                    stroke="var(--primary)"
                                    strokeWidth={3}
                                    fill="var(--primary)"
                                    fillOpacity={0.3}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-card)',
                                        borderColor: 'var(--border-glass)',
                                        borderRadius: '8px',
                                        color: 'var(--text-primary)'
                                    }}
                                    formatter={(val) => [`${val}%`, 'Focus']}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* COACH INSIGHT */}
                    <div className="coach-insight-box" style={{
                        marginTop: '15px',
                        padding: '16px',
                        backgroundColor: 'rgba(191, 255, 0, 0.05)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '12px',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'start'
                    }}>
                        <Brain size={24} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--primary)' }}>Coach Insight</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {insight || "Start logging workouts to get personalized balance insights."}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="analytics-controls">
                    {/* Exercise Selector */}
                    <div className="control-group">
                        <label>Exercise History</label>
                        <select
                            value={selectedExerciseId}
                            onChange={(e) => setSelectedExerciseId(e.target.value)}
                            className="exercise-select"
                        >
                            {exercises.map(ex => (
                                <option key={ex.id} value={ex.id}>{ex.name}</option>
                            ))}
                        </select>
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
                                <h3>{metric === 'strength' ? 'Max Strength History' : 'Volume Load History'}</h3>
                                <div className="chart-filter">
                                    {/* Future: Time Range Toggles */}
                                </div>
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
        </div>
    );
};

export default AnalyticsView;
