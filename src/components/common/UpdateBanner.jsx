import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useWorkout } from '../../context/WorkoutContext';
import './UpdateBanner.css';

// Check for a new deploy every 15 minutes while the app stays open, so the
// banner can appear without a cold start.
const UPDATE_CHECK_MS = 15 * 60 * 1000;

const UpdateBanner = () => {
    const { activeWorkout } = useWorkout();
    // Session-only dismissal — deliberately NOT persisted, so a stale build
    // prompts again on the next load.
    const [dismissed, setDismissed] = useState(false);
    const checkIntervalRef = useRef(null);

    const {
        needRefresh: [needRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(registration) {
            if (!registration) return;
            // StrictMode can fire this twice — never stack intervals.
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = setInterval(() => {
                registration.update().catch(() => { /* offline — retry next tick */ });
            }, UPDATE_CHECK_MS);
        },
    });

    useEffect(() => () => clearInterval(checkIntervalRef.current), []);

    // A mid-set reload prompt is unacceptable, and a version change
    // mid-workout risks the in-flight localStorage shape. Paused counts as
    // in-progress: a paused workout is resumable from the Dashboard, where
    // no pause overlay hides the banner.
    const workoutInProgress = activeWorkout
        && (activeWorkout.status === 'active' || activeWorkout.status === 'paused');

    if (!needRefresh || dismissed || workoutInProgress) return null;

    return (
        <div className="update-banner" role="status">
            <span className="update-banner-text">New version available</span>
            <button
                type="button"
                className="update-banner-reload"
                onClick={() => updateServiceWorker(true)}
            >
                <RefreshCw size={15} /> Reload
            </button>
            <button
                type="button"
                className="update-banner-dismiss"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss update notice"
            >
                <X size={17} />
            </button>
        </div>
    );
};

export default UpdateBanner;
