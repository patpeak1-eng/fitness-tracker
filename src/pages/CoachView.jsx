import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Send, Sparkles } from 'lucide-react';
import BackButton from '../components/common/BackButton';
import { useWorkout } from '../context/WorkoutContext';
import { sendCoachMessage, getCoachHistory, synthesizeVoice } from '../services/ApiService';
import './CoachView.css';

const CoachView = () => {
    const { activeWorkout } = useWorkout();

    const [messages, setMessages] = useState([]); // [{ role, content, streaming?, error? }]
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [speakingIndex, setSpeakingIndex] = useState(null);

    const threadRef = useRef(null);
    const audioCtxRef = useRef(null);
    const sourceRef = useRef(null);
    // Read the latest voice toggle inside async stream handlers without stale closures.
    const voiceEnabledRef = useRef(voiceEnabled);
    useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

    // --- Hydrate previous conversation on mount ---
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const history = await getCoachHistory();
                if (cancelled || !Array.isArray(history)) return;
                // Only hydrate if the user hasn't already started a conversation —
                // otherwise a slow history fetch could clobber an in-flight message
                // and streamed chunks would corrupt a stale history entry.
                setMessages((prev) => (prev.length === 0
                    ? history.map((m) => ({ role: m.role, content: m.content }))
                    : prev));
            } catch {
                // No API / not signed in — start with an empty thread.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // --- Auto-scroll to the bottom as the thread grows / streams ---
    useEffect(() => {
        const el = threadRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    // --- Tear down audio on unmount ---
    useEffect(() => () => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* already stopped */ } }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* already closed */ } }
    }, []);

    // Create/resume the AudioContext. Call from within a user gesture (voice
    // toggle, send) so playback isn't blocked by browser autoplay policies when
    // it finally fires after the async stream completes.
    const ensureAudioContext = async () => {
        try {
            let ctx = audioCtxRef.current;
            if (!ctx) {
                const Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor) return null;
                ctx = new Ctor();
                audioCtxRef.current = ctx;
            }
            if (ctx.state === 'suspended') await ctx.resume();
            return ctx;
        } catch {
            return null;
        }
    };

    const playVoice = async (text, index) => {
        try {
            const data = await synthesizeVoice(text);
            const audioB64 = data?.audio_base64;
            if (!audioB64) return;

            const ctx = await ensureAudioContext();
            if (!ctx) return;

            const bytes = atob(audioB64);
            const buffer = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);

            const audioBuffer = await ctx.decodeAudioData(buffer.buffer);
            if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* none playing */ } }

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.onended = () => setSpeakingIndex((cur) => (cur === index ? null : cur));
            sourceRef.current = source;
            setSpeakingIndex(index);
            source.start();
        } catch {
            // Voice is best-effort (not configured / decode failure) — fail silently.
            setSpeakingIndex((cur) => (cur === index ? null : cur));
        }
    };

    const handleSend = async (text) => {
        const trimmed = (text || '').trim();
        if (!trimmed || isStreaming) return;

        // The assistant placeholder lands at this index after the two appends below.
        const assistantIndex = messages.length + 1;

        setInput('');
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: trimmed },
            { role: 'assistant', content: '', streaming: true },
        ]);
        setIsStreaming(true);

        const setLastAssistant = (patch) => setMessages((prev) => {
            const copy = [...prev];
            const last = copy.length - 1;
            if (last >= 0) copy[last] = { ...copy[last], ...patch };
            return copy;
        });

        let assistantText = '';

        try {
            const res = await sendCoachMessage(trimmed, activeWorkout || null);

            if (!res.ok) {
                let detail = `Coach request failed (${res.status}).`;
                try { const body = await res.json(); if (body?.detail) detail = body.detail; } catch { /* keep default */ }
                setLastAssistant({ content: detail, streaming: false, error: true });
                return;
            }
            if (!res.body) {
                setLastAssistant({ content: 'Streaming is not supported in this browser.', streaming: false, error: true });
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finished = false;

            while (!finished) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    let event;
                    try { event = JSON.parse(line.slice(6)); } catch { continue; }

                    if (event.type === 'text') {
                        assistantText += event.content;
                        setLastAssistant({ content: assistantText });
                    } else if (event.type === 'error') {
                        setLastAssistant({
                            content: assistantText || event.content || 'The coach hit an error.',
                            streaming: false,
                            error: true,
                        });
                        finished = true;
                        break;
                    } else if (event.type === 'done') {
                        finished = true;
                        break;
                    }
                }
            }

            // The backend ends every event with a blank line, but if the stream
            // closes with a complete event missing its trailing newline it would
            // linger in `buffer`; flush a trailing text event so no streamed
            // content is lost.
            if (!finished && buffer.startsWith('data: ')) {
                try {
                    const event = JSON.parse(buffer.slice(6));
                    if (event.type === 'text') {
                        assistantText += event.content;
                        setLastAssistant({ content: assistantText });
                    }
                } catch { /* partial / non-JSON tail — ignore */ }
            }

            // Finalize the bubble unless an error already closed it out.
            setMessages((prev) => {
                const copy = [...prev];
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === 'assistant' && !copy[last].error) {
                    copy[last] = { ...copy[last], streaming: false };
                }
                return copy;
            });

            if (assistantText.trim() && voiceEnabledRef.current) {
                playVoice(assistantText, assistantIndex);
            }
        } catch {
            setLastAssistant({
                content: 'Could not reach the coach. Check your connection and try again.',
                streaming: false,
                error: true,
            });
        } finally {
            setIsStreaming(false);
        }
    };

    const toggleVoice = () => {
        // Turning on: unlock audio within this user gesture for reliable playback.
        if (!voiceEnabled) ensureAudioContext();
        setVoiceEnabled((v) => !v);
    };

    const onSubmit = (e) => {
        e.preventDefault();
        if (voiceEnabled) ensureAudioContext();
        handleSend(input);
    };

    return (
        <div className="coach-view">
            <header className="coach-header">
                <BackButton />
                <div className="coach-header-titles">
                    <h1>AI Coach</h1>
                    <p className="coach-subtitle">Your personal training partner</p>
                </div>
                <button
                    type="button"
                    className={`coach-voice-toggle ${voiceEnabled ? 'active' : ''}`}
                    aria-pressed={voiceEnabled}
                    aria-label={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
                    title={voiceEnabled ? 'Voice on' : 'Voice off'}
                    onClick={toggleVoice}
                >
                    {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
            </header>

            <div className="coach-thread" ref={threadRef}>
                {messages.length === 0 ? (
                    <div className="coach-empty">
                        <Sparkles size={28} className="coach-empty-icon" />
                        <p>Ask me anything about your training, form, or how to use the app.</p>
                    </div>
                ) : (
                    messages.map((m, i) => (
                        <div
                            key={i}
                            className={[
                                'coach-bubble',
                                m.role === 'user' ? 'coach-bubble-user' : 'coach-bubble-coach',
                                m.error ? 'coach-bubble-error' : '',
                                speakingIndex === i ? 'coach-bubble-speaking' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            {m.content}
                            {m.streaming && <span className="coach-cursor">|</span>}
                        </div>
                    ))
                )}
            </div>

            <form className="coach-input-bar" onSubmit={onSubmit}>
                <input
                    className="coach-input"
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask your coach..."
                    aria-label="Message the coach"
                    autoComplete="off"
                />
                <button
                    type="submit"
                    className="coach-send-btn"
                    disabled={isStreaming || !input.trim()}
                    aria-label="Send message"
                >
                    <Send size={20} />
                </button>
            </form>
        </div>
    );
};

export default CoachView;
