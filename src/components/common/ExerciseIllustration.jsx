import React, { useEffect, useState } from 'react';

const SIZE_STYLES = {
    thumbnail: {
        width: '120px',
        height: '60px',
        objectFit: 'cover',
        borderRadius: '10px'
    },
    full: {
        width: '100%',
        maxWidth: '600px',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: '14px',
        margin: '0 auto'
    },
    rest: {
        width: '100%',
        maxWidth: '400px',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: '14px',
        margin: '0 auto',
        opacity: 0.85
    }
};

const WRAPPER_STYLES = {
    thumbnail: {
        width: '120px',
        height: '60px',
        marginTop: '8px'
    },
    full: {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        margin: '16px 0'
    },
    rest: {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        margin: '16px 0'
    }
};

const ExerciseIllustration = ({ exerciseId, illustration, size = 'thumbnail' }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [illustration]);

    if (!illustration || hasError) return null;

    const normalizedSize = SIZE_STYLES[size] ? size : 'thumbnail';

    return (
        <div style={WRAPPER_STYLES[normalizedSize]}>
            <img
                src={illustration}
                alt={exerciseId ? `${exerciseId} exercise illustration` : 'Exercise illustration'}
                loading="lazy"
                style={{
                    display: 'block',
                    ...SIZE_STYLES[normalizedSize]
                }}
                onError={() => setHasError(true)}
            />
        </div>
    );
};

export default ExerciseIllustration;
