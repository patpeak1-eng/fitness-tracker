import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const BackButton = ({ to = '/', label = 'Dashboard', onClick, style = {} }) => {
    const navigate = useNavigate();
    const handleClick = onClick || (() => navigate(to));

    return (
        <button
            onClick={handleClick}
            style={{
                background: 'rgba(191, 255, 0, 0.1)',
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
                cursor: 'pointer',
                padding: '8px 16px',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.9rem',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                zIndex: 10,
                ...style
            }}
        >
            <ChevronLeft size={20} />
            <span>{label}</span>
        </button>
    );
};

export default BackButton;
