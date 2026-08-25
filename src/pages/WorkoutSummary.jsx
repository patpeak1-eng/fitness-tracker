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
    const { history, applyRecommendation, templates, units } = useWorkout();
    // Per-recommendation apply outcome ('saved' only on REAL success —
    // decision 9) and the in-app confirmation banner (decision 8: no alert()).
    const [applyState, setApplyState] = useState({});
    const [applyNotice, setApplyNotice] = useState(null);

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
    const formatDuration = (ms) => {
        if (!Number.isFinite(ms) || ms < 0) return '0:00';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return h > 0
            ? `${h}h ${m}m`
            : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    const durationStr = formatDuration(durationMs);

    const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.filter(s => s.completed).length, 0);
    // Warm-up sets are excluded from volume (S13 set-type rule).
    const totalVolume = exercises.reduce((acc, ex) => {
        return acc + ex.sets.reduce((sAcc, s) =>
            sAcc + (s.completed && s.setType !== 'warmup' ? (s.weight * s.reps) : 0), 0);
    }, 0);

    // Extract PRs
    const prs = exercises.flatMap(ex =>
        ex.sets.filter(s => s.isPR).map(s => ({
            exerciseName: ex.exercise.name,
            weight: s.weight,
            reps: s.reps
        }))
    );

    const wUnit = units === 'metric' ? 'kg' : 'lbs';

    const handleApply = async (rec, idx) => {
        const result = await applyRecommendation(rec);
        if (result.ok) {
            setApplyState(prev => ({ ...prev, [idx]: 'saved' }));
            setApplyNotice({
                kind: 'success',
                text: `Updated ${rec.exerciseName} to ${rec.newWeight} ${wUnit} for next time`,
            });
        } else {
            setApplyState(prev => ({ ...prev, [idx]: 'failed' }));
            setApplyNotice({
                kind: 'error',
                text: result.error || 'Could not update the template.',
            });
        }
    };

    // Only offer Apply when the rec carries its source template (older recs
    // predate that field, and template-less workouts have nothing to write).
    // Existence/custom-ness is judged at tap time by applyRecommendation so a
    // deleted template produces an honest failure message, not a hidden button.
    // Hold recs are display-only (S27 decision 5): same weight, nothing to
    // write. Recs without a type predate piece C and behave as increases.
    const canApply = (rec) => Boolean(rec.templateId) && rec.type !== 'hold';

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
                        <span className="sc-value">{durationStr}</span>
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
                    <Card className="recs-card" style={{ borderColor: 'var(--pr-gold)', background: 'rgba(233, 184, 76, 0.08)' }}>
                        <div className="card-header-row">
                            <Trophy className="icon-highlight" color="var(--pr-gold)" />
                            <h3 style={{ color: 'var(--pr-gold)' }}>New Personal Records!</h3>
                        </div>
                        <div className="recs-list">
                            {prs.map((pr, idx) => (
                                <div key={idx} className="rec-item">
                                    <div className="rec-info">
                                        <h4>{pr.exerciseName}</h4>
                                        <div className="rec-change">
                                            <span className="new-val" style={{ color: 'var(--pr-gold)' }}>
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
                            Based on this session, for next time:
                        </p>

                        <div className="recs-list">
                            {recommendations.map((rec, idx) => (
                                <div key={idx} className="rec-item">
                                    <div className="rec-info">
                                        <h4>
                                            {rec.exerciseName}
                                            {rec.type === 'hold' && <span className="rec-tag hold">Hold</span>}
                                            {rec.type === 'deload' && <span className="rec-tag deload">Deload</span>}
                                        </h4>
                                        {rec.type === 'hold' ? (
                                            <div className="rec-change">
                                                <span className="new-val">{rec.oldWeight} {wUnit}</span>
                                            </div>
                                        ) : (
                                            <div className="rec-change">
                                                <span>{rec.oldWeight}</span>
                                                <ArrowRight size={14} />
                                                <span className="new-val">{rec.newWeight} {wUnit}</span>
                                            </div>
                                        )}
                                        {(rec.type === 'hold' || rec.type === 'deload') && rec.message && (
                                            <p className="rec-message">{rec.message}</p>
                                        )}
                                    </div>
                                    {canApply(rec) && (
                                        <button
                                            className={`apply-btn ${applyState[idx] === 'saved' ? 'applied' : ''}`}
                                            disabled={applyState[idx] === 'saved'}
                                            onClick={() => handleApply(rec, idx)}
                                        >
                                            {applyState[idx] === 'saved' ? 'Saved' : 'Apply'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {applyNotice && (
                            <div
                                className={`apply-notice ${applyNotice.kind}`}
                                role="status"
                            >
                                {applyNotice.text}
                            </div>
                        )}
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
