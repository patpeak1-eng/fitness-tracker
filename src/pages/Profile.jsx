import React, { useState, useRef, useEffect } from 'react';
import { User, Target, Activity, Heart, Database, ChevronLeft, Download, Upload, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import Modal from '../components/common/Modal';
import BackButton from '../components/common/BackButton';
import Card from '../components/common/Card';
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
        exportData, // NEW
        importData  // NEW
    } = useWorkout();

    // Local state for BMI calculation display
    const [bmi, setBmi] = useState(null);
    const [bmiCategory, setBmiCategory] = useState('');

    // Data Management State
    const [dataModal, setDataModal] = useState({ isOpen: false, title: '', message: '' });
    // Import Confirmation State
    const [confirmImport, setConfirmImport] = useState({ isOpen: false, file: null });
    const fileInputRef = useRef(null);

    const handleImportClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Open Confirmation Modal instead of window.confirm
        setConfirmImport({ isOpen: true, file });

        // Reset input immediately so same file can be selected again if cancelled
        e.target.value = null;
    };

    const performImport = async () => {
        if (!confirmImport.file) return;

        try {
            await importData(confirmImport.file);
            // Page reloads on success logic is inside importData if successful
        } catch (error) {
            setDataModal({
                isOpen: true,
                title: 'Import Failed',
                message: error.message
            });
        }
        setConfirmImport({ isOpen: false, file: null });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setUserStats(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // When weight input loses focus, add entry if different from last entry
    const handleWeightBlur = () => {
        const newWeight = parseFloat(userStats.currentWeight);
        if (isNaN(newWeight) || newWeight <= 0) return;

        // Check last entry to avoid duplicates (optional, but good UX)
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
                // kg / m^2 (Height is usually in cm, so convert to m)
                calculatedBmi = weight / ((height / 100) * (height / 100));
            } else {
                // (lb / in^2) * 703
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

    // Format Data for Chart
    const weightGraphData = weightHistory.map(entry => ({
        name: format(new Date(entry.date), 'MMM d'),
        weight: entry.weight
    }));

    return (
        <div className="page profile-page">
            <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '20px' }}>
                <BackButton />
                <button
                    onClick={() => navigate('/help')}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
                    title="Help Guide"
                >
                    <HelpCircle size={24} />
                </button>
            </header>

            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '2rem' }}>My Profile</h1>
                <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)' }}>Track your progress</p>
            </div>



            <section className="profile-section">
                <h2><User size={20} /> Personal Information</h2>
                <Card className="form-card">
                    <div className="form-group">
                        <label>Age</label>
                        <input
                            type="number"
                            name="age"
                            value={userStats.age}
                            onChange={handleChange}
                            placeholder="Years"
                        />
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
                </Card>
            </section>

            <section className="profile-section">
                <h2><Activity size={20} /> Measurements & BMI</h2>
                <div className="stats-highlight-grid">
                    <div className={`metric-card ${bmi ? 'active' : ''}`}>
                        <span className="metric-label">BMI</span>
                        <span className="metric-value">{bmi || '--'}</span>
                        <span className="metric-status">{bmiCategory}</span>
                    </div>
                </div>

                <Card className="form-card">
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Current Weight ({unitLabels.weight})</label>
                            <input
                                type="number"
                                name="currentWeight"
                                value={userStats.currentWeight}
                                onChange={handleChange}
                                onBlur={handleWeightBlur} // Save on blur
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
                </Card>
            </section>

            {/* Weight Progress Chart */}
            {weightGraphData.length > 1 && (
                <section className="profile-section">
                    <h2><Activity size={20} /> Weight Progress</h2>
                    <div className="chart-card glass-panel" style={{ padding: '15px' }}>
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
                <h2><Target size={20} /> Fitness Goals</h2>
                <Card className="form-card">
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
                </Card>
            </section>

            <section className="profile-section">
                <h2 className="optional-header"><Heart size={20} /> Advanced (Optional)</h2>
                <Card className="form-card">
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
                </Card>
            </section>



            {/* DATA MANAGEMENT */}
            <section className="profile-section">
                <h2><Download size={20} /> Manual Backup</h2>
                <Card className="form-card" style={{ padding: '20px' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
                        Backup your data to transfer between devices.
                    </p>
                    <div className="form-row-2">
                        <button
                            className="secondary-btn"
                            onClick={exportData}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <Download size={18} /> Export Backup
                        </button>
                        <button
                            className="secondary-btn"
                            onClick={handleImportClick}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                        >
                            <Upload size={18} /> Import Backup
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            accept=".json"
                        />
                    </div>
                </Card>
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
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                        This will delete all current data on this device and replace it with the backup file.
                    </p>
                    <p style={{ fontWeight: 'bold', color: 'var(--danger)' }}>
                        This action cannot be undone.
                    </p>
                </div>
            </Modal>

            <div className="profile-spacer"></div>
        </div>
    );
};

export default Profile;
