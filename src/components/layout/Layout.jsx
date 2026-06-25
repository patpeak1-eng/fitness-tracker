import React from 'react';
import { Outlet } from 'react-router-dom';
import RestTimerOverlay from '../workout/RestTimerOverlay';
import BottomNavigation from './BottomNavigation';
import { useWorkout } from '../../context/WorkoutContext';
import { useTimer } from '../../context/TimerContext';
import './Layout.css';

const Layout = () => {
    const { activeWorkout } = useWorkout();
    const { restTimer, addTimeRest, skipRest } = useTimer();

    // Hide global overlay if we are in Guided Mode (active status)
    const isGuidedMode = activeWorkout?.status === 'active';

    return (
        <div className="layout-container">
            <main className="main-content">
                <Outlet />
            </main>

            {/* Phase H: Bottom Navigation (Global, except in active guided mode might want to hide it? Or keep it?) 
                Usually active workouts take over full screen. Let's hide it in guided mode. */}
            {!isGuidedMode && <BottomNavigation />}

            {!isGuidedMode && (
                <RestTimerOverlay
                    timeLeft={restTimer?.timeLeft}
                    onAdd={addTimeRest}
                    onSkip={skipRest}
                />
            )}
        </div>
    );
};

export default Layout;
