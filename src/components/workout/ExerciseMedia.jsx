import React, { useState, useEffect } from 'react';
import BodyHighlightSVG from './BodyHighlightSVG';
import { ImageOff } from 'lucide-react';

const ExerciseMedia = ({ exercise }) => {
    const [imgError, setImgError] = useState(false);
    const [imgSrc, setImgSrc] = useState(null);

    useEffect(() => {
        // Reset state when exercise changes
        setImgError(false);
        // Try JPG by default. If we needed multiple formats, we'd need a more complex checker 
        // or just let onError handle it (but onError usually just fails).
        // Let's assume standard is .jpg for now given the prompt.
        setImgSrc(`/assets/exercises/${exercise.id}.jpg`);
    }, [exercise.id]);

    const handleError = () => {
        setImgError(true);
    };

    if (!exercise) return null;

    return (
        <div className="exercise-media-container" style={{
            width: '100%',
            height: '250px',
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '20px',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-glass)',
            position: 'relative',
            backdropFilter: 'blur(10px)'
        }}>
            {!imgError ? (
                <img
                    src={imgSrc}
                    alt={exercise.name}
                    onError={handleError}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                />
            ) : (
                <div className="media-fallback" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    padding: '20px'
                }}>
                    <div style={{ width: '120px', height: '180px', opacity: 0.8 }}>
                        <BodyHighlightSVG muscleGroup={exercise.primary_muscle || exercise.muscleGroup} />
                    </div>
                </div>
            )}

            {/* Overlay Label (Optional, styling enhancement) */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.6)',
                padding: '4px 8px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                backdropFilter: 'blur(4px)'
            }}>
                {imgError ? 'Visualizing Muscle Focus' : 'Demonstration'}
            </div>
        </div>
    );
};

export default ExerciseMedia;
