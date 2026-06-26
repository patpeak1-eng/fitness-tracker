import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Ruler, Check, Volume2, VolumeX, Users, LogOut, ChevronLeft } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';
import { useTimer } from '../context/TimerContext';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import BackButton from '../components/common/BackButton';
import StorageService from '../services/StorageService';
import { VOICE_IDS } from '../constants/voiceIds';
import { COACH_PERSONALITIES } from '../constants/coachPersonalities';
import './Settings.css';

// ElevenLabs voice options for the AI coach (id -> display name).
const COACH_VOICES = [
    { id: VOICE_IDS.JARVIS, name: 'Jarvis' },
    { id: VOICE_IDS.SCARLETT, name: 'Scarlet Jo' },
    { id: VOICE_IDS.DAN, name: 'Dan' },
    { id: VOICE_IDS.NATE, name: 'Nate' },
];

const COACH_PERSONALITY_OPTIONS = [
    { id: COACH_PERSONALITIES.APEX, label: 'Apex', desc: 'Direct & data-driven' },
    { id: COACH_PERSONALITIES.HYPE, label: 'Hype', desc: 'High energy & motivating' },
    { id: COACH_PERSONALITIES.ZEN,  label: 'Zen', desc: 'Calm & technical' },
];

// On/off switch matching the smart-progression master toggle style.
const Toggle = ({ checked, onChange, label }) => (
    <label className="coach-switch">
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={label}
        />
        <span className="coach-switch-slider" />
    </label>
);

const Settings = () => {
    const navigate = useNavigate();
    const [showLogoutModal, setShowLogoutModal] = useState(false); // Modal State

    // Theme & Unit State from Context
    const {
        theme, setTheme,
        units, setUnits,
        soundEnabled, setSoundEnabled,
        coachPersonality, setCoachPersonality,
        coachVoiceId, setCoachVoiceId,
        currentProfile, switchProfile,
        smartProgressionEnabled, setSmartProgressionEnabled,
        progressionMode, setProgressionMode,
        progressionType, setProgressionType,
        progressionIncrement, setProgressionIncrement
    } = useWorkout();

    const {
        defaultRestTime, setDefaultRestTime,
        defaultWorkTime, setDefaultWorkTime,
    } = useTimer();

    // Backend connection status. VITE_API_URL is baked in at build time, so a
    // truthy value means this build was pointed at the deployed backend.
    const apiConnected = Boolean(import.meta.env.VITE_API_URL);

    // --- AI Coach settings (device-level, persisted immediately via StorageService) ---
    const [coachEnabled, setCoachEnabled] = useState(StorageService.loadCoachEnabled());
    const [coachVoiceInput, setCoachVoiceInput] = useState(StorageService.loadCoachVoiceInput());
    const [coachAutoplay, setCoachAutoplay] = useState(StorageService.loadCoachAutoplay());

    const handleCoachEnabled = (val) => { setCoachEnabled(val); StorageService.saveCoachEnabled(val); };
    const handleCoachPersonality = (val) => { setCoachPersonality(val); };
    const handleCoachVoiceId = (val) => { setCoachVoiceId(val); };
    const handleCoachVoiceInput = (val) => { setCoachVoiceInput(val); StorageService.saveCoachVoiceInput(val); };
    const handleCoachAutoplay = (val) => { setCoachAutoplay(val); StorageService.saveCoachAutoplay(val); };

    // "Saved ✓" confirmation. Settings persist automatically through
    // WorkoutContext's useEffect, so we surface a brief, auto-fading
    // confirmation whenever any setting value changes. The initial mount is
    // skipped so the toast doesn't flash on first load.
    const [showSaved, setShowSaved] = useState(false);
    const isInitialMount = useRef(true);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        setShowSaved(true);
        const timer = setTimeout(() => setShowSaved(false), 2000);
        return () => clearTimeout(timer);
    }, [
        theme, units, soundEnabled, defaultRestTime, defaultWorkTime,
        smartProgressionEnabled, progressionMode, progressionType, progressionIncrement,
        coachEnabled, coachPersonality, coachVoiceId, coachVoiceInput, coachAutoplay
    ]);

    const handleSwitchProfile = () => {
        setShowLogoutModal(false);
        switchProfile(null);
    };

    return (
        <div className="page settings-page" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className={`save-toast ${showSaved ? 'visible' : ''}`} role="status" aria-live="polite">
                <Check size={16} /> Saved
            </div>
            <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <BackButton />
                <h1 style={{ margin: 0 }}>Settings</h1>
            </header>

            <section className="settings-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingRight: '0.5rem' }}>
                    <h2 style={{ margin: 0 }}>Account</h2>
                    <button
                        onClick={() => setShowLogoutModal(true)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#ff4444',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 500
                        }}
                    >
                        Switch Profile <LogOut size={16} />
                    </button>
                </div>

                <Card className="setting-row">
                    <div className="setting-info" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div className="profile-avatar-large" style={{ backgroundColor: currentProfile?.color, width: '48px', height: '48px', fontSize: '1.2rem' }}>
                                {currentProfile?.avatar}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span className="setting-label" style={{ fontSize: '1.1rem' }}>{currentProfile?.name}</span>
                                <span className="setting-desc">Current Profile</span>
                            </div>
                        </div>
                    </div>
                </Card>

                <h2 style={{ marginTop: '20px' }}>Preferences</h2>

                {/* Visuals & Units */}
                <Card className="setting-row">
                    <div className="setting-info">
                        <span className="setting-label">Theme Mode</span>
                        <span className="setting-desc">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                    </div>
                    <button
                        className="toggle-btn"
                        onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                    >
                        {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </Card>

                <Card className="setting-row">
                    <div className="setting-info">
                        <span className="setting-label">Units</span>
                        <span className="setting-desc">Measurement system</span>
                    </div>
                    <div className="unit-toggle">
                        <button
                            className={`unit-btn ${units === 'metric' ? 'active' : ''}`}
                            onClick={() => setUnits('metric')}
                        >
                            kg / km
                        </button>
                        <button
                            className={`unit-btn ${units === 'imperial' ? 'active' : ''}`}
                            onClick={() => setUnits('imperial')}
                        >
                            lbs / mi
                        </button>
                    </div>
                </Card>

                {/* Timer Group */}
                <h3 style={{ marginTop: '24px', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Timer Settings</h3>

                <Card className="setting-row">
                    <div className="setting-info">
                        <span className="setting-label">Timer Sounds</span>
                        <span className="setting-desc">{soundEnabled ? 'Enabled' : 'Muted'}</span>
                    </div>
                    <button
                        className="toggle-btn"
                        onClick={() => setSoundEnabled(!soundEnabled)}
                    >
                        {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                </Card>

                <Card className="setting-row">
                    <div className="setting-info">
                        <span className="setting-label">Work Timer Default</span>
                        <span className="setting-desc">Standard duration for work intervals</span>
                    </div>
                    <div className="timer-input-group">
                        <input
                            type="number"
                            value={defaultWorkTime}
                            onChange={(e) => setDefaultWorkTime(Number(e.target.value))}
                            className="timer-input-box"
                        />
                        <span className="unit">sec</span>
                    </div>
                </Card>

                <Card className="setting-row">
                    <div className="setting-info">
                        <span className="setting-label">Rest Timer Default</span>
                        <span className="setting-desc">Standard duration for rest intervals</span>
                    </div>
                    <div className="timer-input-group">
                        <input
                            type="number"
                            value={defaultRestTime}
                            onChange={(e) => setDefaultRestTime(Number(e.target.value))}
                            className="timer-input-box"
                        />
                        <span className="unit">sec</span>
                    </div>
                </Card>

                {/* Smart Progression Group */}
                <div style={{ marginTop: '24px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Smart Progression</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.8 }}>- Customize how the app increases weight.</span>
                    </div>
                    {/* Master Toggle */}
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                        <input
                            type="checkbox"
                            checked={smartProgressionEnabled}
                            onChange={(e) => setSmartProgressionEnabled(e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: smartProgressionEnabled ? 'var(--primary)' : '#444',
                            transition: '.4s', borderRadius: '20px'
                        }}>
                            <span style={{
                                position: 'absolute', content: '""', height: '16px', width: '16px', left: '2px', bottom: '2px',
                                backgroundColor: smartProgressionEnabled ? '#000' : '#fff',
                                transition: '.4s', borderRadius: '50%',
                                transform: smartProgressionEnabled ? 'translateX(20px)' : 'none'
                            }}></span>
                        </span>
                    </label>
                </div>

                <div className={`smart-progression-content ${smartProgressionEnabled ? 'open' : ''}`}>
                    <Card>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">Progression Logic</span>
                                <span className="setting-desc">
                                    When to increase weight
                                </span>
                            </div>
                            <div className="unit-toggle">
                                <button
                                    className={`unit-btn ${progressionMode === 'linear' ? 'active' : ''}`}
                                    onClick={() => setProgressionMode('linear')}
                                >
                                    Linear
                                </button>
                                <button
                                    className={`unit-btn ${progressionMode === 'double' ? 'active' : ''}`}
                                    onClick={() => setProgressionMode('double')}
                                >
                                    Double
                                </button>
                            </div>
                        </div>
                        <div className="setting-help-text">
                            <p style={{ margin: '0 0 8px 0', opacity: progressionMode === 'linear' ? 1 : 0.6, transition: 'opacity 0.3s' }}>
                                <strong style={{ color: progressionMode === 'linear' ? 'var(--primary)' : 'inherit' }}>LINEAR:</strong> Recommends an increase if you hit your target reps on the LAST set. Best for aggressive progression.
                            </p>
                            <p style={{ margin: 0, opacity: progressionMode === 'double' ? 1 : 0.6, transition: 'opacity 0.3s' }}>
                                <strong style={{ color: progressionMode === 'double' ? 'var(--primary)' : 'inherit' }}>DOUBLE:</strong> Recommends an increase only if you hit your target reps on ALL sets. Best for steady, safe progression.
                            </p>
                        </div>
                    </Card>

                    <Card>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">Increment Logic</span>
                                <span className="setting-desc">
                                    How to calculate increase
                                </span>
                            </div>
                            <div className="unit-toggle">
                                <button
                                    className={`unit-btn ${progressionType === 'fixed' ? 'active' : ''}`}
                                    onClick={() => setProgressionType('fixed')}
                                >
                                    Fixed
                                </button>
                                <button
                                    className={`unit-btn ${progressionType === 'percentage' ? 'active' : ''}`}
                                    onClick={() => setProgressionType('percentage')}
                                >
                                    %
                                </button>
                            </div>
                        </div>
                        <div className="setting-help-text">
                            <p style={{ margin: '0 0 8px 0', opacity: progressionType === 'fixed' ? 1 : 0.6, transition: 'opacity 0.3s' }}>
                                <strong style={{ color: progressionType === 'fixed' ? 'var(--primary)' : 'inherit' }}>FIXED:</strong> Increases weight by a specific amount (e.g., +5 lbs) every time.
                            </p>
                            <p style={{ margin: 0, opacity: progressionType === 'percentage' ? 1 : 0.6, transition: 'opacity 0.3s' }}>
                                <strong style={{ color: progressionType === 'percentage' ? 'var(--primary)' : 'inherit' }}>PERCENTAGE:</strong> Increases weight by a percentage of your current lift (e.g., +2.5%). Good for micro-loading.
                            </p>
                        </div>
                    </Card>

                    <Card>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">Increment Value</span>
                                <span className="setting-desc">
                                    Step size
                                </span>
                            </div>
                            <div className="timer-input-group">
                                <input
                                    type="number"
                                    step={progressionType === 'fixed' ? 0.5 : 0.1}
                                    value={progressionIncrement}
                                    onChange={(e) => setProgressionIncrement(Number(e.target.value))}
                                    className="timer-input-box"
                                />
                                <span className="unit">
                                    {progressionType === 'fixed' ? (units === 'metric' ? 'kg' : 'lbs') : '%'}
                                </span>
                            </div>
                        </div>
                        <div className="setting-help-text">
                            The exact amount added when a progression is triggered.
                            {progressionType === 'percentage' && ` currently adds about ${Math.round(100 * (progressionIncrement / 100)) / 1} lbs to a 100 lb lift.`}
                        </div>
                    </Card>
                </div>
            </section>

            <section className="settings-section">
                <h2>AI Coach</h2>

                <Card className="setting-row">
                    <div className="setting-info">
                        <span className="setting-label">Enable AI Coach</span>
                        <span className="setting-desc">{coachEnabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <Toggle checked={coachEnabled} onChange={handleCoachEnabled} label="Enable AI Coach" />
                </Card>

                {coachEnabled && (
                    <>
                        <Card>
                            <span className="setting-label">Personality</span>
                            <div className="unit-toggle coach-personality">
                                {COACH_PERSONALITY_OPTIONS.map((p) => (
                                    <button
                                        key={p.id}
                                        className={`unit-btn ${coachPersonality === p.id ? 'active' : ''}`}
                                        onClick={() => handleCoachPersonality(p.id)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <p className="setting-desc coach-personality-desc">
                                {COACH_PERSONALITY_OPTIONS.find((p) => p.id === coachPersonality)?.desc}
                            </p>
                        </Card>

                        <Card>
                            <span className="setting-label">Voice</span>
                            <div className="coach-voice-list">
                                {COACH_VOICES.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        className="coach-voice-option"
                                        onClick={() => handleCoachVoiceId(v.id)}
                                        aria-pressed={coachVoiceId === v.id}
                                    >
                                        <span>{v.name}</span>
                                        {coachVoiceId === v.id && <Check size={16} color="var(--primary)" />}
                                    </button>
                                ))}
                            </div>
                        </Card>

                        <Card className="coach-toggle-card">
                            <div className="setting-row">
                                <div className="setting-info">
                                    <span className="setting-label">Voice Input (Mic)</span>
                                    <span className="setting-desc">Speak your messages to the coach</span>
                                </div>
                                <Toggle checked={coachVoiceInput} onChange={handleCoachVoiceInput} label="Voice input" />
                            </div>
                            <div className="setting-row">
                                <div className="setting-info">
                                    <span className="setting-label">Auto-play Voice</span>
                                    <span className="setting-desc">Speak the coach&apos;s replies aloud</span>
                                </div>
                                <Toggle checked={coachAutoplay} onChange={handleCoachAutoplay} label="Auto-play voice" />
                            </div>
                        </Card>
                    </>
                )}
            </section>

            <div className="version-info">
                <p>App: FitTrack v1.0</p>
                <p>
                    Backend:{' '}
                    <span className={`backend-status ${apiConnected ? 'connected' : 'local'}`}>
                        {apiConnected ? 'Connected' : 'Local only'}
                    </span>
                </p>
            </div>

            <Modal
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                title="Switch Profile"
                actions={
                    <>
                        <button className="secondary-btn" onClick={() => setShowLogoutModal(false)}>Cancel</button>
                        <button
                            className="primary-btn"
                            style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                            onClick={handleSwitchProfile}
                        >
                            Log Out
                        </button>
                    </>
                }
            >
                <p>Are you sure you want to log out and switch profiles?</p>
            </Modal>
        </div>
    );
};

export default Settings;
