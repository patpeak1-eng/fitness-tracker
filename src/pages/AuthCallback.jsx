import React, { useEffect } from 'react';

const AuthCallback = () => {
  useEffect(() => {
    // Backend already set the HttpOnly cookie
    // and redirected here. Just go to dashboard.
    // WorkoutContext will call /api/me to verify auth.
    window.location.href = '/';
  }, []);

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
