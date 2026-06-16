import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StorageService from '../services/StorageService';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // OAuth token is now delivered via cookies (the static server's
    // `serve --single` flag strips URL query params), so read them from there.
    const getCookie = (name) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2)
        return parts.pop().split(';').shift();
      return null;
    };

    const token = getCookie('oauth_token');
    const name = getCookie('oauth_name');
    const email = getCookie('oauth_email');
    const userId = getCookie('oauth_user_id');
    const hashError = getCookie('oauth_error');

    const clearOAuthCookies = () => {
      ['oauth_token', 'oauth_name', 'oauth_email', 'oauth_user_id', 'oauth_error'].forEach(key => {
        document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; samesite=lax; secure`;
      });
    };

    clearOAuthCookies();

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
