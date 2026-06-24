import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { WorkoutProvider, useWorkout } from './context/WorkoutContext';

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
const AppRoutes = () => {
    const { currentProfile, authChecked } = useWorkout();

    if (!authChecked) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', height: '100vh',
                background: '#000', color: '#bfff00'
            }}>
                Loading...
            </div>
        );
    }

    // Always render these routes regardless of auth state, so the Google OAuth
    // callback (/auth/callback) and /login work even when no profile exists yet.
    return (
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
