import React from 'react';
import { Calendar, Hash, Award, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useWorkout } from '../../context/WorkoutContext';
import './WorkoutDetails.css';

import BackButton from '../common/BackButton';
import { displayWeight } from '../../utils/units';

const WorkoutDetails = ({ workout, onBack }) => {
    const { units } = useWorkout();

    if (!workout) return null;

    // Weights are stored in the unit the workout was logged in; convert to the
    // unit currently selected for display. Legacy workouts predate workout.units
    // and fall back to metric.
    const workoutUnit = workout.units || 'metric';
    const formatWeight = (weight) => displayWeight(weight, workoutUnit, units);

    const unitLabel = units === 'imperial' ? 'lbs' : 'kg';

    // Filter valid exercises preventing crashes from corrupted data
    const validExercises = workout.exercises ? workout.exercises.filter(ex => ex && ex.exercise) : [];

    // Warm-up sets are excluded from volume (S13 set-type rule); sets without
    // a setType (pre-S13 history) count as normal working sets.
    const totalVolume = validExercises.reduce((acc, ex) => {
        return acc + ex.sets.reduce((sAcc, set) =>
            sAcc + (set.setType === 'warmup' ? 0 : (set.weight * set.reps)), 0);
    }, 0);

    const displayVolume = Math.round(displayWeight(totalVolume, workoutUnit, units));

    const totalSets = validExercises.reduce((acc, ex) => acc + ex.sets.length, 0);

    return (
        <div className="workout-details-container">
            <header className="details-header-card">
                <BackButton onClick={onBack} label="Back" style={{ alignSelf: 'flex-start', marginBottom: '15px' }} />
                <div className="header-top">
                    <span className="workout-date">
                        <Calendar size={14} />
                        {format(new Date(workout.startTime), 'EEEE, MMMM do, yyyy')}
                    </span>
                    <span className="workout-time">
                        {format(new Date(workout.startTime), 'p')}
                    </span>
                </div>

                <h2 className="workout-title">{workout.name}</h2>
            </header>

            {workout.notes && (
                <div className="workout-notes-display">
                    <h3>Notes</h3>
                    <p>{workout.notes}</p>
                </div>
            )}

            {workout.recommendations && workout.recommendations.length > 0 && (
                <div className="recs-section">
                    <div className="recs-header">
                        <Award size={18} />
                        <h3>Smart Recommendations</h3>
                    </div>
                    {workout.recommendations.map((rec, i) => (
                        <div key={i} className="rec-item-history">
                            <span className="rec-exercise-name">{rec.exerciseName}</span>
                            <div className="rec-values">
                                <span>{rec.oldWeight}</span>
                                <span className="arrow">→</span>
                                <span className="new">{rec.newWeight} {unitLabel}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="exercises-timeline">
                {validExercises.map((ex, index) => (
                    <div key={ex.id} className="exercise-detail-card">
                        <div className="exercise-header">
                            <div className="exercise-number">{index + 1}</div>
                            <h3>{ex.exercise.name}</h3>
                        </div>

                        <div className="sets-table-container">
                            <table className="sets-table">
                                <thead>
                                    <tr>
                                        <th>SET</th>
                                        <th>WEIGHT ({unitLabel})</th>
                                        <th>GOAL</th>
                                        <th>ACTUAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ex.sets.map((set, i) => {
                                        // Warm-up rows render muted (still shown, just lighter).
                                        const mutedStyle = set.setType === 'warmup'
                                            ? { color: 'var(--text-muted)' }
                                            : undefined;
                                        return (
                                        <tr key={set.id}>
                                            <td className="col-set">
                                                <span className="set-pill">{i + 1}</span>
                                                {set.setType === 'warmup' && (
                                                    <span style={{
                                                        marginLeft: '6px',
                                                        color: 'var(--pr-gold)',
                                                        fontSize: '0.625rem',
                                                        fontWeight: 600
                                                    }}>W</span>
                                                )}
                                            </td>
                                            <td className="col-weight" style={mutedStyle}>
                                                {formatWeight(set.weight)}
                                            </td>
                                            <td className="col-goal" style={mutedStyle}>
                                                {set.targetReps || '-'}
                                            </td>
                                            <td className="col-reps" style={mutedStyle}>
                                                {set.reps}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            <div className="stats-grid footer-stats">
                <div className="stat-item">
                    <span className="stat-label">Volume</span>
                    <span className="stat-value">
                        {displayVolume.toLocaleString()} <span className="stat-unit">{unitLabel}</span>
                    </span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Sets</span>
                    <span className="stat-value">{totalSets}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Exercises</span>
                    <span className="stat-value">{validExercises.length}</span>
                </div>
            </div>
        </div>
    );
};

export default WorkoutDetails;
