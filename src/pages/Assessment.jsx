import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity, ChevronLeft, Target, Scale, Dumbbell,
    CheckCircle, Play, Info, Briefcase
} from 'lucide-react';
import Card from '../components/common/Card';
import BackButton from '../components/common/BackButton';
import { useWorkout } from '../context/WorkoutContext';
import { getRecommendation } from '../utils/recommendationEngine';
import './Assessment.css';

const Assessment = () => {
    const navigate = useNavigate();
    const { saveAssessment, importProgram, startWorkoutFromTemplate, userStats, setUserStats } = useWorkout();

    // Steps: 0=Intro, 1=Stats, 2=Goal, 3=Experience, 4=Equipment, 5=Result
    const [step, setStep] = useState(0);

    const [formData, setFormData] = useState({
        // Stats
        height: '',
        weight: userStats?.currentWeight || '',

        // Survey
        goal: 'strength', // 'strength', 'weight_loss', 'toned', 'flexibility'
        experience: 'beginner', // 'beginner', 'intermediate', 'advanced'
        equipment: 'gym', // 'gym', 'bodyweight', 'yoga_mat'
    });

    const [recommendedProgram, setRecommendedProgram] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Sync from profile
    useEffect(() => {
        if (userStats) {
            setFormData(prev => ({
                ...prev,
                weight: prev.weight || userStats.currentWeight || ''
            }));
        }
    }, [userStats]);

    // Helpers
    const handleSelect = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleNext = () => setStep(prev => prev + 1);
    const handleBack = () => setStep(prev => prev - 1);

    const handleCalculate = () => {
        // Save stats to profile
        setUserStats(prev => ({
            ...prev,
            currentWeight: formData.weight,
            height: formData.height
        }));

        saveAssessment({
            ...formData,
            date: new Date().toISOString(),
            type: 'Onboarding Survey'
        });

        // Get Rec
        const rec = getRecommendation(formData);
        setRecommendedProgram(rec);
        setStep(5);
    };

    const handleConfirm = () => {
        if (!recommendedProgram) return;
        setIsSaving(true);

        // 1. Import templates
        importProgram(recommendedProgram);

        // 2. Start the first workout immediatey
        const firstTemplate = recommendedProgram.templates[0];
        if (firstTemplate) {
            startWorkoutFromTemplate(firstTemplate);
        }

        // 3. Navigate after delay
        setTimeout(() => {
            navigate('/'); // Go to Dashboard to see active workout
        }, 800);
    };

    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <div className="wizard-step intro">
                        <div className="intro-icon"><Activity size={48} color="var(--primary)" /></div>
                        <h2>Let's Get Started</h2>
                        <p>We'll create a custom plan for you based on your goals, experience, and equipment.</p>
                        <button className="primary-btn full-width" onClick={handleNext}>Begin Assessment</button>
                    </div>
                );
            case 1: // STATS
                return (
                    <div className="wizard-step">
                        <div className="step-header-wrapper">
                            <button onClick={handleBack} className="icon-btn"><ChevronLeft size={24} /></button>
                            <h3>Step 1: Current Stats</h3>
                        </div>
                        <Card className="form-card">
                            <div className="form-group">
                                <label>Height (e.g. 5'10" or 178cm)</label>
                                <input name="height" value={formData.height} onChange={handleChange} placeholder="Height" />
                            </div>
                            <div className="form-group">
                                <label>Weight (lbs/kg)</label>
                                <input type="number" name="weight" value={formData.weight} onChange={handleChange} placeholder="Weight" />
                            </div>
                        </Card>
                        <button className="primary-btn full-width" onClick={handleNext}>Next: Goals</button>
                    </div>
                );
            case 2: // GOAL
                return (
                    <div className="wizard-step">
                        <div className="step-header-wrapper">
                            <button onClick={handleBack} className="icon-btn"><ChevronLeft size={24} /></button>
                            <h3>Step 2: Primary Goal</h3>
                        </div>
                        <div className="selection-list">
                            {[
                                { id: 'strength', label: 'Build Strength', desc: 'Max strength & power' },
                                { id: 'weight_loss', label: 'Lose Weight', desc: 'Burn fat & get lean' },
                                { id: 'toned', label: 'Get Toned', desc: 'Definition & endurance' },
                                { id: 'flexibility', label: 'Flexibility & Recovery', desc: 'Mobility & health' }
                            ].map(opt => (
                                <div
                                    key={opt.id}
                                    className={`select-card ${formData.goal === opt.id ? 'selected' : ''}`}
                                    onClick={() => handleSelect('goal', opt.id)}
                                >
                                    <div className="check-indicator"><CheckCircle size={20} /></div>
                                    <h4>{opt.label}</h4>
                                    <p>{opt.desc}</p>
                                </div>
                            ))}
                        </div>
                        <button className="primary-btn full-width" onClick={handleNext}>Next: Experience</button>
                    </div>
                );
            case 3: // EXPERIENCE
                return (
                    <div className="wizard-step">
                        <div className="step-header-wrapper">
                            <button onClick={handleBack} className="icon-btn"><ChevronLeft size={24} /></button>
                            <h3>Step 3: Experience</h3>
                        </div>
                        <div className="selection-list">
                            {[
                                { id: 'beginner', label: 'Beginner', desc: '0-6 months' },
                                { id: 'intermediate', label: 'Intermediate', desc: '6-24 months' },
                                { id: 'advanced', label: 'Advanced', desc: '2+ years' }
                            ].map(opt => (
                                <div
                                    key={opt.id}
                                    className={`select-card ${formData.experience === opt.id ? 'selected' : ''}`}
                                    onClick={() => handleSelect('experience', opt.id)}
                                >
                                    <div className="check-indicator"><CheckCircle size={20} /></div>
                                    <h4>{opt.label}</h4>
                                    <p>{opt.desc}</p>
                                </div>
                            ))}
                        </div>
                        <button className="primary-btn full-width" onClick={handleNext}>Next: Equipment</button>
                    </div>
                );
            case 4: // EQUIPMENT
                return (
                    <div className="wizard-step">
                        <div className="step-header-wrapper">
                            <button onClick={handleBack} className="icon-btn"><ChevronLeft size={24} /></button>
                            <h3>Step 4: Equipment</h3>
                        </div>
                        <div className="selection-list">
                            {[
                                { id: 'gym', label: 'Full Gym', desc: 'Barbells, machines, cables' },
                                { id: 'bodyweight', label: 'Bodyweight Only', desc: 'No equipment needed' },
                                { id: 'yoga_mat', label: 'Yoga Mat Only', desc: 'Light equipment / Mat' }
                            ].map(opt => (
                                <div
                                    key={opt.id}
                                    className={`select-card ${formData.equipment === opt.id ? 'selected' : ''}`}
                                    onClick={() => handleSelect('equipment', opt.id)}
                                >
                                    <div className="check-indicator"><CheckCircle size={20} /></div>
                                    <h4>{opt.label}</h4>
                                    <p>{opt.desc}</p>
                                </div>
                            ))}
                        </div>
                        <button className="primary-btn full-width" onClick={handleCalculate}>Get My Plan</button>
                    </div>
                );
            case 5: // RESULT
                const exercises = recommendedProgram?.templates[0]?.exercises || [];
                return (
                    <div className="wizard-step success-view">
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <CheckCircle size={50} color="var(--primary)" />
                            <h2>We found your match!</h2>
                        </div>

                        {recommendedProgram && (
                            <div className="program-card">
                                <span className="tag">Recommended Program</span>
                                <h1>{recommendedProgram.name}</h1>
                                <p className="desc">{recommendedProgram.description}</p>

                                <div className="core-exercises">
                                    <h4>Included Exercises:</h4>
                                    <ul>
                                        {exercises.map((ex, i) => (
                                            <li key={i}>{ex.name || 'Exercise'}</li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    className="primary-btn full-width"
                                    onClick={handleConfirm}
                                    disabled={isSaving}
                                    style={{
                                        backgroundColor: isSaving ? 'var(--success)' : 'var(--primary)',
                                        color: isSaving ? '#fff' : '#000'
                                    }}
                                >
                                    {isSaving ? 'Starting Workout...' : 'Confirm & Start Workout'}
                                </button>
                            </div>
                        )}
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="page assessment-page">
            <header className="page-header center-header">
                <div className="header-content">
                    {step > 0 && <span className="step-indicator">Step {step}/4</span>}
                </div>
            </header>
            <div className="wizard-container">
                {renderStep()}
            </div>
        </div>
    );
};

export default Assessment;
