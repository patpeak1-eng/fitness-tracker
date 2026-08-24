import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import SyncQueue from '../../services/SyncQueue';
import { useWorkout } from '../../context/WorkoutContext';
import './SyncStatusBadge.css';

// Small floating badge above the bottom nav. Hidden while everything is
// synced; shows the pending-push count when the retry queue is non-empty,
// and a "log in" prompt when replay hit an expired session (401).
const SyncStatusBadge = () => {
    const [state, setState] = useState({ pendingCount: 0, authExpired: false });
    const { activeWorkout } = useWorkout();
    const navigate = useNavigate();

    useEffect(() => SyncQueue.subscribe(setState), []);

    if (state.pendingCount === 0 && !state.authExpired) return null;

    // The expiry prompt never interrupts a workout in progress — same rule
    // and reasoning as the PWA update banner (ARCHITECTURE.md §12): paused
    // counts too, because a paused workout is resumable from the Dashboard
    // where this badge is visible. Nothing is at risk; pushes are queued
    // locally and replayed after re-login.
    const workoutInProgress = activeWorkout
        && (activeWorkout.status === 'active' || activeWorkout.status === 'paused');

    if (state.authExpired && !workoutInProgress) {
        return (
            <button
                className="sync-badge sync-badge-expired"
                onClick={() => navigate('/login')}
            >
                <CloudOff size={14} />
                <span>Signed out. Workouts saved — log in to sync.</span>
            </button>
        );
    }

    if (state.pendingCount === 0) return null;

    return (
        <button
            className="sync-badge"
            onClick={() => SyncQueue.flush()}
            title="Some changes haven't reached the cloud yet. Tap to retry."
        >
            <CloudOff size={14} />
            <span>{state.pendingCount} not synced</span>
        </button>
    );
};

export default SyncStatusBadge;
