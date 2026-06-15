import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { WorkoutProvider, useWorkout } from './context/WorkoutContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TrackWorkout from './pages/TrackWorkout';
import History from './pages/History';
import Timer from './pages/Timer';
import Exercises from './pages/Exercises';
import Analytics from './pages/Analytics';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import WorkoutSummary from './pages/WorkoutSummary';
import Assessment from './pages/Assessment';
import HelpView from './pages/HelpView';

// Inner component to check profile status
const AppRoutes = () => {
    const { currentProfile } = useWorkout();

    if (!currentProfile) {
        return <Login />;
    }

    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="track" element={<TrackWorkout />} />
                <Route path="history" element={<History />} />
                <Route path="timer" element={<Timer />} />
                <Route path="exercises" element={<Exercises />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="summary" element={<WorkoutSummary />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="assessment" element={<Assessment />} />
                <Route path="help" element={<HelpView />} />
            </Route>
        </Routes>
    );
};

function App() {
    return (
        <BrowserRouter>
            <ErrorBoundary>
                <WorkoutProvider>
                    <AppRoutes />
                </WorkoutProvider>
            </ErrorBoundary>
        </BrowserRouter>
    );
}

export default App;
