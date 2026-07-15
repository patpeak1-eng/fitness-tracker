import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Check, Volume2, VolumeX, LogOut, Users, Trash2 } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';
import { useTimer } from '../context/TimerContext';
import Modal from '../components/common/Modal';
import BackButton from '../components/common/BackButton';
import StorageService from '../services/StorageService';
import { deleteAccount } from '../services/ApiService';
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

// Values match Assessment.jsx's `experience` answer — one shared vocabulary.
const EXPERIENCE_LEVEL_OPTIONS = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' },
];

// The single on/off switch used everywhere on this screen.
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

// Grouped-list building blocks: one flat card per group, rows divided by
// hairlines (surface separation per D4, not one card per row).
const Group = ({ title, children }) => (
    <section className="settings-group-section">
        {title && <h2 className="settings-group-title">{title}</h2>}
        <div className="settings-group">{children}</div>
    </section>
);

const Row = ({ label, desc, children, stacked = false }) => (
    <div className={`settings-row ${stacked ? 'stacked' : ''}`}>
        <div className="setting-info">
            <span className="setting-label">{label}</span>
            {desc && <span className="setting-desc">{desc}</span>}
        </div>
        {children && <div className="setting-control">{children}</div>}
    </div>
);

const Settings = () => {
    const navigate = useNavigate();
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    // --- Account deletion (danger zone) ---
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [deleting, setDeleting] = useState(false);
    // Email/password users hold a Bearer token in localStorage; Google OAuth
    // users never do (cookie-only). This is the same discriminator apiFetch
    // uses, and it decides whether we require password re-entry. The backend
    // re-checks the real factor (sentinel hash) regardless.
    const isPasswordUser = !!StorageService.loadAuthToken();

    const {
        theme, setTheme,
        units, setUnits,
        soundEnabled, setSoundEnabled,
        coachPersonality, setCoachPersonality,
        coachVoiceId, setCoachVoiceId,
        experienceLevel, setExperienceLevel,
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

    const openDeleteModal = () => {
        setDeleteConfirmText('');
        setDeletePassword('');
        setDeleteError('');
        setShowDeleteModal(true);
    };

    const handleDeleteAccount = async () => {
        setDeleteError('');
        setDeleting(true);
        try {
            await deleteAccount({
                confirm: deleteConfirmText.trim(),
                password: isPasswordUser ? deletePassword : null,
            });
            // Server rows are gone and the session cookie is cleared. Do a full
            // sign-out (same path as Profile's handleSignOut) WITHOUT deleting
            // the local data blobs — hard-navigate to /login so the context
            // re-initializes clean.
            StorageService.clearAuthToken();
            StorageService.setLoggedOut();
            StorageService.saveProfiles([]);
            StorageService.remove(StorageService.KEY.currentProfileId, { global: true });
            window.location.href = '/login';
        } catch (err) {
            setDeleteError(err.message || 'Could not delete account. Please try again.');
            setDeleting(false);
        }
    };

    const deleteConfirmed = deleteConfirmText.trim() === 'DELETE';
    const deleteReady = deleteConfirmed && (!isPasswordUser || deletePassword.length > 0);

    return (
        <div className="page settings-page">
            <div className={`save-toast ${showSaved ? 'visible' : ''}`} role="status" aria-live="polite">
                <Check size={16} /> Saved
            </div>
            <header className="page-header settings-header">
                <BackButton />
                <h1>Settings</h1>
            </header>

            <Group title="Account">
                <div className="settings-row account-row">
                    <div className="settings-avatar" style={{ backgroundColor: currentProfile?.color }}>
                        {currentProfile?.avatar}
                    </div>
                    <div className="setting-info">
                        <span className="setting-label">{currentProfile?.name}</span>
                        <span className="setting-desc">Current profile</span>
                    </div>
                </div>
                <button className="settings-row row-action" onClick={() => navigate('/profiles')}>
                    <div className="setting-info">
                        <span className="setting-label">Manage local profiles</span>
                        <span className="setting-desc">Device-only profiles for sharing this device — separate from cloud accounts</span>
                    </div>
                    <Users size={18} />
                </button>
                <button className="settings-row row-action danger" onClick={() => setShowLogoutModal(true)}>
                    <span className="setting-label">Switch profile</span>
                    <LogOut size={18} />
                </button>
            </Group>

            <Group title="Preferences">
                <Row label="Theme" desc={theme === 'dark' ? 'Dark mode' : 'Light mode'}>
                    <button
                        className="toggle-btn"
                        onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle theme"
                    >
                        {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </Row>
                <Row label="Units" desc="Measurement system">
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
                </Row>
            </Group>

            <Group title="Timers">
                <Row label="Timer sounds" desc={soundEnabled ? 'Enabled' : 'Muted'}>
                    <button
                        className="toggle-btn"
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        aria-label="Toggle timer sounds"
                    >
                        {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                </Row>
                <Row label="Work default" desc="Standard work interval">
                    <div className="timer-input-group">
                        <input
                            type="number"
                            value={defaultWorkTime}
                            onChange={(e) => setDefaultWorkTime(Number(e.target.value))}
                            className="timer-input-box"
                            aria-label="Work timer default seconds"
                        />
                        <span className="timer-unit">sec</span>
                    </div>
                </Row>
                <Row label="Rest default" desc="Standard rest interval">
                    <div className="timer-input-group">
                        <input
                            type="number"
                            value={defaultRestTime}
                            onChange={(e) => setDefaultRestTime(Number(e.target.value))}
                            className="timer-input-box"
                            aria-label="Rest timer default seconds"
                        />
                        <span className="timer-unit">sec</span>
                    </div>
                </Row>
            </Group>

            <Group title="Smart Progression">
                <Row label="Auto-progression" desc="Recommend weight increases">
                    <Toggle
                        checked={smartProgressionEnabled}
                        onChange={setSmartProgressionEnabled}
                        label="Enable smart progression"
                    />
                </Row>
                {smartProgressionEnabled && (
                    <>
                        <Row label="Logic" desc="When to increase weight">
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
                        </Row>
                        <div className="settings-help">
                            {progressionMode === 'linear'
                                ? 'Linear: recommends an increase when you hit target reps on the last set. Aggressive progression.'
                                : 'Double: recommends an increase only when you hit target reps on all sets. Steady, safe progression.'}
                        </div>
                        <Row label="Increment" desc="How to calculate the increase">
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
                        </Row>
                        <Row label="Step size" desc="Amount added per progression">
                            <div className="timer-input-group">
                                <input
                                    type="number"
                                    step={progressionType === 'fixed' ? 0.5 : 0.1}
                                    value={progressionIncrement}
                                    onChange={(e) => setProgressionIncrement(Number(e.target.value))}
                                    className="timer-input-box"
                                    aria-label="Progression step size"
                                />
                                <span className="timer-unit">
                                    {progressionType === 'fixed' ? (units === 'metric' ? 'kg' : 'lbs') : '%'}
                                </span>
                            </div>
                        </Row>
                    </>
                )}
            </Group>

            <Group title="AI Coach">
                <Row label="Enable AI Coach" desc={coachEnabled ? 'Enabled' : 'Disabled'}>
                    <Toggle checked={coachEnabled} onChange={handleCoachEnabled} label="Enable AI Coach" />
                </Row>
                {coachEnabled && (
                    <>
                        <Row
                            label="Personality"
                            desc={COACH_PERSONALITY_OPTIONS.find((p) => p.id === coachPersonality)?.desc}
                            stacked
                        >
                            <div className="unit-toggle coach-personality">
                                {COACH_PERSONALITY_OPTIONS.map((p) => (
                                    <button
                                        key={p.id}
                                        className={`unit-btn ${coachPersonality === p.id ? 'active' : ''}`}
                                        onClick={() => setCoachPersonality(p.id)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </Row>
                        {COACH_VOICES.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                className="settings-row row-action coach-voice-option"
                                onClick={() => setCoachVoiceId(v.id)}
                                aria-pressed={coachVoiceId === v.id}
                            >
                                <span className="setting-label">{v.name}</span>
                                {coachVoiceId === v.id && <Check size={16} className="voice-check" />}
                            </button>
                        ))}
                        <Row
                            label="Experience level"
                            desc="Calibrates how much the coach explains"
                            stacked
                        >
                            <div className="unit-toggle">
                                {EXPERIENCE_LEVEL_OPTIONS.map((lvl) => (
                                    <button
                                        key={lvl.id}
                                        className={`unit-btn ${experienceLevel === lvl.id ? 'active' : ''}`}
                                        onClick={() => setExperienceLevel(lvl.id)}
                                    >
                                        {lvl.label}
                                    </button>
                                ))}
                            </div>
                        </Row>
                        <Row label="Voice input" desc="Speak your messages to the coach">
                            <Toggle checked={coachVoiceInput} onChange={handleCoachVoiceInput} label="Voice input" />
                        </Row>
                        <Row label="Auto-play voice" desc="Speak the coach's replies aloud">
                            <Toggle checked={coachAutoplay} onChange={handleCoachAutoplay} label="Auto-play voice" />
                        </Row>
                    </>
                )}
            </Group>

            {apiConnected && currentProfile?.email && (
                <Group title="Danger zone">
                    <button className="settings-row row-action danger" onClick={openDeleteModal}>
                        <div className="setting-info">
                            <span className="setting-label">Delete account…</span>
                            <span className="setting-desc">
                                Permanently delete your account and all cloud data. This cannot be undone.
                            </span>
                        </div>
                        <Trash2 size={18} />
                    </button>
                </Group>
            )}

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
                        <button className="primary-btn danger-btn" onClick={handleSwitchProfile}>
                            Log Out
                        </button>
                    </>
                }
            >
                <p>Are you sure you want to log out and switch profiles?</p>
            </Modal>

            <Modal
                isOpen={showDeleteModal}
                onClose={() => { if (!deleting) setShowDeleteModal(false); }}
                title="Delete account"
                showCloseButton={!deleting}
                actions={
                    <>
                        <button
                            className="secondary-btn"
                            onClick={() => setShowDeleteModal(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </button>
                        <button
                            className="primary-btn danger-btn"
                            onClick={handleDeleteAccount}
                            disabled={deleting || !deleteReady}
                        >
                            {deleting ? 'Deleting…' : 'Delete forever'}
                        </button>
                    </>
                }
            >
                <p>
                    This permanently deletes your account and all its cloud data — workout
                    history, assessments, weight log, custom templates and exercises, and your
                    coach conversation. <strong>This cannot be undone.</strong>
                </p>
                {isPasswordUser && (
                    <div className="delete-field">
                        <label htmlFor="delete-password">Confirm your password</label>
                        <input
                            id="delete-password"
                            type="password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            autoComplete="current-password"
                            disabled={deleting}
                        />
                    </div>
                )}
                <div className="delete-field">
                    <label htmlFor="delete-confirm">Type DELETE to confirm</label>
                    <input
                        id="delete-confirm"
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="DELETE"
                        disabled={deleting}
                    />
                </div>
                {deleteError && <p className="delete-error" role="alert">{deleteError}</p>}
            </Modal>
        </div>
    );
};

export default Settings;
