import React, { useState } from 'react';
import * as ApiService from '../services/ApiService';
import StorageService from '../services/StorageService';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = () => {
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState(''); // general/form-level error
    const [loading, setLoading] = useState(false);

    const isRegister = mode === 'register';

    const switchMode = (next) => {
        setMode(next);
        setError('');
        setFieldErrors({});
    };

    // Persist the active profile (+ token) then hard-navigate to '/'.
    // The WorkoutProvider re-reads profiles/currentProfileId on mount
    // (refreshGlobalState), so the full page load picks up the session.
    const activateProfileAndGo = (profileObj, token) => {
        StorageService.saveProfiles([profileObj]);
        StorageService.saveCurrentProfileId(profileObj.id);
        if (token) StorageService.saveAuthToken(token);
        StorageService.clearLoggedOut();
        window.location.href = '/';
    };

    const validateRegister = () => {
        const errs = {};
        if (!name.trim()) errs.name = 'Name is required';
        if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email';
        if (password.length < 8) errs.password = 'Password must be at least 8 characters';
        if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateLogin = () => {
        const errs = {};
        if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email';
        if (!password) errs.password = 'Password is required';
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        if (!validateRegister()) return;
        setLoading(true);
        try {
            const result = await ApiService.register(email.trim(), password, name.trim());
            if (result && result.access_token) {
                const cleanName = name.trim();
                activateProfileAndGo({
                    id: result.user_id || 'cloud_' + Date.now(),
                    name: cleanName,
                    color: '#bfff00',
                    avatar: cleanName.charAt(0).toUpperCase()
                }, result.access_token);
            }
        } catch (err) {
            setError(err.message || 'Could not reach the server. Check your connection and try again.');
            setLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        if (!validateLogin()) return;
        setLoading(true);
        try {
            const result = await ApiService.login(email.trim(), password);
            if (result && result.access_token) {
                const cleanName = result.name || email.trim().split('@')[0];
                activateProfileAndGo({
                    id: result.user_id || 'cloud_' + Date.now(),
                    name: cleanName,
                    color: '#bfff00',
                    avatar: cleanName.charAt(0).toUpperCase()
                }, result.access_token);
            }
        } catch (err) {
            setError(err.message || 'Could not reach the server. Check your connection and try again.');
            setLoading(false);
        }
    };

    // Keep the existing localStorage-only flow alive for users who skip auth.
    const handleContinueWithout = () => {
        StorageService.saveProfiles([{
            id: 'user_default',
            name: 'Main User',
            color: '#bfff00',
            avatar: 'M'
        }]);
        StorageService.saveCurrentProfileId('user_default');
        StorageService.clearLoggedOut();
        window.location.href = '/';
    };

    // Redirect to the backend Google OAuth entrypoint; the backend runs the
    // provider handshake and redirects back to /auth/callback with a token.
    const handleGoogleLogin = () => {
        const apiUrl = import.meta.env.VITE_API_URL;
        window.location.href = `${apiUrl}/api/auth/google`;
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">Fit<span>Track</span></div>
                <p className="login-tagline">
                    {isRegister
                        ? 'Create an account to sync across devices'
                        : 'Sign in to sync your workouts'}
                </p>

                <div className="login-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={!isRegister}
                        className={`login-tab ${!isRegister ? 'active' : ''}`}
                        onClick={() => switchMode('login')}
                        disabled={loading}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={isRegister}
                        className={`login-tab ${isRegister ? 'active' : ''}`}
                        onClick={() => switchMode('register')}
                        disabled={loading}
                    >
                        Register
                    </button>
                </div>

                <button
                    className="google-btn"
                    onClick={handleGoogleLogin}
                    type="button"
                    disabled={loading}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                </button>

                <div className="divider">
                    <span>or</span>
                </div>

                <form className="login-form" onSubmit={isRegister ? handleRegister : handleLogin} noValidate>
                    {isRegister && (
                        <div className="login-field">
                            <label htmlFor="login-name">Name</label>
                            <input
                                id="login-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                autoComplete="name"
                                disabled={loading}
                            />
                            {fieldErrors.name && <span className="login-error">{fieldErrors.name}</span>}
                        </div>
                    )}

                    <div className="login-field">
                        <label htmlFor="login-email">Email</label>
                        <input
                            id="login-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            autoComplete="email"
                            disabled={loading}
                        />
                        {fieldErrors.email && <span className="login-error">{fieldErrors.email}</span>}
                    </div>

                    <div className="login-field">
                        <label htmlFor="login-password">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={isRegister ? 'At least 8 characters' : 'Your password'}
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            disabled={loading}
                        />
                        {fieldErrors.password && <span className="login-error">{fieldErrors.password}</span>}
                    </div>

                    {isRegister && (
                        <div className="login-field">
                            <label htmlFor="login-confirm">Confirm Password</label>
                            <input
                                id="login-confirm"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter password"
                                autoComplete="new-password"
                                disabled={loading}
                            />
                            {fieldErrors.confirmPassword && <span className="login-error">{fieldErrors.confirmPassword}</span>}
                        </div>
                    )}

                    {error && <div className="login-form-error" role="alert">{error}</div>}

                    <button type="submit" className="login-submit" disabled={loading}>
                        {loading
                            ? <span className="login-spinner" aria-label="Loading" />
                            : (isRegister ? 'Create Account' : 'Sign In')}
                    </button>
                </form>

                <button
                    type="button"
                    className="login-ghost"
                    onClick={handleContinueWithout}
                    disabled={loading}
                >
                    Continue without account
                </button>

                <p className="login-switch">
                    {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <button
                        type="button"
                        className="login-link"
                        onClick={() => switchMode(isRegister ? 'login' : 'register')}
                        disabled={loading}
                    >
                        {isRegister ? 'Sign in' : 'Create one'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default Login;
