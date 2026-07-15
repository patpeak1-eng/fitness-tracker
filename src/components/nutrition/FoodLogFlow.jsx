import React, { useState } from 'react';
import { PenLine, ScanLine } from 'lucide-react';
import { useWorkout } from '../../context/WorkoutContext';
import EntryForm from './EntryForm';
import BarcodeEntry from './BarcodeEntry';
import './nutrition.css';

// Entry-path container. Every path funnels into the same addFoodLogEntry
// call — the save logic is never forked per entry type.
// Session 3 note: the photo/label AI path (PhotoEntry) mounts here as a
// third tab; the container and save funnel don't change for it.
const PATHS = [
    { key: 'manual', label: 'Manual', Icon: PenLine },
    { key: 'barcode', label: 'Barcode', Icon: ScanLine }
];

const FoodLogFlow = ({ onDone, onCancel }) => {
    const { addFoodLogEntry } = useWorkout();
    const [path, setPath] = useState('manual');

    const save = async (draft) => {
        await addFoodLogEntry(draft);
        if (onDone) onDone();
    };

    return (
        <div className="food-log-flow">
            <div className="entry-path-tabs" role="tablist" aria-label="Entry method">
                {PATHS.map(({ key, label, Icon }) => (
                    <button
                        key={key}
                        role="tab"
                        aria-selected={path === key}
                        className={`entry-path-tab ${path === key ? 'active' : ''}`}
                        onClick={() => setPath(key)}
                    >
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            {path === 'manual' && (
                <EntryForm initial={{ source: 'manual' }} onSave={save} onCancel={onCancel} />
            )}
            {path === 'barcode' && (
                <BarcodeEntry onSave={save} onCancel={onCancel} />
            )}
        </div>
    );
};

export default FoodLogFlow;
