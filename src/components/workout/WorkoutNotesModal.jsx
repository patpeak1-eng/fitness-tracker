import React from 'react';
import Modal from '../common/Modal';
import { useWorkout } from '../../context/WorkoutContext';
import './WorkoutNotesModal.css';

const WorkoutNotesModal = ({ isOpen, onClose }) => {
    const { activeWorkout, updateWorkoutNotes } = useWorkout();

    if (!activeWorkout) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Workout Session Notes"
            showCloseButton={false}
        >
            <div className="workout-notes-container">
                <p style={{ color: 'var(--text-muted)', marginBottom: '12px', fontSize: '0.9rem' }}>
                    Capture thoughts, pain points, or PRs.
                </p>
                <textarea
                    className="notes-textarea"
                    placeholder="Type your notes here..."
                    value={activeWorkout.notes || ''}
                    onChange={(e) => updateWorkoutNotes(e.target.value)}
                    rows={5}
                />

                <button
                    className="save-note-btn"
                    onClick={onClose}
                >
                    Save Note
                </button>
            </div>
        </Modal>
    );
};

export default WorkoutNotesModal;
