import React, { useState, useEffect } from 'react';
import { useWorkout } from '../../context/WorkoutContext';
import './PlateCalculator.css';

// Plate denominations + common barbell options per unit system.
// Plates are listed largest -> smallest so the greedy fill works in order.
const PLATE_CONFIG = {
    imperial: {
        unit: 'lbs',
        defaultBar: 45,
        bars: [45, 35, 25, 15],
        plates: [45, 35, 25, 10, 5, 2.5],
    },
    metric: {
        unit: 'kg',
        defaultBar: 20,
        bars: [20, 15, 10, 7],
        plates: [20, 15, 10, 5, 2.5, 1.25],
    },
};

// Existing CSS height classes (largest -> smallest). The plate denominations
// map onto these by rank so heights stay graded for both unit systems.
const PLATE_SIZE_CLASSES = ['plate-45', 'plate-35', 'plate-25', 'plate-10', 'plate-5', 'plate-2'];

// Float tolerance so 2.5 / 1.25 increments don't suffer rounding drift.
const EPSILON = 0.001;

const PlateCalculator = () => {
    const { units } = useWorkout();
    const system = units === 'imperial' ? 'imperial' : 'metric';
    const config = PLATE_CONFIG[system];

    const [targetWeight, setTargetWeight] = useState('');
    const [barWeight, setBarWeight] = useState(config.defaultBar);

    // Keep the barbell selection valid when the unit system changes underneath us.
    useEffect(() => {
        setBarWeight(PLATE_CONFIG[system].defaultBar);
    }, [system]);

    const target = parseFloat(targetWeight);
    const hasTarget = targetWeight !== '' && !isNaN(target);
    const weightPerSide = hasTarget ? (target - barWeight) / 2 : 0;

    // Greedy breakdown: subtract the largest plate that fits, repeat down the list.
    const breakdown = [];
    let remaining = weightPerSide > 0 ? weightPerSide : 0;
    config.plates.forEach((plate, rank) => {
        const count = Math.floor((remaining + EPSILON) / plate);
        if (count > 0) {
            breakdown.push({ plate, count, rank, sizeClass: PLATE_SIZE_CLASSES[rank] || 'plate-1' });
            remaining -= count * plate;
        }
    });
    const leftover = Math.round(remaining * 100) / 100;
    const perSideDisplay = Math.round(Math.max(0, weightPerSide) * 100) / 100;
    const smallestPlate = config.plates[config.plates.length - 1];

    // Largest plates = full --primary, smaller plates fade toward transparent.
    const colorForRank = (rank) => {
        const pct = Math.round(100 - (rank / config.plates.length) * 60); // 100% -> ~50%
        return `color-mix(in srgb, var(--primary) ${pct}%, transparent)`;
    };

    // Expand each plate group into individual plates for the bar visual.
    const platesOnBar = breakdown.flatMap((b) =>
        Array.from({ length: b.count }, (_, i) => ({ ...b, key: `${b.plate}-${i}` }))
    );

    let message = null;
    if (!hasTarget) {
        message = 'Enter a target weight to see the plate breakdown.';
    } else if (weightPerSide < 0) {
        message = `Target is below the bar weight (${barWeight} ${config.unit}).`;
    } else if (breakdown.length === 0) {
        message = weightPerSide < EPSILON
            ? 'Just the bar — no plates needed.'
            : `Less than one ${smallestPlate} ${config.unit} plate per side.`;
    } else if (leftover > 0) {
        message = `+${leftover} ${config.unit} per side can't be loaded with standard plates.`;
    }

    const fieldStyle = {
        padding: '10px 12px',
        fontSize: '1.1rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        background: 'rgba(255, 255, 255, 0.05)',
        color: 'var(--text-primary)',
        width: '100%',
    };
    const labelStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flex: 1,
        minWidth: '130px',
    };
    const captionStyle = {
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    };

    return (
        <div className="plate-calculator">
            {/* Inputs */}
            <div style={{ display: 'flex', gap: '15px', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
                <label style={labelStyle}>
                    <span style={captionStyle}>Target Weight</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={smallestPlate * 2}
                        value={targetWeight}
                        onChange={(e) => setTargetWeight(e.target.value)}
                        placeholder={`Total in ${config.unit}`}
                        style={fieldStyle}
                    />
                </label>
                <label style={labelStyle}>
                    <span style={captionStyle}>Barbell</span>
                    <select
                        value={barWeight}
                        onChange={(e) => setBarWeight(Number(e.target.value))}
                        style={fieldStyle}
                    >
                        {config.bars.map((b) => (
                            <option key={b} value={b}>{b} {config.unit}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Per-side summary */}
            <div className="calc-header">
                <span className="label">Per Side</span>
                <span className="value">{perSideDisplay} {config.unit}</span>
            </div>

            {/* Bar visual */}
            <div className="bar-visual">
                <div className="bar-end" />
                <div className="bar-shaft">
                    {platesOnBar.map((p) => (
                        <div
                            key={p.key}
                            className={`plate ${p.sizeClass}`}
                            style={{ background: colorForRank(p.rank) }}
                            title={`${p.plate} ${config.unit}`}
                        >
                            {p.plate}
                        </div>
                    ))}
                </div>
            </div>

            {/* Count per plate size */}
            {breakdown.length > 0 && (
                <div className="plates-list">
                    {breakdown.map((b) => (
                        <span
                            key={b.plate}
                            className="plate-tag"
                            style={{
                                background: colorForRank(b.rank),
                                borderColor: 'transparent',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {b.count} × {b.plate} {config.unit}
                        </span>
                    ))}
                </div>
            )}

            {/* Status / edge-case messaging */}
            {message && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                    {message}
                </p>
            )}
        </div>
    );
};

export default PlateCalculator;
