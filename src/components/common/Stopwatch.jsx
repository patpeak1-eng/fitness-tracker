import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import './Stopwatch.css';

const Stopwatch = ({ initialTime = 0, mode = 'countup', targetTime = 60, onTimeUpdate }) => {
    // For countup: time starts at initialTime
    // For countdown: time starts at targetTime
    const [time, setTime] = useState(mode === 'countdown' ? targetTime : initialTime);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (mode === 'countdown' && time !== targetTime && !isRunning) {
            // Reset if targetTime changes and we aren't mid-run (simplistic reset)
            setTime(targetTime);
        }
    }, [targetTime, mode]);

    useEffect(() => {
        if (isRunning) {
            intervalRef.current = setInterval(() => {
                setTime(prev => {
                    const next = mode === 'countdown' ? prev - 1 : prev + 1;
                    if (mode === 'countdown' && next <= 0) {
                        clearInterval(intervalRef.current);
                        setIsRunning(false);
                        return 0;
                    }
                    return next;
                });
            }, 1000);
        } else {
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
    }, [isRunning, mode]);

    useEffect(() => {
        if (onTimeUpdate) {
            onTimeUpdate(time);
        }
    }, [time, onTimeUpdate]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const reset = () => {
        setIsRunning(false);
        setTime(mode === 'countdown' ? targetTime : 0);
    };

    return (
        <div className={`stopwatch ${mode === 'countdown' ? 'countdown-mode' : ''}`}>
            {mode === 'countdown' && <Timer size={14} className="countdown-icon" />}
            <span className="time-display">{formatTime(time)}</span>
            <div className="stopwatch-controls">
                <button
                    className={`control-btn ${isRunning ? 'active' : ''}`}
                    onClick={() => setIsRunning(!isRunning)}
                >
                    {isRunning ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button className="control-btn" onClick={reset}>
                    <RotateCcw size={16} />
                </button>
            </div>
        </div>
    );
};

export default Stopwatch;
