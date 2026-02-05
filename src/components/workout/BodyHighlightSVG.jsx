import React from 'react';

const BodyHighlightSVG = ({ muscleGroup, style }) => {
    // Normalization
    const target = (muscleGroup || '').toLowerCase();

    // Color Logic
    const highlightColor = 'var(--primary)'; // e.g., Neon Green
    const baseColor = 'rgba(255, 255, 255, 0.1)';
    const outlineColor = 'rgba(255, 255, 255, 0.3)';

    // Check matches
    const isChest = target.includes('chest') || target.includes('pec');
    const isBack = target.includes('back') || target.includes('lat') || target.includes('trap');
    const isShoulders = target.includes('shoulder') || target.includes('delt');
    const isArms = target.includes('arm') || target.includes('bicep') || target.includes('tricep');
    const isCore = target.includes('core') || target.includes('ab') || target.includes('abs');
    const isLegs = target.includes('leg') || target.includes('quad') || target.includes('hamstring') || target.includes('calf') || target.includes('glute');

    // Simple Paths (Abstract Geometric Man)
    // ViewBox 0 0 100 200

    return (
        <svg viewBox="0 0 100 200" style={{ width: '100%', height: '100%', ...style }} preserveAspectRatio="xMidYMid meet">
            <g stroke={outlineColor} strokeWidth="2" fill="none">
                {/* Head */}
                <circle cx="50" cy="20" r="10" fill={baseColor} />

                {/* Shoulders / Delts */}
                <path
                    d="M 30,35 Q 50,35 70,35 L 75,45 L 25,45 Z"
                    fill={isShoulders ? highlightColor : baseColor}
                    stroke={isShoulders ? highlightColor : outlineColor}
                />

                {/* Chest */}
                <path
                    d="M 32,45 L 68,45 L 65,65 L 35,65 Z"
                    fill={isChest ? highlightColor : baseColor}
                    stroke={isChest ? highlightColor : outlineColor}
                />

                {/* Back (Displayed as Upper Torso overlap or distinct if we had rear view. For now, map to Chest area visually or add Back specifics if needed. 
                   Let's use the same Upper Torso block for Back but maybe darker/different? 
                   Actually, let's just highlight the generic torso for Back if simple. 
                   Or lets add 'Lats' wings. 
                */}
                {isBack && (
                    <path
                        d="M 25,45 Q 20,60 35,65 L 65,65 Q 80,60 75,45"
                        fill={highlightColor}
                        opacity="0.5" // Wing effect for Lats
                        stroke="none"
                    />
                )}

                {/* Arms (Left & Right) */}
                <rect x="15" y="45" width="10" height="40" rx="3"
                    fill={isArms ? highlightColor : baseColor}
                    stroke={isArms ? highlightColor : outlineColor}
                />
                <rect x="75" y="45" width="10" height="40" rx="3"
                    fill={isArms ? highlightColor : baseColor}
                    stroke={isArms ? highlightColor : outlineColor}
                />

                {/* Core / Abs */}
                <path
                    d="M 35,65 L 65,65 L 60,95 L 40,95 Z"
                    fill={isCore ? highlightColor : baseColor}
                    stroke={isCore ? highlightColor : outlineColor}
                />

                {/* Legs (Quads/Hips) */}
                <path
                    d="M 30,95 L 70,95 L 75,105 L 80,160 L 55,160 L 50,110 L 45,160 L 20,160 L 25,105 Z"
                    fill={isLegs ? highlightColor : baseColor}
                    stroke={isLegs ? highlightColor : outlineColor}
                />
            </g>
        </svg>
    );
};

export default BodyHighlightSVG;
