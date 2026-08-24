import React, { useState, useRef, useEffect } from 'react';
import { User, Target, Activity, Heart, Download, Upload, HelpCircle, Pencil, Check, Cloud, LogOut, UserPlus, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import StorageService from '../services/StorageService';
import * as ApiService from '../services/ApiService';
import Modal from '../components/common/Modal';
import BackButton from '../components/common/BackButton';
import ProgressChart from '../components/analytics/ProgressChart';
import './Profile.css';

const Profile = () => {
    const navigate = useNavigate();
    const {
        userStats,
        setUserStats,
        currentProfile,
        units,
        weightHistory,
        addWeightEntry,
        exportData,
        importData,
        // May be added by T4 later; undefined for now (see name-edit flag).
        updateProfile
    } = useWorkout();

    // Local state for BMI calculation display
    const [bmi, setBmi] = useState(null);
    const [bmiCategory, setBmiCategory] = useState('');

    // Save feedback state
    const [savedSection, setSavedSection] = useState(null); // 'personal' | 'measurements' | null
    const [autoSaved, setAutoSaved] = useState(false);
    const savedTimer = useRef(null);
    const autoSaveTimer = useRef(null);

    // Profile name editing state
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [nameNote, setNameNote] = useState(null);
    const nameNoteTimer = useRef(null);

    // Advanced (data tools) collapse state
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Data Management State
    const [dataModal, setDataModal] = useState({ isOpen: false, title: '', message: '' });
    const [confirmImport, setConfirmImport] = useState({ isOpen: false, file: null });
    const fileInputRef = useRef(null);

    // Cloud sync is active for account users (profile carries an email and the
    // backend URL is configured).
    const isSynced = !!(currentProfile?.email && ApiService.isAvailable());

    const handleSignOut = async () => {
        // Best-effort backend logout: clears the HttpOnly auth cookie server-side.
        try {
            const apiUrl = import.meta.env.VITE_API_URL;
            if (apiUrl) {
                await fetch(`${apiUrl}/api/auth/logout`, {
                    method: 'POST',
                    credentials: 'include'
                });
            }
        } catch (e) {
            // Backend unreachable — still clear local state
            console.warn('Logout endpoint unreachable:', e);
        }

        // Full logout: clear the auth token AND the local profile/session, then
        // hard-navigate to the Login screen. (saveCurrentProfileId(null) would
        // persist the string "null", so remove the key directly instead.)
        StorageService.clearAuthToken();
        StorageService.setLoggedOut();
        StorageService.saveProfiles([]);
        StorageService.remove(StorageService.KEY.currentProfileId, { global: true });
        window.location.href = '/login';
    };

    // --- Auto-save visual feedback ---
    const triggerAutoSaved = () => {
        setAutoSaved(true);
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => setAutoSaved(false), 2000);
    };

    const handleSave = async (section) => {
        // Data is already persisted on each change; this re-triggers persistence
        // and gives the user explicit confirmation.
        setUserStats(prev => ({ ...prev }));

        setSavedSection(section);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSavedSection(null), 2000);

        // Push body stats to the backend for cloud users. Non-fatal:
        // localStorage stays the source of truth on failure.
        if (currentProfile?.email && ApiService.isAvailable()) {
            try {
                await ApiService.saveProfile({
                    stats: {
                        age: userStats.age || null,
                        date_of_birth: userStats.dateOfBirth || null,
                        height: userStats.height || null,
                        current_weight: userStats.currentWeight || null,
                        target_weight: userStats.targetWeight || null,
                        goal: userStats.goal || null,
                        motivation: userStats.motivation || null,
                        body_fat: userStats.bodyFat || null,
                        muscle_mass: userStats.muscleMass || null,
                        bone_density: userStats.boneDensity || null
                    }
                });
            } catch (err) {
                console.warn('[CloudSync] Profile push failed:', err.message);
            }
        }
    };

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            if (savedTimer.current) clearTimeout(savedTimer.current);
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            if (nameNoteTimer.current) clearTimeout(nameNoteTimer.current);
        };
    }, []);

    // --- Name editing ---
    const startEditName = () => {
        setNameDraft(currentProfile?.name || '');
        setEditingName(true);
    };

    const commitName = () => {
        const newName = nameDraft.trim();
        setEditingName(false);
        if (!newName || newName === currentProfile?.name) return;

        if (typeof updateProfile === 'function') {
            updateProfile({
                name: newName,
                avatar: newName.charAt(0).toUpperCase()
            });
        } else {
            // updateProfile not yet available in WorkoutContext (owned by T4).
            setNameNote('Name editing is coming soon.');
            if (nameNoteTimer.current) clearTimeout(nameNoteTimer.current);
            nameNoteTimer.current = setTimeout(() => setNameNote(null), 3000);
        }
    };

    const handleNameKeyDown = (e) => {
        if (e.key === 'Enter') commitName();
        else if (e.key === 'Escape') setEditingName(false);
    };

    const handleImportClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setConfirmImport({ isOpen: true, file });
        e.target.value = null;
    };

    const performImport = async () => {
        if (!confirmImport.file) return;

        try {
            await importData(confirmImport.file);
        } catch (error) {
            setDataModal({
                isOpen: true,
                title: 'Import Failed',
                message: error.message
            });
        }
        setConfirmImport({ isOpen: false, file: null });
    };

    // Age from date of birth: year difference, minus one if this year's
    // birthday hasn't happened yet. DOB wins over the manual age string
    // whenever it is set (spec: docs/dob_age_spec_s21.md).
    const computeAge = (dobStr) => {
        const dob = new Date(dobStr + 'T00:00:00');
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        // Subtract one if this year's birthday hasn't happened yet
        if (now.getMonth() < dob.getMonth() ||
            (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    };

    // --- Date-of-birth selects (S27) ---
    // Three explicit selects replace the native date input: Android's picker
    // opens on the calendar view, so reaching a 1980s year meant paging month
    // by month. Local selection state allows partial picks; nothing is
    // written to userStats until all three parts are set.
    const [dobSel, setDobSel] = useState(() => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(userStats.dateOfBirth || '');
        return m
            ? { year: +m[1], month: +m[2], day: +m[3] }
            : { year: '', month: '', day: '' };
    });

    // Re-sync from storage when it changes underneath us (profile hydration,
    // cloud pull). The equality check keeps our own writes from looping.
    useEffect(() => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(userStats.dateOfBirth || '');
        if (!m) return;
        const next = { year: +m[1], month: +m[2], day: +m[3] };
        setDobSel(prev => (
            prev.year === next.year && prev.month === next.month && prev.day === next.day
                ? prev
                : next
        ));
    }, [userStats.dateOfBirth]);

    // Month lengths via the Date rollover trick: day 0 of the NEXT month is
    // this month's last day — leap years come out correct for free.
    const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

    // Clamp a selection to a real, non-future date. A month/year change that
    // invalidates the picked day lands on the month's last valid day.
    const clampDobSelection = (sel) => {
        const t = new Date();
        const next = { ...sel };
        if (next.year === t.getFullYear() && next.month && next.month > t.getMonth() + 1) {
            next.month = t.getMonth() + 1;
        }
        if (next.year && next.month) {
            let maxDay = daysInMonth(next.year, next.month);
            if (next.year === t.getFullYear() && next.month === t.getMonth() + 1) {
                maxDay = Math.min(maxDay, t.getDate());
            }
            if (next.day && next.day > maxDay) next.day = maxDay;
        }
        return next;
    };

    const handleDobPartChange = (part, rawValue) => {
        const next = clampDobSelection({
            ...dobSel,
            [part]: rawValue === '' ? '' : Number(rawValue),
        });
        setDobSel(next);
        // Partial selection writes nothing; the stored format stays yyyy-MM-dd.
        if (next.year && next.month && next.day) {
            const iso = `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`;
            setUserStats(prev => ({ ...prev, dateOfBirth: iso }));
            triggerAutoSaved();
        }
    };

    const DOB_MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const dobToday = new Date();
    const dobYears = Array.from({ length: 101 }, (_, i) => dobToday.getFullYear() - i);
    const dobMonthMax = dobSel.year === dobToday.getFullYear() ? dobToday.getMonth() + 1 : 12;
    const dobDayMax = (dobSel.year && dobSel.month)
        ? (dobSel.year === dobToday.getFullYear() && dobSel.month === dobToday.getMonth() + 1
            ? Math.min(daysInMonth(dobSel.year, dobSel.month), dobToday.getDate())
            : daysInMonth(dobSel.year, dobSel.month))
        : 31;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setUserStats(prev => ({
            ...prev,
            [name]: value
        }));
        triggerAutoSaved();
    };

    // When weight input loses focus, add entry if different from last entry
    const handleWeightBlur = () => {
        const newWeight = parseFloat(userStats.currentWeight);
        if (isNaN(newWeight) || newWeight <= 0) return;

        const lastEntry = weightHistory[weightHistory.length - 1];
        if (!lastEntry || Math.abs(lastEntry.weight - newWeight) > 0.1) {
            addWeightEntry(newWeight);
        }
    };

    // Calculate BMI whenever height or weight changes
    useEffect(() => {
        const height = parseFloat(userStats.height);
        const weight = parseFloat(userStats.currentWeight);

        if (height > 0 && weight > 0) {
            let calculatedBmi = 0;
            if (units === 'metric') {
                calculatedBmi = weight / ((height / 100) * (height / 100));
            } else {
                calculatedBmi = (weight / (height * height)) * 703;
            }

            setBmi(calculatedBmi.toFixed(1));

            if (calculatedBmi < 18.5) setBmiCategory('Underweight');
            else if (calculatedBmi < 25) setBmiCategory('Normal weight');
            else if (calculatedBmi < 30) setBmiCategory('Overweight');
            else setBmiCategory('Obese');
        } else {
            setBmi(null);
            setBmiCategory('');
        }
    }, [userStats.height, userStats.currentWeight, units]);

    const unitLabels = units === 'metric'
        ? { height: 'cm', weight: 'kg' }
        : { height: 'in', weight: 'lbs' };

    const weightGraphData = weightHistory.map(entry => ({
        name: format(new Date(entry.date), 'MMM d'),
        weight: entry.weight
    }));

    const AutoSaveIndicator = () => (
        <div className={`autosave-indicator ${autoSaved ? 'visible' : ''}`}>
            <Check size={14} /> All changes saved
        </div>
    );

    return (
        <div className="page profile-page">
            <header className="page-header profile-header-row">
                <BackButton />
                <button
                    className="help-toggle-btn"
                    onClick={() => navigate('/help')}
                    title="Help Guide"
                    aria-label="Open help guide"
                >
                    <HelpCircle size={22} />
                </button>
            </header>

            {/* Identity band: avatar + name + sync state at a glance */}
            <div className="identity-band">
                <div className="identity-avatar" style={{ backgroundColor: currentProfile?.color }}>
                    {currentProfile?.avatar}
                </div>
                <div className="identity-text">
                    <div className="profile-name-row">
                        {editingName ? (
                            <input
                                className="name-input"
                                value={nameDraft}
                                autoFocus
                                onChange={(e) => setNameDraft(e.target.value)}
                                onBlur={commitName}
                                onKeyDown={handleNameKeyDown}
                                aria-label="Profile name"
                            />
                        ) : (
                            <>
                                <h1 className="profile-name">{currentProfile?.name || 'My Profile'}</h1>
                                <button
                                    className="name-edit-btn"
                                    onClick={startEditName}
                                    title="Edit name"
                                    aria-label="Edit profile name"
                                >
                                    <Pencil size={16} />
                                </button>
                            </>
                        )}
                    </div>
                    <span className={`identity-sync ${isSynced ? 'online' : ''}`}>
                        <span className="sync-dot" />
                        {isSynced ? 'Synced to cloud' : 'Local profile'}
                    </span>
                    {nameNote && <span className="name-note">{nameNote}</span>}
                </div>
            </div>

            {/* Body overview: the numbers this page manages, at a glance */}
            <section className="body-band">
                <div className="body-stat">
                    <span className="body-stat-label">BMI</span>
                    <span className="body-stat-value">{bmi || '--'}</span>
                    <span className="body-stat-sub">{bmiCategory || 'Add height & weight'}</span>
                </div>
                <div className="body-stat">
                    <span className="body-stat-label">Current</span>
                    <span className="body-stat-value">
                        {userStats.currentWeight || '--'}
                        <span className="body-stat-unit"> {unitLabels.weight}</span>
                    </span>
                    <span className="body-stat-sub">weight</span>
                </div>
                <div className="body-stat">
                    <span className="body-stat-label">Target</span>
                    <span className="body-stat-value">
                        {userStats.targetWeight || '--'}
                        <span className="body-stat-unit"> {unitLabels.weight}</span>
                    </span>
                    <span className="body-stat-sub">goal weight</span>
                </div>
            </section>

            <section className="profile-section">
                <h2><User size={16} /> Personal Information</h2>
                <div className="form-card">
                    <div className="form-group">
                        <label>Date of birth</label>
                        <div className="dob-selects">
                            <select
                                aria-label="Birth month"
                                value={dobSel.month}
                                onChange={(e) => handleDobPartChange('month', e.target.value)}
                            >
                                <option value="">Month</option>
                                {DOB_MONTHS.slice(0, dobMonthMax).map((name, i) => (
                                    <option key={name} value={i + 1}>{name}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Birth day"
                                value={dobSel.day}
                                onChange={(e) => handleDobPartChange('day', e.target.value)}
                            >
                                <option value="">Day</option>
                                {Array.from({ length: dobDayMax }, (_, i) => i + 1).map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Birth year"
                                value={dobSel.year}
                                onChange={(e) => handleDobPartChange('year', e.target.value)}
                            >
                                <option value="">Year</option>
                                {dobYears.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        {/* DOB wins over the legacy manual age string whenever it
                            is set (spec: docs/dob_age_spec_s21.md). */}
                        <span className="dob-age-display">
                            Age: {userStats.dateOfBirth
                                ? computeAge(userStats.dateOfBirth)
                                : (userStats.age || '--')}
                        </span>
                    </div>
                    <div className="form-group">
                        <label>Height ({unitLabels.height})</label>
                        <input
                            type="number"
                            name="height"
                            value={userStats.height}
                            onChange={handleChange}
                            placeholder={`Height in ${unitLabels.height}`}
                        />
                    </div>
                    <div className="section-footer">
                        <AutoSaveIndicator />
                        <button className="save-btn" onClick={() => handleSave('personal')}>Save</button>
                        <span className={`save-confirm ${savedSection === 'personal' ? 'visible' : ''}`}>
                            <Check size={16} /> Saved
                        </span>
                    </div>
                </div>
            </section>

            <section className="profile-section">
                <h2><Activity size={16} /> Measurements</h2>
                <div className="form-card">
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Current Weight ({unitLabels.weight})</label>
                            <input
                                type="number"
                                name="currentWeight"
                                value={userStats.currentWeight}
                                onChange={handleChange}
                                onBlur={handleWeightBlur}
                                placeholder="0.0"
                            />
                        </div>
                        <div className="form-group">
                            <label>Target Weight ({unitLabels.weight})</label>
                            <input
                                type="number"
                                name="targetWeight"
                                value={userStats.targetWeight}
                                onChange={handleChange}
                                placeholder="0.0"
                            />
                        </div>
                    </div>
                    <div className="section-footer">
                        <AutoSaveIndicator />
                        <button className="save-btn" onClick={() => handleSave('measurements')}>Save</button>
                        <span className={`save-confirm ${savedSection === 'measurements' ? 'visible' : ''}`}>
                            <Check size={16} /> Saved
                        </span>
                    </div>
                </div>
            </section>

            {/* Weight Progress Chart */}
            {weightGraphData.length > 1 && (
                <section className="profile-section">
                    <h2><Activity size={16} /> Weight Progress</h2>
                    <div className="chart-card">
                        <ProgressChart
                            type="line"
                            data={weightGraphData}
                            dataKey="weight"
                            color="var(--primary)"
                            unit={unitLabels.weight}
                        />
                    </div>
                </section>
            )}

            <section className="profile-section">
                <h2><Target size={16} /> Fitness Goals</h2>
                <div className="form-card">
                    <div className="form-group">
                        <label>Primary Goal</label>
                        <select name="goal" value={userStats.goal} onChange={handleChange}>
                            <option value="strength">Strength & Hypertrophy</option>
                            <option value="weight_loss">Weight Loss</option>
                            <option value="endurance">Endurance & Cardio</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="flexibility">Flexibility & Mobility</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Motivation</label>
                        <textarea
                            name="motivation"
                            value={userStats.motivation}
                            onChange={handleChange}
                            placeholder="Why do you train? (e.g., 'To keep up with my kids', 'To run a marathon')"
                            rows={3}
                        />
                    </div>
                    <AutoSaveIndicator />
                </div>
            </section>

            <section className="profile-section">
                <h2><Heart size={16} /> Advanced (Optional)</h2>
                <div className="form-card">
                    <div className="form-row-3">
                        <div className="form-group">
                            <label>Body Fat %</label>
                            <input
                                type="number"
                                name="bodyFat"
                                value={userStats.bodyFat}
                                onChange={handleChange}
                                placeholder="%"
                            />
                        </div>
                        <div className="form-group">
                            <label>Muscle Mass</label>
                            <input
                                type="number"
                                name="muscleMass"
                                value={userStats.muscleMass}
                                onChange={handleChange}
                                placeholder={unitLabels.weight}
                            />
                        </div>
                        <div className="form-group">
                            <label>Bone Density</label>
                            <input
                                type="number"
                                name="boneDensity"
                                value={userStats.boneDensity}
                                onChange={handleChange}
                                placeholder="T-Score"
                            />
                        </div>
                    </div>
                    <AutoSaveIndicator />
                </div>
            </section>

            <section className="profile-section">
                <h2><Cloud size={16} /> Account & Sync</h2>
                <div className="form-card sync-card">
                    <div className="sync-status">
                        <span className={`sync-dot large ${isSynced ? 'online' : ''}`}></span>
                        <div className="sync-text">
                            <span className="sync-title">{isSynced ? 'Synced to cloud' : 'Sign in to sync across devices'}</span>
                            <span className="sync-sub">
                                {isSynced ? 'Your data is backed up to your account' : 'Create an account to back up and sync your data'}
                            </span>
                        </div>
                    </div>
                    <div className="sync-actions">
                        {isSynced ? (
                            <button className="secondary-btn" onClick={handleSignOut}>
                                <LogOut size={18} /> Sign Out
                            </button>
                        ) : (
                            <button className="primary-btn" onClick={() => navigate('/login')}>
                                <UserPlus size={18} /> Create Account
                            </button>
                        )}
                    </div>
                </div>

                {/* Advanced data tools (collapsed) */}
                <button
                    className="advanced-toggle"
                    onClick={() => setShowAdvanced((v) => !v)}
                    aria-expanded={showAdvanced}
                >
                    <span>Advanced</span>
                    <ChevronDown size={18} className={`adv-chevron ${showAdvanced ? 'open' : ''}`} />
                </button>
                {showAdvanced && (
                    <div className="form-card advanced-content">
                        <p className="advanced-note">
                            Manually transfer your data between devices.
                        </p>
                        <div className="form-row-2">
                            <button className="secondary-btn data-btn" onClick={exportData}>
                                <Download size={18} /> Export Backup
                            </button>
                            <button className="secondary-btn data-btn" onClick={handleImportClick}>
                                <Upload size={18} /> Import Backup
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden-file-input"
                                accept=".json"
                            />
                        </div>
                    </div>
                )}
            </section>

            <Modal
                isOpen={dataModal.isOpen}
                onClose={() => setDataModal({ ...dataModal, isOpen: false })}
                title={dataModal.title}
            >
                <p>{dataModal.message}</p>
                <div className="modal-footer">
                    <button
                        className="modal-btn-primary"
                        onClick={() => setDataModal({ ...dataModal, isOpen: false })}
                    >
                        Close
                    </button>
                </div>
            </Modal>

            {/* CONFIRM IMPORT MODAL */}
            <Modal
                isOpen={confirmImport.isOpen}
                onClose={() => setConfirmImport({ isOpen: false, file: null })}
                title="Overwrite Data?"
                actions={
                    <>
                        <button
                            className="secondary-btn"
                            onClick={() => setConfirmImport({ isOpen: false, file: null })}
                        >
                            Cancel
                        </button>
                        <button
                            className="primary-btn"
                            onClick={performImport}
                        >
                            Yes, Overwrite
                        </button>
                    </>
                }
            >
                <div className="import-warning">
                    <p className="import-warning-note">
                        This will delete all current data on this device and replace it with the backup file.
                    </p>
                    <p className="import-warning-danger">
                        This action cannot be undone.
                    </p>
                </div>
            </Modal>

            <div className="profile-spacer"></div>
        </div>
    );
};

export default Profile;
