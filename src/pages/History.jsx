import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Calendar, Dumbbell, Trash2, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkout } from '../context/WorkoutContext';
import WorkoutDetails from '../components/history/WorkoutDetails';
import Modal from '../components/common/Modal';
import BackButton from '../components/common/BackButton';
import './History.css';

const History = () => {
    const navigate = useNavigate(); // Add hook
    const { history, deleteWorkout } = useWorkout();
    const [selectedWorkout, setSelectedWorkout] = useState(null);
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, workoutId: null });

    // Sort history by date (newest first)
    const sortedHistory = [...history].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    const handleDelete = (e, workoutId) => {
        e.stopPropagation();
        setDeleteModal({ isOpen: true, workoutId });
    };

    const confirmDelete = () => {
        if (deleteModal.workoutId) {
            deleteWorkout(deleteModal.workoutId);
            setDeleteModal({ isOpen: false, workoutId: null });
            if (selectedWorkout && selectedWorkout.id === deleteModal.workoutId) {
                setSelectedWorkout(null);
            }
        }
    };

    if (selectedWorkout) {
        return <WorkoutDetails workout={selectedWorkout} onBack={() => setSelectedWorkout(null)} />;
    }

    return (
        <div className="page history-page">
            <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <BackButton />
                <div>
                    <h1 style={{ margin: 0 }}>History</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>{history.length} workouts completed</p>
                </div>
            </header>

            <div className="history-list">
                {sortedHistory.length === 0 ? (
                    <div className="empty-history">
                        <Dumbbell size={48} className="empty-icon" />
                        <h3>No workouts yet</h3>
                        <p>Go to the Track tab to log your first session!</p>
                    </div>
                ) : (
                    sortedHistory.map(workout => (
                        <div
                            key={workout.id}
                            className="history-card"
                            onClick={() => setSelectedWorkout(workout)}
                        >
                            <div className="card-left">
                                <div className="date-badge">
                                    <span className="day">{format(new Date(workout.startTime), 'dd')}</span>
                                    <span className="month">{format(new Date(workout.startTime), 'MMM')}</span>
                                </div>
                                <div className="workout-info">
                                    <h3>{workout.name}</h3>
                                    <span className="exercises-count">
                                        {workout.exercises.length} Exercises
                                    </span>
                                </div>
                            </div>
                            <div className="card-right" style={{ display: 'flex', alignItems: 'center', gap: '20px', paddingLeft: '15px', borderLeft: '1px solid var(--border-color)' }}>
                                <button
                                    className="delete-btn"
                                    onClick={(e) => handleDelete(e, workout.id)}
                                    style={{
                                        background: 'rgba(255, 68, 68, 0.1)',
                                        border: 'none',
                                        color: '#ff4444',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s'
                                    }}
                                    title="Delete Workout"
                                >
                                    <Trash2 size={20} />
                                </button>
                                <ChevronRight className="arrow-icon" />
                            </div>
                        </div>
                    ))
                )}

            </div>

            {/* DELETE CONFIRMATION MODAL */}
            <Modal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, workoutId: null })}
                title="Delete Workout"
            >
                <div className="modal-body-content">
                    <p>Are you sure you want to delete this workout?</p>
                    <p style={{ fontSize: '0.9em', color: '#ff4444', marginTop: '10px' }}>
                        This action cannot be undone.
                    </p>
                </div>
                <div className="modal-footer">
                    <button
                        className="modal-btn-secondary"
                        onClick={() => setDeleteModal({ isOpen: false, workoutId: null })}
                    >
                        Cancel
                    </button>
                    <button
                        className="modal-btn-primary"
                        style={{ backgroundColor: '#ff4444', color: 'white' }}
                        onClick={confirmDelete}
                    >
                        Delete
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default History;
