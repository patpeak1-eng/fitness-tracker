import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import './InstructionModal.css';

const InstructionModal = ({ exercise, isOpen, onClose }) => {
    // Built-in exercises use `illustration`; `imageUrl` remains a compatibility
    // fallback for older or custom exercise records.
    const visualSource = exercise?.illustration || exercise?.imageUrl;
    const [visualError, setVisualError] = useState(false);

    useEffect(() => {
        setVisualError(false);
    }, [visualSource]);

    if (!exercise || !isOpen) return null;

    return ReactDOM.createPortal(
        <div className="instruction-modal-overlay" onClick={onClose}>
            <div className="instruction-modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-btn-float" onClick={onClose}>
                    <X size={24} />
                </button>

                <div className="instruction-image-container">
                    {visualSource && !visualError ? (
                        <img
                            src={visualSource}
                            alt={`${exercise.name} exercise demonstration`}
                            className="instruction-image"
                            onError={() => setVisualError(true)}
                        />
                    ) : (
                        <div className="placeholder-image">
                            <span>No Visual Available</span>
                        </div>
                    )}
                </div>

                <div className="instruction-body">
                    <h2>{exercise.name}</h2>
                    {/* Badges removed per user request */}

                    <div className="instruction-text">
                        <h3>How to Perform</h3>
                        <p>{exercise.instructions || 'No detailed instructions available for this exercise yet.'}</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default InstructionModal;
