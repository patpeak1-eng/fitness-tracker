import React from 'react';
import { Outlet } from 'react-router-dom';
import RestTimerOverlay from '../workout/RestTimerOverlay';
import BottomNavigation from './BottomNavigation';
import { useWorkout } from '../../context/WorkoutContext';
import './Layout.css';

const Layout = () => {
    const { restTimer, addTimeRest, skipRest, activeWorkout } = useWorkout();

    // Hide global overlay if we are in Guided Mode (active status)
    const isGuidedMode = activeWorkout?.status === 'active';

    return (
        <div className="layout">
            <main className="content">
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
