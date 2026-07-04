import React from 'react';
import { Zap, Lightbulb, Timer, Trophy, Activity, HelpCircle, ArrowRight } from 'lucide-react';
import BackButton from '../components/common/BackButton';
import './HelpView.css';

const HelpView = () => {
    return (
        <div className="page help-page">
            <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
                <BackButton />
                <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Feature Guide</h1>
            </header>

            <div className="help-intro" style={{ marginBottom: '30px', color: 'var(--text-secondary)' }}>
                <p>Learn how to use the intelligent features of Fitness App 2.0 to maximize your training.</p>
            </div>

            {/* SMART LOAD */}
            <section className="help-section">
                <div className="help-card">
                    <div className="help-feature">
                        <div className="help-icon-wrapper" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
                            <Zap size={24} />
                        </div>
                        <div className="help-content">
                            <h3>Smart-Load Integration</h3>
                            <p>
                                No more guessing weights. When you start a workout, the app automatically pre-fills your sets based on your
                                <span className="highlight-green"> Last Completed Session</span>.
                                Look for the "Last: 100kg x 5" indicator to track your progress.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ADAPTIVE COACH */}
            <section className="help-section">
                <div className="help-card">
                    <div className="help-feature">
                        <div className="help-icon-wrapper" style={{ background: 'rgba(76, 141, 255, 0.1)', color: 'var(--accent)' }}>
                            <Lightbulb size={24} />
                        </div>
                        <div className="help-content">
                            <h3>Adaptive Coach</h3>
                            <p>
                                The app analyzes your performance. If you complete all your goal reps, you'll see a
                                <span className="highlight-cyan"> Cyan Coach Tip</span> badge suggesting a progression
                                (+5lbs or +1 rep). Click "Accept" to instantly update your workout.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* DYNAMIC TIMERS */}
            <section className="help-section">
                <div className="help-card">
                    <div className="help-feature">
                        <div className="help-icon-wrapper" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white' }}>
                            <Timer size={24} />
                        </div>
                        <div className="help-content">
                            <h3>Dynamic Timers</h3>
                            <p>
                                The timer adapts to your exercise type:
                            </p>
                            <ul style={{ marginTop: '10px', paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                <li style={{ marginBottom: '5px' }}><span style={{ color: '#4a9eff', fontWeight: 'bold' }}>Blue Timer</span>: Standard Rest Timer for lifting.</li>
                                <li><span className="highlight-cyan">Neon Cyan Timer</span>: Active Work Timer for duration-based exercises like Planks or Yoga.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* PR SYSTEM */}
            <section className="help-section">
                <div className="help-card">
                    <div className="help-feature">
                        <div className="help-icon-wrapper" style={{ background: 'rgba(255, 215, 0, 0.1)', color: '#ffd700' }}>
                            <Trophy size={24} />
                        </div>
                        <div className="help-content">
                            <h3>PR Recognition</h3>
                            <p>
                                Break your limits. When you lift more weight or do more reps than ever before, a
                                <span className="highlight-gold"> Gold "New PR" Badge</span> appears instantly.
                                Review all your achievements in the post-workout Summary.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ANALYTICS */}
            <section className="help-section">
                <div className="help-card">
                    <div className="help-feature">
                        <div className="help-icon-wrapper" style={{ background: 'rgba(255, 100, 100, 0.1)', color: '#ff6b6b' }}>
                            <Activity size={24} />
                        </div>
                        <div className="help-content">
                            <h3>Muscle Balance Analytics</h3>
                            <p>
                                Check the <strong>Analytics</strong> tab to see your "Spider Chart". It connects volume across muscle groups
                                to visualize your training balance and highlight neglected areas.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default HelpView;
