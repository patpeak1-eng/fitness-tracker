import React, { useEffect, useState } from 'react';
import StorageService from '../services/StorageService';

const AuthCallback = () => {
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    // Log everything for debugging
    console.log('[AuthCallback] mounted');
    console.log('[AuthCallback] href:', window.location.href);
    console.log('[AuthCallback] search:', window.location.search);
    console.log('[AuthCallback] hash:', window.location.hash);

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const name = params.get('name');
    const email = params.get('email');
    const userId = params.get('user_id');
    const error = params.get('error');

    console.log('[AuthCallback] token:', token ? 'PRESENT' : 'MISSING');
    console.log('[AuthCallback] name:', name);
    console.log('[AuthCallback] error:', error);

    if (error) {
      setStatus('Google sign-in cancelled. Redirecting...');
      setTimeout(() => { window.location.href = '/login'; }, 2000);
      return;
    }

    if (token && name) {
      setStatus('Signing you in...');

      StorageService.saveAuthToken(token);
      StorageService.clearLoggedOut();

      const profileObj = {
        id: userId || 'google_' + Date.now(),
        name: decodeURIComponent(name),
        color: '#bfff00',
        avatar: decodeURIComponent(name).charAt(0).toUpperCase()
      };

      StorageService.saveProfiles([profileObj]);
      StorageService.saveCurrentProfileId(profileObj.id);

      console.log('[AuthCallback] success — navigating to /');
      // Small delay so logs are visible before navigation
      setTimeout(() => { window.location.href = '/'; }, 500);
    } else {
      console.log('[AuthCallback] MISSING params — token:', token, 'name:', name);
      setStatus('Sign-in failed. Missing auth data. Redirecting...');
      setTimeout(() => { window.location.href = '/login'; }, 3000);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      color: 'var(--text-primary)',
      gap: '16px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ fontSize: '2rem' }}>⚡</div>
      <p>{status}</p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {window.location.search}
      </p>
    </div>
  );
};

export default AuthCallback;
