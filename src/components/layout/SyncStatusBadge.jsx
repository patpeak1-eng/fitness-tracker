import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import SyncQueue from '../../services/SyncQueue';
import './SyncStatusBadge.css';

// Small floating badge above the bottom nav. Hidden while everything is
// synced; shows the pending-push count when the retry queue is non-empty,
// and a "log in again" prompt when replay hit an expired session (401).
const SyncStatusBadge = () => {
    const [state, setState] = useState({ pendingCount: 0, authExpired: false });
    const navigate = useNavigate();

    useEffect(() => SyncQueue.subscribe(setState), []);

    if (state.pendingCount === 0 && !state.authExpired) return null;

    if (state.authExpired) {
        return (
            <button
                className="sync-badge sync-badge-expired"
                onClick={() => navigate('/login')}
            >
                <CloudOff size={14} />
                <span>Session expired — log in again to keep syncing</span>
            </button>
        );
    }

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
