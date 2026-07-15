import React, { useState } from 'react';
import { Check } from 'lucide-react';
import './nutrition.css';

// Local "YYYY-MM-DDTHH:mm" <-> ISO helpers for the datetime-local input.
const toLocalInput = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Shared final step for EVERY entry path (manual, barcode, photo, label):
// a fully editable form that is the ONLY place a save can happen. AI paths
// pre-fill it and mark values "Estimated" — nothing persists until the user
// explicitly taps Save (spec Section 10, non-negotiable).
const EntryForm = ({
    initial = {},
    estimated = false,     // AI-derived values → show the Estimated badge
    confidence = null,     // "low" | "medium" | "high" (AI paths only)
    saveLabel = 'Save entry',
    onSave,
    onCancel
}) => {
    const [description, setDescription] = useState(initial.description || '');
    const [calories, setCalories] = useState(
        initial.calories === 0 || initial.calories ? String(initial.calories) : ''
    );
    const [proteinG, setProteinG] = useState(initial.protein_g ?? '');
    const [carbsG, setCarbsG] = useState(initial.carbs_g ?? '');
    const [fatG, setFatG] = useState(initial.fat_g ?? '');
    const [loggedAtLocal, setLoggedAtLocal] = useState(toLocalInput(initial.logged_at));
    const [saving, setSaving] = useState(false);

    const caloriesNum = Number(calories);
    const canSave = description.trim().length > 0 &&
        calories !== '' && Number.isFinite(caloriesNum) && caloriesNum >= 0;

    const numOrNull = (v) => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const handleSave = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            await onSave({
                description: description.trim(),
                calories: Math.round(caloriesNum),
                protein_g: numOrNull(proteinG),
                carbs_g: numOrNull(carbsG),
                fat_g: numOrNull(fatG),
                logged_at: new Date(loggedAtLocal).toISOString(),
                source: initial.source || 'manual',
                confidence: estimated ? confidence : null,
                barcode: initial.barcode || null,
                items: initial.items || null
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="nutrition-entry-form">
            {estimated && (
                <div className="estimated-banner">
                    <span className="estimated-badge">Estimated</span>
                    <span className="estimated-copy">
                        AI estimate{confidence ? ` — ${confidence} confidence` : ''}.
                        Check and correct any value before saving.
                    </span>
                </div>
            )}

            <div className="form-group">
                <label>Description</label>
                <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Chicken salad, large"
                    maxLength={200}
                />
            </div>

            <div className="form-group">
                <label>Calories{estimated ? ' (estimated)' : ''}</label>
                <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={calories}
                    onChange={e => setCalories(e.target.value)}
                    placeholder="kcal"
                />
            </div>

            <div className="form-row-3">
                <div className="form-group">
                    <label>Protein g</label>
                    <input type="number" inputMode="decimal" min="0" value={proteinG}
                        onChange={e => setProteinG(e.target.value)} placeholder="—" />
                </div>
                <div className="form-group">
                    <label>Carbs g</label>
                    <input type="number" inputMode="decimal" min="0" value={carbsG}
                        onChange={e => setCarbsG(e.target.value)} placeholder="—" />
                </div>
                <div className="form-group">
                    <label>Fat g</label>
                    <input type="number" inputMode="decimal" min="0" value={fatG}
                        onChange={e => setFatG(e.target.value)} placeholder="—" />
                </div>
            </div>

            <div className="form-group">
                <label>When</label>
                <input
                    type="datetime-local"
                    value={loggedAtLocal}
                    onChange={e => setLoggedAtLocal(e.target.value)}
                />
            </div>

            <div className="entry-form-actions">
                {onCancel && (
                    <button className="entry-cancel-btn" onClick={onCancel}>Cancel</button>
                )}
                <button
                    className="entry-save-btn"
                    disabled={!canSave || saving}
                    onClick={handleSave}
                >
                    <Check size={16} /> {saving ? 'Saving…' : saveLabel}
                </button>
            </div>
        </div>
    );
};

export default EntryForm;
