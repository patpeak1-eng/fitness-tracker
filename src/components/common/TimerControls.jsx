import React from 'react';
import { Minus, Plus } from 'lucide-react';
import './TimerControls.css';

const TimerControls = ({ label, time, onAdd, onSubtract, isRunning, onToggle, showToggle = false }) => {
    return (
        <div className="timer-controls">
            <span className="timer-label">{label}</span>
            <div className="timer-adjuster">
                <button className="adjust-btn" onClick={onSubtract} aria-label="Subtract time">
                    <Minus size={16} />
                </button>
                <div className="timer-display" onClick={onToggle}>
                    <span className="time-value">:{time.toString().padStart(2, '0')}</span>
                    {showToggle && (
                        <span className="timer-status">
                            {isRunning ? 'PAUSE' : 'START'}
                        </span>
                    )}
                </div>
                <button className="adjust-btn" onClick={onAdd} aria-label="Add time">
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
};

export default TimerControls;
