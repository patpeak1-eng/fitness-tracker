import React, { useRef, useState } from 'react';
import { Camera, CircleAlert, LoaderCircle, PenLine, RefreshCw } from 'lucide-react';
import * as ApiService from '../../services/ApiService';
import EntryForm from './EntryForm';
import './nutrition.css';

// Client-side downscale BEFORE upload: the backend's ~5 MB cap is a safety
// net, not a budget. Re-encoding to JPEG also normalizes media_type.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

const downscaleToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        try {
            const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
            resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]);
        } catch (err) {
            reject(err);
        }
    };
    img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Could not read the image.'));
    };
    img.src = URL.createObjectURL(file);
});

// One entry point for BOTH meal photos and nutrition labels — the backend
// classifies the image (source: "photo" | "label") in a single call; there
// are deliberately not two UI flows for this.
// Review-before-save is structural: the analyze result only ever pre-fills
// the shared EntryForm (marked Estimated), and nothing persists until the
// user taps Save there.
const PhotoEntry = ({ onSave, onCancel }) => {
    const [phase, setPhase] = useState('pick'); // pick | analyzing | review | error | manual
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const fileRef = useRef(null);

    const analyze = async (file) => {
        if (!file) return;
        setPhase('analyzing');
        setError(null);
        try {
            const image = await downscaleToBase64(file);
            const res = await ApiService.analyzeFood({ image, media_type: 'image/jpeg' });
            setResult(res);
            setPhase('review');
        } catch (err) {
            setError(err.message || 'Analysis failed.');
            setPhase('error');
        }
    };

    if (phase === 'review' && result) {
        return (
            <EntryForm
                initial={{
                    description: result.description,
                    calories: result.calories,
                    protein_g: result.protein_g,
                    carbs_g: result.carbs_g,
                    fat_g: result.fat_g,
                    source: result.source,      // "photo" | "label", classified by the backend
                    items: result.items
                }}
                estimated
                confidence={result.confidence}
                onSave={onSave}
                onCancel={() => { setResult(null); setPhase('pick'); }}
            />
        );
    }

    if (phase === 'manual') {
        // Analyze failed and the user chose to continue by hand — same shared
        // form, no dead end.
        return (
            <EntryForm
                initial={{ source: 'manual' }}
                onSave={onSave}
                onCancel={() => setPhase('pick')}
            />
        );
    }

    return (
        <div className="photo-entry">
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => analyze(e.target.files?.[0])}
            />

            {phase === 'analyzing' ? (
                <div className="photo-analyzing">
                    <LoaderCircle size={22} className="photo-spinner" />
                    <span>Analyzing your photo… this takes a few seconds.</span>
                </div>
            ) : (
                <>
                    <button className="scan-btn" onClick={() => fileRef.current?.click()}>
                        <Camera size={18} /> Snap or choose a photo
                    </button>
                    <p className="photo-hint">
                        Works for a plate of food or a nutrition-facts label —
                        you review and can edit everything before it saves.
                    </p>
                </>
            )}

            {phase === 'error' && (
                <>
                    <div className="nutrition-inline-error">
                        <CircleAlert size={14} /> {error}
                    </div>
                    <div className="entry-form-actions">
                        <button className="entry-cancel-btn" onClick={() => fileRef.current?.click()}>
                            <RefreshCw size={14} /> Try another photo
                        </button>
                        <button className="entry-cancel-btn" onClick={() => setPhase('manual')}>
                            <PenLine size={14} /> Enter manually
                        </button>
                    </div>
                </>
            )}

            {phase !== 'analyzing' && onCancel && (
                <button className="entry-cancel-btn" onClick={onCancel}>Cancel</button>
            )}
        </div>
    );
};

export default PhotoEntry;
