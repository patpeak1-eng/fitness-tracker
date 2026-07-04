import React, { lazy, Suspense, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { WorkoutProvider, useWorkout } from './context/WorkoutContext';
import { TimerProvider } from './context/TimerContext';

// Route pages are lazy-loaded so each compiles to its own chunk, keeping the
// initial JS payload small. Chart-heavy pages (Analytics, Profile) pull in
// recharts on demand — see the manualChunks hint in vite.config.js.
const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TrackWorkout = lazy(() => import('./pages/TrackWorkout'));
const History = lazy(() => import('./pages/History'));
const Timer = lazy(() => import('./pages/Timer'));
const Exercises = lazy(() => import('./pages/Exercises'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const WorkoutSummary = lazy(() => import('./pages/WorkoutSummary'));
const Assessment = lazy(() => import('./pages/Assessment'));
const HelpView = lazy(() => import('./pages/HelpView'));
const CoachView = lazy(() => import('./pages/CoachView'));

// Inner component to check profile status
const AppRoutes = ({ timerApiRef }) => {
    const { currentProfile, soundEnabled, authChecked, canSyncToBackend, activeWorkout } = useWorkout();

    if (!authChecked) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', height: '100vh',
                background: '#0d0d0f', color: '#ff5c2a'
            }}>
                Loading...
            </div>
        );
    }

    // Always render these routes regardless of auth state, so the Google OAuth
    // callback (/auth/callback) and /login work even when no profile exists yet.
    return (
        <TimerProvider currentProfile={currentProfile} soundEnabled={soundEnabled} apiRef={timerApiRef} canSyncToBackend={canSyncToBackend} workoutPaused={activeWorkout?.status === 'paused'}>
        <Suspense fallback={<div className="loading-screen" />}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/" element={currentProfile ? <Layout /> : <Navigate to="/login" />}>
                    <Route index element={<Dashboard />} />
                    <Route path="track" element={<TrackWorkout />} />
                    <Route path="history" element={<History />} />
                    <Route path="timer" element={<Timer />} />
                    <Route path="exercises" element={<Exercises />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="coach" element={<CoachView />} />
                    <Route path="summary" element={<WorkoutSummary />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="assessment" element={<Assessment />} />
                    <Route path="help" element={<HelpView />} />
                </Route>
            </Routes>
        </Suspense>
        </TimerProvider>
    );
};

function App() {
    // Shared bridge so WorkoutContext can reach TimerContext's imperative actions
    // (Option A — WorkoutProvider can't useTimer() because TimerProvider is nested
    // inside it). TimerProvider fills the ref; WorkoutProvider's handlers read it.
    const timerApiRef = useRef(null);
    return (
        <BrowserRouter>
            <ErrorBoundary>
                <WorkoutProvider timerApiRef={timerApiRef}>
                    <AppRoutes timerApiRef={timerApiRef} />
                </WorkoutProvider>
            </ErrorBoundary>
        </BrowserRouter>
    );
}

export default App;
