import React, { useEffect } from 'react';
import { X, Plus, Timer } from 'lucide-react';
import './RestTimerOverlay.css';

const RestTimerOverlay = ({ timeLeft, onAdd, onSkip }) => {
    if (timeLeft <= 0) return null;

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="rest-timer-overlay">
            <div className="rest-icon">
                <Timer size={20} />
            </div>
            <div className="rest-info">
                <span className="rest-label">Resting...</span>
                <span className="rest-time">{formatTime(timeLeft)}</span>
            </div>
            <div className="rest-controls">
                <button className="rest-btn" onClick={() => onAdd(30)}>
                    <Plus size={16} /> 30s
                </button>
                <button className="rest-close" onClick={onSkip}>
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};

export default RestTimerOverlay;
