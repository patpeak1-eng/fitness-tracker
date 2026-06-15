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
            } else {
                setError((result && (result.detail || result.message)) || 'Registration failed. Please try again.');
                setLoading(false);
            }
        } catch (err) {
            setError('Could not reach the server. Check your connection and try again.');
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
            } else {
                setError('Invalid email or password');
                setLoading(false);
            }
        } catch (err) {
            setError('Could not reach the server. Check your connection and try again.');
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
        window.location.href = '/';
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
