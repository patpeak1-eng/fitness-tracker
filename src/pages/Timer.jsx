import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import BackButton from '../components/common/BackButton';
import './Timer.css';

// Web Audio completion chime — same approach as playBeep('success') in
// WorkoutContext.jsx. Intentionally copied (not imported) so this page is
// self-contained and does not depend on the workout context.
const playBeep = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const playNote = (freq, startTime, duration = 0.5, vol = 0.2) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);

            // ADSR-ish envelope
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = ctx.currentTime;
        // Major triad chime (C6 - E6 - G6)
        playNote(1046.50, now, 0.6, 0.2);
        playNote(1318.51, now + 0.05, 0.6, 0.2);
        playNote(1567.98, now + 0.1, 0.8, 0.2);
    } catch (e) {
        console.error('Audio play failed', e);
    }
};

const PRESETS = [
    { label: '0:30', m: 0, s: 30 },
    { label: '1:00', m: 1, s: 0 },
    { label: '3:00', m: 3, s: 0 },
    { label: '5:00', m: 5, s: 0 },
];

const clampInt = (value, min, max) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
};

const formatTime = (totalSeconds) => {
    const mm = Math.floor(totalSeconds / 60);
    const ss = totalSeconds % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const Timer = () => {
    const [minutes, setMinutes] = useState(1);
    const [seconds, setSeconds] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    const durationSeconds = minutes * 60 + seconds;

    // Tick once per second while running.
    useEffect(() => {
        if (!isRunning) return undefined;
        const id = setInterval(() => {
            setTimeLeft((prev) => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(id);
    }, [isRunning]);

    // Completion: stop and beep when the countdown reaches zero.
    useEffect(() => {
        if (isRunning && timeLeft === 0) {
            setIsRunning(false);
            setIsComplete(true);
            playBeep();
        }
    }, [isRunning, timeLeft]);

    const handleMinChange = (e) => {
        const v = clampInt(e.target.value, 0, 99);
        setMinutes(v);
        if (!isRunning) {
            setTimeLeft(v * 60 + seconds);
            setIsComplete(false);
        }
    };

    const handleSecChange = (e) => {
        const v = clampInt(e.target.value, 0, 59);
        setSeconds(v);
        if (!isRunning) {
            setTimeLeft(minutes * 60 + v);
            setIsComplete(false);
        }
    };

    const applyPreset = (m, s) => {
        if (isRunning) return;
        setMinutes(m);
        setSeconds(s);
        setTimeLeft(m * 60 + s);
        setIsComplete(false);
    };

    const handleStart = () => {
        const startFrom = timeLeft > 0 ? timeLeft : durationSeconds;
        if (startFrom <= 0) return;
        if (timeLeft <= 0) setTimeLeft(durationSeconds);
        setIsComplete(false);
        setIsRunning(true);
    };

    const handlePause = () => setIsRunning(false);

    const handleReset = () => {
        setIsRunning(false);
        setIsComplete(false);
        setTimeLeft(durationSeconds);
    };

    const isPaused = !isRunning && !isComplete && timeLeft > 0 && timeLeft < durationSeconds;
    let label = 'Ready';
    if (isComplete) label = 'Done';
    else if (isRunning) label = 'Focus';
    else if (isPaused) label = 'Paused';

    return (
        <div className="timer-page">
            <header className="tp-header">
                <BackButton />
                <h1>Timer</h1>
            </header>

            <div className={`tp-display ${isRunning ? 'running' : ''} ${isComplete ? 'complete' : ''}`}>
                <span className="tp-time">{formatTime(timeLeft)}</span>
                <span className="tp-label">{label}</span>
            </div>

            <div className="tp-presets">
                {PRESETS.map((p) => (
                    <button
                        key={p.label}
                        className="tp-preset"
                        onClick={() => applyPreset(p.m, p.s)}
                        disabled={isRunning}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <div className="tp-inputs">
                <div className="tp-input-group">
                    <label htmlFor="tp-min">Min</label>
                    <input
                        id="tp-min"
                        className="tp-input"
                        type="number"
                        min={0}
                        max={99}
                        value={minutes}
                        onChange={handleMinChange}
                        disabled={isRunning}
                    />
                </div>
                <span className="tp-colon">:</span>
                <div className="tp-input-group">
                    <label htmlFor="tp-sec">Sec</label>
                    <input
                        id="tp-sec"
                        className="tp-input"
                        type="number"
                        min={0}
                        max={59}
                        value={seconds}
                        onChange={handleSecChange}
                        disabled={isRunning}
                    />
                </div>
            </div>

            <div className="tp-controls">
                {isRunning ? (
                    <button className="tp-btn pause" onClick={handlePause}>
                        <Pause size={20} fill="currentColor" /> Pause
                    </button>
                ) : (
                    <button
                        className="tp-btn start"
                        onClick={handleStart}
                        disabled={durationSeconds <= 0 && timeLeft <= 0}
                    >
                        <Play size={20} fill="currentColor" /> {isPaused ? 'Resume' : 'Start'}
                    </button>
                )}
                <button className="tp-btn reset" onClick={handleReset}>
                    <RotateCcw size={20} /> Reset
                </button>
            </div>
        </div>
    );
};

export default Timer;
