import React from 'react';
import BackButton from '../components/common/BackButton';

const Timer = () => {
    return (
        <div className="page timer">
            <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <BackButton />
                <h1>Timer</h1>
            </header>
            <p>Stopwatch and countdown timers.</p>
        </div>
    );
};

export default Timer;
