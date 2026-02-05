import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import { CheckCircle, Trophy, Calendar, TrendingUp, ArrowRight, Home } from 'lucide-react';
import Card from '../components/common/Card';
import confetti from 'canvas-confetti';
import './WorkoutSummary.css';

const WorkoutSummary = () => {
    const navigate = useNavigate();
    const location = useLocation(); // NEW
    const { history, activeWorkout, applyProgression, units } = useWorkout();

    // Prefer passed state, fallback to history[0]
    const summaryWorkout = location.state?.workout || history[0];

    useEffect(() => {
        if (summaryWorkout) {
            // FIRE CONFETTI
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }, [summaryWorkout]);

    if (!summaryWorkout) {
        return (
            <div className="page summary-page">
                <h2>No workout found.</h2>
                <button className="primary-btn" onClick={() => navigate('/')}>Go Home</button>
            </div>
        );
    }

    const { name, endTime, startTime, exercises, recommendations } = summaryWorkout;
    const durationMs = new Date(endTime) - new Date(startTime);
    const durationMin = Math.floor(durationMs / 60000);

    const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.filter(s => s.completed).length, 0);
    const totalVolume = exercises.reduce((acc, ex) => {
        return acc + ex.sets.reduce((sAcc, s) => sAcc + (s.completed ? (s.weight * s.reps) : 0), 0);
    }, 0);

    // Extract PRs
    const prs = exercises.flatMap(ex =>
        ex.sets.filter(s => s.isPR).map(s => ({
            exerciseName: ex.exercise.name,
            weight: s.weight,
            reps: s.reps
        }))
    );

    const handleApply = (rec) => {
        // Apply update to template
        // We need the original template ID. summaryWorkout.sourceTemplateId should exist.
        if (summaryWorkout.sourceTemplateId) {
            applyProgression(rec.exerciseId, rec.setId, { weight: rec.newWeight });
            // Show success logic locally?
            alert(`Updated ${rec.exerciseName} to ${rec.newWeight}${units === 'metric' ? 'kg' : 'lbs'} for next time!`);
        }
    };

    return (
        <div className="page summary-page">
            <header className="summary-header">
                <CheckCircle size={64} className="success-icon" />
                <h1>Workout Complete!</h1>
                <p className="summary-subtitle">{name}</p>
            </header>

            <div className="summary-grid">
                {/* HERO STATS */}
                <div className="stats-row">
                    <div className="stat-box">
                        <span className="sc-label">Duration</span>
                        <span className="sc-value">{durationMin}m</span>
                    </div>
                    <div className="stat-box">
                        <span className="sc-label">Sets</span>
                        <span className="sc-value">{totalSets}</span>
                    </div>
                    <div className="stat-box">
                        <span className="sc-label">Volume</span>
                        <span className="sc-value">{Math.round(totalVolume).toLocaleString()} {units === 'metric' ? 'kg' : 'lbs'}</span>
                    </div>
                </div>

                {/* PR SECTION */}
                {prs.length > 0 && (
                    <Card className="recs-card" style={{ borderColor: 'gold', background: 'rgba(255, 215, 0, 0.05)' }}>
                        <div className="card-header-row">
                            <Trophy className="icon-highlight" color="gold" />
                            <h3 style={{ color: 'gold' }}>New Personal Records!</h3>
                        </div>
                        <div className="recs-list">
                            {prs.map((pr, idx) => (
                                <div key={idx} className="rec-item">
                                    <div className="rec-info">
                                        <h4>{pr.exerciseName}</h4>
                                        <div className="rec-change">
                                            <span className="new-val" style={{ color: 'gold' }}>
                                                {pr.weight} {units === 'metric' ? 'kg' : 'lbs'} x {pr.reps} reps
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* RECOMMENDATIONS SECTION */}
                {recommendations && recommendations.length > 0 && (
                    <Card className="recs-card">
                        <div className="card-header-row">
                            <TrendingUp className="icon-highlight" />
                            <h3>Smart Recommendations</h3>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
                            You crushed your goals on these exercises! Apply updates for next time:
                        </p>

                        <div className="recs-list">
                            {recommendations.map((rec, idx) => (
                                <div key={idx} className="rec-item">
                                    <div className="rec-info">
                                        <h4>{rec.exerciseName}</h4>
                                        <div className="rec-change">
                                            <span>{rec.oldWeight}</span>
                                            <ArrowRight size={14} />
                                            <span className="new-val">{rec.newWeight} {units === 'metric' ? 'kg' : 'lbs'}</span>
                                        </div>
                                    </div>
                                    <button className="apply-btn" onClick={(e) => {
                                        e.target.innerText = 'Saved';
                                        e.target.disabled = true;
                                        e.target.style.background = 'var(--success)';
                                        handleApply(rec);
                                    }}>
                                        Apply
                                    </button>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* ACTIONS */}
                <button className="primary-btn-large home-btn" onClick={() => navigate('/')}>
                    <Home size={20} /> Back to Dashboard
                </button>
            </div>
        </div>
    );
};

export default WorkoutSummary;
