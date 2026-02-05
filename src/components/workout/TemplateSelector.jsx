import React from 'react';
import { Play, X, Layers, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import { useWorkout } from '../../context/WorkoutContext';
import './TemplateSelector.css';

const TemplateSelector = ({ templates, onSelect, onClose }) => {
    const { deleteTemplate } = useWorkout();
    const [deleteModal, setDeleteModal] = React.useState({ isOpen: false, templateId: null });

    const handleDeleteClick = (e, templateId) => {
        e.stopPropagation();
        setDeleteModal({ isOpen: true, templateId });
    };

    const confirmDelete = () => {
        if (deleteModal.templateId) {
            deleteTemplate(deleteModal.templateId);
            setDeleteModal({ isOpen: false, templateId: null });
        }
    };

    return (
        <div className="template-selector-overlay">
            <div className="template-selector-content">
                <header className="selector-header">
                    <h2>Select Template</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </header>

                <div className="template-list">
                    {templates.map((template) => (
                        <div
                            key={template.id}
                            className="template-card"
                            onClick={() => onSelect(template.id)}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="template-info">
                                <h3>{template.name}</h3>
                                <p>{template.exercises.length} Exercises</p>
                            </div>
                            <div className="template-actions">
                                {template.isCustom && (
                                    <button
                                        className="delete-tpl-btn"
                                        onClick={(e) => handleDeleteClick(e, template.id)}
                                        title="Delete Template"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <Modal
                    isOpen={deleteModal.isOpen}
                    onClose={() => setDeleteModal({ isOpen: false, templateId: null })}
                    title="Delete Template"
                    showCloseButton={false}
                >
                    <div style={{ padding: '0 0 20px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <p>Are you sure you want to delete this workout template?</p>
                        <p style={{ fontSize: '0.9rem' }}>This action cannot be undone.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            className="secondary-btn"
                            onClick={() => setDeleteModal({ isOpen: false, templateId: null })}
                            style={{ flex: 1, padding: '12px' }}
                        >
                            Cancel
                        </button>
                        <button
                            className="primary-btn"
                            onClick={confirmDelete}
                            style={{ flex: 1, padding: '12px', background: 'var(--error)', color: 'white' }}
                        >
                            Delete
                        </button>
                    </div>
                </Modal>
            </div>
        </div>
    );
};

export default TemplateSelector;
