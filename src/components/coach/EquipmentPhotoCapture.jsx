import React, { useEffect, useRef, useState } from 'react';
import {
    Camera,
    CameraOff,
    Images,
    Plus,
    SwitchCamera,
    X,
} from 'lucide-react';
import './EquipmentPhotoCapture.css';

const EquipmentPhotoCapture = ({
    attachments,
    maxPhotos = 6,
    onAddFiles,
    onRemove,
    disabled = false,
}) => {
    const [cameraOpen, setCameraOpen] = useState(false);
    const [facingMode, setFacingMode] = useState('environment');
    const [cameraError, setCameraError] = useState('');
    const [cameraStarting, setCameraStarting] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const libraryInputRef = useRef(null);
    const nativeCameraInputRef = useRef(null);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    useEffect(() => {
        if (!cameraOpen) {
            stopCamera();
            return undefined;
        }

        let cancelled = false;
        setCameraStarting(true);
        setCameraError('');
        stopCamera();
        const waitTimer = window.setTimeout(() => {
            if (!cancelled && !streamRef.current) {
                setCameraStarting(false);
                setCameraError(
                    'The live camera is still waiting for access. Use phone camera or choose saved photos instead.'
                );
            }
        }, 8000);

        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Live camera is not supported in this browser.');
                }
                const videoSize = {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                };
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: { ...videoSize, facingMode: { exact: facingMode } },
                    });
                } catch (error) {
                    if (!['OverconstrainedError', 'NotFoundError'].includes(error?.name)) throw error;
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: { ...videoSize, facingMode: { ideal: facingMode } },
                    });
                }
                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = stream;
                setCameraError('');
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
            } catch (error) {
                if (!cancelled) {
                    setCameraError(
                        error?.name === 'NotAllowedError'
                            ? 'Camera access was denied. Use phone camera or choose saved photos instead.'
                            : `${error?.message || 'Could not open the camera.'} Use phone camera or choose saved photos instead.`
                    );
                }
            } finally {
                window.clearTimeout(waitTimer);
                if (!cancelled) setCameraStarting(false);
            }
        })();

        return () => {
            cancelled = true;
            window.clearTimeout(waitTimer);
            stopCamera();
        };
    }, [cameraOpen, facingMode]);

    useEffect(() => () => stopCamera(), []);

    const closeCamera = () => {
        setCameraOpen(false);
        setCameraError('');
    };

    const captureFrame = async () => {
        const video = videoRef.current;
        if (!video?.videoWidth || attachments.length >= maxPhotos) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) return;
        await onAddFiles([
            new File([blob], `equipment-${Date.now()}.jpg`, { type: 'image/jpeg' }),
        ]);
    };

    const handleInput = async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length) await onAddFiles(files);
    };

    const remaining = Math.max(0, maxPhotos - attachments.length);

    return (
        <div className="equipment-photo-capture">
            <div className="equipment-photo-actions">
                <button
                    type="button"
                    className="equipment-photo-action primary"
                    onClick={() => setCameraOpen(true)}
                    disabled={disabled || remaining === 0}
                >
                    <Camera size={18} /> Open camera
                </button>
                <button
                    type="button"
                    className="equipment-photo-action"
                    onClick={() => libraryInputRef.current?.click()}
                    disabled={disabled || remaining === 0}
                >
                    <Images size={18} /> Choose photos
                </button>
            </div>

            <input
                ref={libraryInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleInput}
            />
            <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={handleInput}
            />

            {cameraOpen && (
                <div className="equipment-camera" aria-label="Equipment camera">
                    <div className="equipment-camera-stage">
                        <video ref={videoRef} autoPlay muted playsInline />
                        {cameraStarting && (
                            <div className="equipment-camera-status">Opening outward camera…</div>
                        )}
                        {cameraError && (
                            <div className="equipment-camera-status error">
                                <CameraOff size={22} />
                                <span>{cameraError}</span>
                            </div>
                        )}
                    </div>
                    <div className="equipment-camera-controls">
                        <button
                            type="button"
                            onClick={() => setFacingMode(mode => mode === 'environment' ? 'user' : 'environment')}
                            aria-label="Flip camera"
                            title="Flip camera"
                        >
                            <SwitchCamera size={19} />
                        </button>
                        <button
                            type="button"
                            className="equipment-shutter"
                            onClick={captureFrame}
                            disabled={cameraStarting || !!cameraError || remaining === 0}
                            aria-label="Take equipment photo"
                        >
                            <Camera size={22} />
                        </button>
                        <button type="button" onClick={closeCamera} aria-label="Close camera">
                            <X size={19} />
                        </button>
                    </div>
                    <button
                        type="button"
                        className="equipment-native-camera"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        disabled={remaining === 0}
                    >
                        Use phone camera instead
                    </button>
                </div>
            )}

            {attachments.length > 0 && (
                <div className="equipment-photo-review">
                    <div className="equipment-photo-review-heading">
                        <span>{attachments.length} of {maxPhotos} photos attached</span>
                        <small>Sent with your next Coach message</small>
                    </div>
                    <div className="equipment-photo-strip">
                        {attachments.map((attachment, index) => (
                            <div className="equipment-photo-thumb" key={attachment.id}>
                                <img src={attachment.preview} alt={`Equipment attachment ${index + 1}`} />
                                <button
                                    type="button"
                                    onClick={() => onRemove(attachment.id)}
                                    aria-label={`Remove equipment photo ${index + 1}`}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button
                                type="button"
                                className="equipment-photo-add"
                                onClick={() => libraryInputRef.current?.click()}
                                aria-label="Add more equipment photos"
                            >
                                <Plus size={20} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EquipmentPhotoCapture;
