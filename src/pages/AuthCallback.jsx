import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StorageService from '../services/StorageService';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Strip params from URL after reading (security)
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', '/auth/callback');
    }

    const token = params.get('token');
    const name = params.get('name');
    const email = params.get('email');
    const userId = params.get('user_id');
    const hashError = params.get('error');

    if (hashError) {
      setError('Google sign-in failed. Please try again.');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    if (token && name) {
      // Store auth token
      StorageService.saveAuthToken(token);
      StorageService.clearLoggedOut();

      // Create profile object
      const profileObj = {
        id: userId || 'google_' + Date.now(),
        name: decodeURIComponent(name),
        color: '#bfff00',
        avatar: decodeURIComponent(name).charAt(0).toUpperCase()
      };

      // Save profile to localStorage
      StorageService.saveProfiles([profileObj]);
      StorageService.saveCurrentProfileId(profileObj.id);

      // Navigate to dashboard (full load so WorkoutProvider re-reads session)
      window.location.href = '/';
    } else {
      setError('Something went wrong. Please try again.');
      setTimeout(() => navigate('/login'), 3000);
    }
  }, []);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-primary)',
        gap: '16px'
      }}>
        <p style={{ color: '#ef4444' }}>{error}</p>
        <p style={{ color: 'var(--text-secondary)' }}>
          Redirecting to login...
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      color: 'var(--text-primary)'
    }}>
      <p>Signing you in...</p>
    </div>
  );
};

export default AuthCallback;
