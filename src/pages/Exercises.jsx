import React from 'react';
import BackButton from '../components/common/BackButton';

const Exercises = () => {
    return (
        <div className="page exercises">
            <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <BackButton />
                <h1>Exercise Library</h1>
            </header>
            <p>Browse exercises by muscle group.</p>
        </div>
    );
};

export default Exercises;
