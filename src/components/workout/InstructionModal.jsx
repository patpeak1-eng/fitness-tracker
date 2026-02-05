import React from 'react';
import ReactDOM from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import './InstructionModal.css';

const InstructionModal = ({ exercise, isOpen, onClose }) => {
    if (!exercise || !isOpen) return null;

    return ReactDOM.createPortal(
        <div className="instruction-modal-overlay" onClick={onClose}>
            <div className="instruction-modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-btn-float" onClick={onClose}>
                    <X size={24} />
                </button>

                <div className="instruction-image-container">
                    {exercise.imageUrl ? (
                        <img src={exercise.imageUrl} alt={exercise.name} className="instruction-image" />
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

                    {exercise.imageUrl && (
                        <a href={exercise.imageUrl} target="_blank" rel="noopener noreferrer" className="external-link">
                            View Source <ExternalLink size={14} />
                        </a>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default InstructionModal;
