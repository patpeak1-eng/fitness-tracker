import React from 'react';
import Card from '../components/common/Card';
import { Activity, Play, Calendar, Timer, TrendingUp, Settings, BarChart3, HelpCircle, Dumbbell, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import { format } from 'date-fns';
import './Dashboard.css';

const Dashboard = () => {
    const navigate = useNavigate();
    const { history, currentProfile, activeWorkout, cancelWorkout } = useWorkout();

    // Stats Calculation
    const thisWeekCount = history.filter(w => {
        const d = new Date(w.startTime);
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        return d >= startOfWeek;
    }).length;

    const calculateStreak = () => {
        if (!history || history.length === 0) return 0;
        const completedDates = new Set(
            history
                .filter(w => w.completed || w.status === 'completed')
                .map(w => new Date(w.startTime).toDateString())
        );
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            if (completedDates.has(d.toDateString())) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    };
    const currentStreak = calculateStreak();

    // Simple Goal: 4 workouts/week
    const weeklyGoal = 4;
    const progressPercent = Math.min(100, Math.round((thisWeekCount / weeklyGoal) * 100));

    // SVG Circle Math
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    return (
        <div className="page dashboard">
            <header className="dashboard-header">
                <div>
                    <h1>Hello, {currentProfile?.name || 'Athlete'}</h1>
                    <p className="subtitle">Time to level up.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className="profile-avatar-small"
                        onClick={() => navigate('/profile')}
                        style={{ backgroundColor: currentProfile?.color }}
                        title="View Profile"
                    >
                        {currentProfile?.avatar}
                    </button>
                    <button className="settings-btn-icon" onClick={() => navigate('/help')} title="Help Guide">
                        <HelpCircle size={24} />
                    </button>
                    <button className="settings-btn-icon" onClick={() => navigate('/settings')} title="Settings">
                        <Settings size={24} />
                    </button>
                </div>
            </header>

            <section className="dashboard-grid">

                {/* 1. DAILY GOAL RING (The Neon Circle) */}
                <Card className="goal-card">
                    <div className="goal-info">
                        <h3>Weekly Goal</h3>
                        <div className="goal-percentage">{progressPercent}%</div>
                        <p className="goal-subtext">{thisWeekCount} of {weeklyGoal} workouts</p>
                    </div>

                    <div className="goal-ring-container">
                        <svg width="140" height="140">
                            <circle
                                className="goal-ring-bg"
                                cx="70" cy="70" r={radius}
                            />
                            <circle
                                className="goal-ring-progress"
                                cx="70" cy="70" r={radius}
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                            />
                        </svg>
                        <div className="goal-icon-center">
                            <Activity size={28} />
                        </div>
                    </div>
                </Card>

                {/* 1b. STREAK CARD */}
                <Card style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <p style={{
                            margin: 0,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            color: 'var(--text-muted)'
                        }}>Current Streak</p>
                        {/* Data value: text/primary, never accent (token rule). */}
                        <p style={{
                            margin: 0,
                            fontSize: '1.8rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            fontFeatureSettings: '"tnum"'
                        }}>
                            {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
                        </p>
                    </div>
                    <Flame size={32} strokeWidth={1.75} style={{ color: currentStreak > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }} />
                </Card>

                {/* 2. ACTIVE WORKOUT BANNER (If Active) */}
                {activeWorkout && (
                    <Card className="hero-card action-btn" onClick={() => navigate('/track')}
                        style={{ cursor: 'pointer', textAlign: 'center', padding: '20px', background: 'var(--primary-dim)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                            {activeWorkout.status === 'paused' ? (
                                <div style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>● PAUSED</div>
                            ) : (
                                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>● LIVE SESSION</div>
                            )}
                        </div>
                        <h3 style={{ margin: '10px 0', fontSize: '1.4rem' }}>{activeWorkout.name}</h3>
                        <button className="primary-btn" style={{ width: '100%' }}>
                            {activeWorkout.status === 'paused' ? 'Resume Paused Workout' : 'Resume'}
                        </button>
                    </Card>
                )}

                {/* 3. QUICK ACTIONS (The Square Cards) */}
                <h3 style={{ margin: '10px 0 0', fontSize: '1.1rem', paddingLeft: '5px' }}>Start Training</h3>
                <div className="workouts-row">
                    <div className="workout-type-card" onClick={() => navigate('/track')}>
                        <div className="workout-icon-box">
                            <Dumbbell size={28} />
                        </div>
                        <span className="workout-type-label">Strength</span>
                    </div>

                    <div className="workout-type-card" onClick={() => navigate('/track')}>
                        <div className="workout-icon-box">
                            <Flame size={28} />
                        </div>
                        <span className="workout-type-label">HIIT</span>
                    </div>

                    <div className="workout-type-card" onClick={() => navigate('/analytics')}>
                        <div className="workout-icon-box">
                            <BarChart3 size={28} />
                        </div>
                        <span className="workout-type-label">Data</span>
                    </div>
                </div>

                {/* 4. RECENT ACTIVITY (Glass Card) */}
                <h3 style={{ margin: '20px 0 0', fontSize: '1.1rem', paddingLeft: '5px' }}>Recent Activity</h3>
                {history.length > 0 ? (
                    <Card onClick={() => navigate('/history')} style={{ cursor: 'pointer', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ fontSize: '1.1rem' }}>{history[0].name}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    {format(new Date(history[0].startTime), 'EEE, MMM d')}
                                </p>
                            </div>
                            <div style={{
                                background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                                color: 'var(--success)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '0.9rem'
                            }}>
                                Completed
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card style={{ padding: '24px', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            No workouts yet. Take the fitness assessment to get a personalised program.
                        </p>
                        <button
                            className="primary-btn"
                            onClick={() => navigate('/assessment')}
                            style={{ width: '100%' }}
                        >
                            Start Assessment
                        </button>
                    </Card>
                )}

            </section>
        </div>
    );
};

export default Dashboard;
