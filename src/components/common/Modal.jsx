import React, { useEffect } from 'react';
import './Modal.css';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, actions, showCloseButton = true }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    {showCloseButton && (
                        <button className="modal-close-btn" onClick={onClose}>
                            <X size={20} />
                        </button>
                    )}
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {actions && (
                    <div className="modal-footer">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
