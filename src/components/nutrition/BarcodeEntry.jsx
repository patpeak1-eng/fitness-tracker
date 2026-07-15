import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, Search, CircleAlert } from 'lucide-react';
import * as ApiService from '../../services/ApiService';
import EntryForm from './EntryForm';
import './nutrition.css';

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

// Barcode path: native BarcodeDetector live scan where the platform has it
// (feature-detected — Safari/iOS often doesn't), with a manual code-entry
// fallback that is ALWAYS present, not just on unsupported browsers.
// Lookup is exact label data (backend OFF cache) — no Estimated badge.
const BarcodeEntry = ({ onSave, onCancel }) => {
    const [scanSupported] = useState(() => 'BarcodeDetector' in window);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState(null);
    const [manualCode, setManualCode] = useState('');
    const [lookupState, setLookupState] = useState('idle'); // idle|loading|error
    const [lookupError, setLookupError] = useState(null);
    const [product, setProduct] = useState(null);
    const [grams, setGrams] = useState('100');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanLoopRef = useRef(null);
    // Async-cancellation flag: getUserMedia can resolve AFTER this component
    // is gone (user closes the modal while the permission prompt is open).
    // Without this check the stream's tracks would never be stopped and the
    // camera would stay on. (Not a persist-effect mount guard — different
    // hazard class; StrictMode remounts re-set it before any user action.)
    const mountedRef = useRef(true);

    const stopScan = () => {
        if (scanLoopRef.current) { clearInterval(scanLoopRef.current); scanLoopRef.current = null; }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setScanning(false);
    };

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; stopScan(); }; // release the camera on unmount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Attach the stream and start the detect loop only AFTER React has
    // committed the scanning=true render (the <video> exists). The previous
    // requestAnimationFrame attach raced the commit: on a slow device the
    // callback could run first, silently leaving a live camera with a dead
    // viewport. An effect keyed on `scanning` is deterministic.
    useEffect(() => {
        if (!scanning || !streamRef.current || !videoRef.current) return undefined;
        const video = videoRef.current;
        video.srcObject = streamRef.current;
        video.play().catch(() => {});
        const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
        scanLoopRef.current = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
                const codes = await detector.detect(videoRef.current);
                if (codes.length > 0) {
                    const value = codes[0].rawValue;
                    stopScan();
                    setManualCode(value);
                    lookup(value);
                }
            } catch { /* per-frame detect errors are non-fatal */ }
        }, 300);
        return () => {
            if (scanLoopRef.current) { clearInterval(scanLoopRef.current); scanLoopRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scanning]);

    const lookup = async (code) => {
        const trimmed = String(code || '').trim();
        if (!trimmed) return;
        setLookupState('loading');
        setLookupError(null);
        try {
            const p = await ApiService.getBarcodeProduct(trimmed);
            setProduct(p);
            setLookupState('idle');
        } catch (err) {
            setLookupState('error');
            setLookupError(err.message || 'Lookup failed.');
        }
    };

    const startScan = async () => {
        if (streamRef.current || scanning) return; // guard rapid double-taps
        setScanError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            if (!mountedRef.current) {
                // Component closed while the permission prompt was open —
                // stop the tracks NOW or the camera stays on with no owner.
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            streamRef.current = stream;
            setScanning(true); // the scanning effect attaches after commit
        } catch (err) {
            if (mountedRef.current) {
                setScanError('Camera unavailable — enter the barcode below instead.');
                setScanning(false);
            }
        }
    };

    // Product found → serving-size picker → shared EntryForm, pre-filled with
    // exact per-100g values scaled to the chosen amount.
    if (product) {
        const g = Number(grams);
        const valid = Number.isFinite(g) && g > 0;
        const scale = valid ? g / 100 : 0;
        const scaled = (v) => (valid && (v === 0 || v)
            ? Math.round(v * scale * 10) / 10
            : null);
        const draftCalories = valid && (product.calories_per_100g === 0 || product.calories_per_100g)
            ? Math.round(product.calories_per_100g * scale)
            : null;
        const name = [product.brand, product.name].filter(Boolean).join(' — ')
            || `Barcode ${product.barcode}`;

        return (
            <div>
                <div className="barcode-product-card">
                    <div className="barcode-product-name">{name}</div>
                    {product.serving_size && (
                        <div className="barcode-product-serving">
                            Label serving: {product.serving_size}
                        </div>
                    )}
                    <div className="form-group">
                        <label>Amount (g / ml)</label>
                        <input
                            type="number" inputMode="decimal" min="1" value={grams}
                            onChange={e => setGrams(e.target.value)}
                        />
                    </div>
                </div>
                <EntryForm
                    key={`${product.barcode}-${grams}`}
                    initial={{
                        description: valid ? `${name} (${g} g)` : name,
                        calories: draftCalories,
                        protein_g: scaled(product.protein_g_per_100g),
                        carbs_g: scaled(product.carbs_g_per_100g),
                        fat_g: scaled(product.fat_g_per_100g),
                        source: 'barcode',
                        barcode: product.barcode
                    }}
                    onSave={onSave}
                    onCancel={() => setProduct(null)}
                />
            </div>
        );
    }

    return (
        <div className="barcode-entry">
            {scanSupported && !scanning && (
                <button className="scan-btn" onClick={startScan}>
                    <ScanLine size={18} /> Scan barcode
                </button>
            )}
            {scanning && (
                <div className="scan-viewport">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={videoRef} playsInline muted />
                    <button className="entry-cancel-btn" onClick={stopScan}>Stop scanning</button>
                </div>
            )}
            {scanError && (
                <div className="nutrition-inline-error"><CircleAlert size={14} /> {scanError}</div>
            )}

            {/* Manual code entry — always available, mandatory fallback */}
            <div className="form-group">
                <label>{scanSupported ? 'Or enter the code' : 'Barcode number'}</label>
                <div className="barcode-manual-row">
                    <input
                        type="text" inputMode="numeric" value={manualCode}
                        onChange={e => setManualCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 3017620422003"
                        maxLength={14}
                    />
                    <button
                        className="entry-save-btn"
                        disabled={manualCode.trim().length < 6 || lookupState === 'loading'}
                        onClick={() => lookup(manualCode)}
                    >
                        <Search size={16} /> {lookupState === 'loading' ? 'Looking up…' : 'Look up'}
                    </button>
                </div>
            </div>
            {lookupState === 'error' && (
                <div className="nutrition-inline-error"><CircleAlert size={14} /> {lookupError}</div>
            )}
            {onCancel && (
                <button className="entry-cancel-btn" onClick={onCancel}>Cancel</button>
            )}
        </div>
    );
};

export default BarcodeEntry;
