import React, { useState } from 'react';
import { Plus, User } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';
import './ProfileSelector.css';

const ProfileSelector = () => {
    const { profiles, createProfile, switchProfile, deleteProfile } = useWorkout();
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newByName, setNewName] = useState('');
    const [selectedColor, setSelectedColor] = useState('#ff5c2a');

    const handleCreate = () => {
        if (newByName.trim()) {
            try {
                createProfile(newByName, selectedColor);
                setIsCreating(false);
                setNewName('');
            } catch (e) {
                alert("Error calling createProfile: " + e.message);
            }
        }
    };

    const handleDelete = (e, profileId, name) => {
        e.stopPropagation(); // Prevent logging in when clicking delete
        if (window.confirm(`Are you sure you want to delete profile "${name}"? This cannot be undone.`)) {
            deleteProfile(profileId);
            // If checking edit mode with 0 profiles, maybe turn it off?
            // But context update will cause re-render anyway.
        }
    };

    const colors = ['#ff5c2a', '#bd00ff', '#00ff9d', '#ff3366', '#33ccff', '#ff9900'];

    return (
        <div className="page profile-selector-page">
            <header className="profile-header">
                <h1>Who's working out?</h1>
                <p>Select your profile to load your stats</p>
                {profiles.length > 0 && (
                    <button
                        className="text-btn"
                        onClick={() => setIsEditing(!isEditing)}
                        style={{ marginTop: '10px', color: isEditing ? '#ff3366' : '#a0a0a0', fontSize: '0.9rem' }}
                    >
                        {isEditing ? 'Done Managing' : 'Manage Profiles'}
                    </button>
                )}
            </header>

            <div className="profiles-grid">
                {profiles.map(profile => (
                    <button
                        key={profile.id}
                        className={`profile-card ${isEditing ? 'shake-animation' : ''}`}
                        onClick={() => !isEditing && switchProfile(profile.id)}
                        style={{ '--profile-color': profile.color, cursor: isEditing ? 'default' : 'pointer' }}
                    >
                        <div className="profile-avatar">
                            {profile.avatar || <User />}
                            {isEditing && (
                                <div
                                    className="delete-badge"
                                    onClick={(e) => handleDelete(e, profile.id, profile.name)}
                                >
                                    <Plus style={{ transform: 'rotate(45deg)' }} size={16} />
                                </div>
                            )}
                        </div>
                        <span className="profile-name">{profile.name}</span>
                    </button>
                ))}

                <button
                    className="profile-card add-profile-card"
                    onClick={() => setIsCreating(true)}
                >
                    <div className="profile-avatar add-avatar">
                        <Plus />
                    </div>
                    <span className="profile-name">Add Profile</span>
                </button>
            </div>

            {isCreating && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <h2>New Profile</h2>
                        {/* Div instead of Form to prevent reload glitches */}
                        <div className="new-profile-form">
                            <input
                                type="text"
                                placeholder="Enter Name"
                                value={newByName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                autoFocus
                            />

                            <div className="color-picker">
                                {colors.map(color => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`color-swatch ${selectedColor === color ? 'selected' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => setSelectedColor(color)}
                                    />
                                ))}
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setIsCreating(false)}>Cancel</button>
                                <button
                                    type="button"
                                    className="primary-btn"
                                    onClick={handleCreate}
                                    disabled={!newByName.trim()}
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileSelector;
