import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Send, Sparkles, Mic, Square } from 'lucide-react';
import BackButton from '../components/common/BackButton';
import { useWorkout } from '../context/WorkoutContext';
import { sendCoachMessage, getCoachHistory, synthesizeVoice } from '../services/ApiService';
import './CoachView.css';

const DEFAULT_VOICE_ID = 'FxZjRiAEBESrb7srpme7';
const DEFAULT_PERSONALITY = 'apex';
const FLUSH_WORD_COUNT = 8;
const VOICE_MIME = 'audio/mpeg';

// Incremental WS→MSE playback needs MediaSource + audio/mpeg support. iOS Safari
// has neither, so we detect once and fall back to full-text Web Audio there.
const MSE_SUPPORTED =
    typeof window !== 'undefined' &&
    'MediaSource' in window &&
    typeof window.MediaSource.isTypeSupported === 'function' &&
    window.MediaSource.isTypeSupported(VOICE_MIME);

// Strip Markdown for the TTS pipeline so it speaks clean prose, not "asterisk
// asterisk bold". Applied to each phrase right before it's sent to the voice WS.
// Inline code is dropped entirely — you don't want code spans read aloud.
function stripMarkdownForVoice(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/^\s*[-*+]\s/gm, '')
        .trim();
}

// Strip Markdown for on-screen display so the coach bubble shows clean prose
// instead of raw **bold** / `code` markers. Unlike the voice variant, inline
// code keeps its text (only the backticks go). The personas are told not to
// emit Markdown, so in practice this is a safety net.
function stripMarkdownForDisplay(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .trim();
}

const CoachView = () => {
    const { activeWorkout } = useWorkout();

    const [messages, setMessages] = useState([]); // [{ role, content, streaming?, error? }]
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [speakingIndex, setSpeakingIndex] = useState(null);
    const [isSpeaking, setIsSpeaking] = useState(false); // drives the Stop button
    const [isListening, setIsListening] = useState(false); // mic active

    const threadRef = useRef(null);
    // Web Audio fallback (full-text playback; also the iOS path).
    const audioCtxRef = useRef(null);
    const sourceRef = useRef(null);
    // Read the latest voice toggle inside async stream handlers without stale closures.
    const voiceEnabledRef = useRef(voiceEnabled);
    useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

    // --- Streaming-voice (WS + MSE) mutable state, held in refs so it survives
    // re-renders. Plain `let`s in the component body would reset every render and
    // break the accumulator / socket handles. ---
    const voiceWsRef = useRef(null);
    const wordBufferRef = useRef('');
    const wordCountRef = useRef(0);
    const textQueueRef = useRef([]); // phrases queued before the WS opens
    const mediaSourceRef = useRef(null);
    const sourceBufferRef = useRef(null);
    const audioQueueRef = useRef([]); // pending audio ArrayBuffers
    const isAppendingRef = useRef(false);
    const streamDoneRef = useRef(false); // WS closed (all audio received) → safe to endOfStream
    const audioElRef = useRef(null); // hidden <audio> sink for MSE playback
    const recognitionRef = useRef(null); // Web Speech recognition instance

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

    // --- Tear down every audio/voice pipeline on unmount ---
    useEffect(() => () => {
        try { voiceWsRef.current?.close(); } catch { /* already closed */ }
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* already stopped */ } }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* already closed */ } }
        const el = audioElRef.current;
        if (el) { try { el.pause(); } catch { /* nothing playing */ } }
        try { recognitionRef.current?.stop(); } catch { /* not listening */ }
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

    // Full-text Web Audio playback. Used when MSE streaming isn't available
    // (iOS Safari) and as the legacy voice path.
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
            source.onended = () => {
                setSpeakingIndex((cur) => (cur === index ? null : cur));
                setIsSpeaking(false);
            };
            sourceRef.current = source;
            setSpeakingIndex(index);
            setIsSpeaking(true);
            source.start();
        } catch {
            // Voice is best-effort (not configured / decode failure) — fail silently.
            setSpeakingIndex((cur) => (cur === index ? null : cur));
            setIsSpeaking(false);
        }
    };

    // --- MSE incremental audio sink ---------------------------------------
    const drainAudioQueue = () => {
        const sb = sourceBufferRef.current;
        if (isAppendingRef.current || audioQueueRef.current.length === 0) return;
        if (!sb || sb.updating) return;
        isAppendingRef.current = true;
        try {
            sb.appendBuffer(audioQueueRef.current.shift());
        } catch {
            // SourceBuffer can throw if removed/closed mid-stream — recover the flag.
            isAppendingRef.current = false;
        }
    };

    // Close out the MediaSource once all text has been sent AND every audio chunk
    // has been appended, so the <audio> element fires 'ended' and the Stop button
    // hides itself.
    const maybeEndStream = () => {
        const ms = mediaSourceRef.current;
        const sb = sourceBufferRef.current;
        if (!streamDoneRef.current || !ms || ms.readyState !== 'open') return;
        if (audioQueueRef.current.length > 0 || !sb || sb.updating) return;
        try { ms.endOfStream(); } catch { /* already ended */ }
    };

    const initMSE = () => {
        const el = audioElRef.current;
        if (!el || !MSE_SUPPORTED) return;
        try { if (el.src) URL.revokeObjectURL(el.src); } catch { /* nothing to revoke */ }
        const ms = new MediaSource();
        mediaSourceRef.current = ms;
        sourceBufferRef.current = null;
        el.src = URL.createObjectURL(ms);
        ms.addEventListener('sourceopen', () => {
            try {
                const sb = ms.addSourceBuffer(VOICE_MIME);
                sourceBufferRef.current = sb;
                sb.addEventListener('updateend', () => {
                    isAppendingRef.current = false;
                    drainAudioQueue();
                    maybeEndStream();
                });
                drainAudioQueue();
                // Covers the empty-audio case where the WS already closed before the
                // SourceBuffer existed (streamDone set, but maybeEndStream bailed on !sb).
                maybeEndStream();
            } catch {
                // MSE unavailable for this MIME — the Web Audio fallback will cover it.
            }
        }, { once: true });
    };

    const queueAudioChunk = (arrayBuffer) => {
        audioQueueRef.current.push(arrayBuffer);
        drainAudioQueue();
        const el = audioElRef.current;
        if (el && el.paused) {
            // Only show the Stop button once playback actually starts — if autoplay
            // is blocked, play() rejects and we leave isSpeaking false (and retry on
            // the next chunk) rather than stranding a Stop button with no audio.
            // Guard the late-resolve race: if stopSpeaking() paused us first, don't
            // re-show the Stop button when this play() promise finally resolves.
            el.play().then(() => { if (!el.paused) setIsSpeaking(true); }).catch(() => { /* autoplay blocked — retry next chunk */ });
        }
    };

    // --- Voice WebSocket (backend → ElevenLabs streaming pipeline) ---------
    const sendVoiceChunk = (chunk) => {
        const ws = voiceWsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(chunk));
        } else {
            textQueueRef.current.push(chunk);
        }
    };

    const initVoiceStream = () => {
        const base = import.meta.env.VITE_API_URL;
        if (!base) return;

        // Reset the pipeline for a fresh utterance.
        wordBufferRef.current = '';
        wordCountRef.current = 0;
        textQueueRef.current = [];
        audioQueueRef.current = [];
        isAppendingRef.current = false;
        streamDoneRef.current = false;
        initMSE();

        const voiceId = localStorage.getItem('coach_voice_id') || DEFAULT_VOICE_ID;
        let url = base.replace(/^http/, 'ws') + '/api/voice/stream?voice_id=' + encodeURIComponent(voiceId);
        // A browser WS handshake can't carry the Authorization header, so pass the
        // token as a query param for email/password users; OAuth users authenticate
        // via the session cookie sent with the handshake.
        const token = localStorage.getItem('fitness_auth_token');
        if (token) url += '&token=' + encodeURIComponent(token);

        let ws;
        try { ws = new WebSocket(url); } catch { return; }
        ws.binaryType = 'arraybuffer';
        voiceWsRef.current = ws;
        ws.onopen = () => {
            const q = textQueueRef.current;
            while (q.length > 0 && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(q.shift()));
        };
        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) queueAudioChunk(event.data);
        };
        ws.onerror = () => { /* best-effort voice — silent on socket error */ };
        ws.onclose = () => {
            if (voiceWsRef.current === ws) voiceWsRef.current = null;
            // Server has streamed all audio and closed — only now is it safe to end
            // the MediaSource so the <audio> element fires 'ended'.
            streamDoneRef.current = true;
            maybeEndStream();
        };
    };

    // Buffer streamed text and flush whole phrases to the voice WS. Deltas are
    // accumulated raw (to preserve inter-token spacing) and Markdown-stripped only
    // at flush time — stripping each tiny delta would mash words together.
    const phraseAccumulator = (textDelta) => {
        wordBufferRef.current += textDelta;
        wordCountRef.current += textDelta.split(/\s+/).filter(Boolean).length;
        const hasPunctuation = /[.!?,;:]/.test(textDelta);
        const buffered = wordBufferRef.current;
        const shouldFlush =
            wordCountRef.current >= FLUSH_WORD_COUNT ||
            hasPunctuation ||
            buffered.length > 80;
        if (shouldFlush) {
            const chunk = stripMarkdownForVoice(buffered);
            if (chunk) sendVoiceChunk({ type: 'text', content: chunk });
            wordBufferRef.current = '';
            wordCountRef.current = 0;
        }
    };

    const flushRemainingText = () => {
        const chunk = stripMarkdownForVoice(wordBufferRef.current);
        if (chunk) sendVoiceChunk({ type: 'text', content: chunk, flush: true });
        // Tell the server we're done sending text. It will stream the final audio
        // frames and then close the socket — ws.onclose is what actually ends the
        // MSE buffer. Ending here would race (and drop) the trailing audio.
        sendVoiceChunk({ type: 'end' });
        wordBufferRef.current = '';
        wordCountRef.current = 0;
    };

    const stopSpeaking = () => {
        const el = audioElRef.current;
        if (el) { try { el.pause(); } catch { /* nothing playing */ } }
        audioQueueRef.current = [];
        isAppendingRef.current = false;
        textQueueRef.current = [];
        wordBufferRef.current = '';
        wordCountRef.current = 0;
        const ws = voiceWsRef.current;
        if (ws) { try { ws.close(); } catch { /* already closed */ } voiceWsRef.current = null; }
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* already stopped */ } }
        setIsSpeaking(false);
        setSpeakingIndex(null);
    };

    // Stop any in-flight speech if the user turns voice off mid-utterance.
    useEffect(() => {
        if (!voiceEnabled) stopSpeaking();
    }, [voiceEnabled]);

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

        // Pick the voice path once per send: stream incrementally over WS+MSE when
        // supported, otherwise synthesize the full reply via Web Audio at the end.
        const voiceOn = voiceEnabledRef.current;
        let voiceActive = voiceOn && MSE_SUPPORTED && !!import.meta.env.VITE_API_URL;
        if (voiceActive) {
            setSpeakingIndex(assistantIndex);
            initVoiceStream();
        }

        const setLastAssistant = (patch) => setMessages((prev) => {
            const copy = [...prev];
            const last = copy.length - 1;
            if (last >= 0) copy[last] = { ...copy[last], ...patch };
            return copy;
        });

        let assistantText = '';
        const personality = localStorage.getItem('coach_personality') || DEFAULT_PERSONALITY;

        try {
            const res = await sendCoachMessage(trimmed, activeWorkout || null, personality);

            if (!res.ok) {
                let detail = `Coach request failed (${res.status}).`;
                try { const body = await res.json(); if (body?.detail) detail = body.detail; } catch { /* keep default */ }
                setLastAssistant({ content: detail, streaming: false, error: true });
                if (voiceActive) { stopSpeaking(); voiceActive = false; }
                return;
            }
            if (!res.body) {
                setLastAssistant({ content: 'Streaming is not supported in this browser.', streaming: false, error: true });
                if (voiceActive) { stopSpeaking(); voiceActive = false; }
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
                        if (voiceActive) phraseAccumulator(event.content);
                    } else if (event.type === 'error') {
                        setLastAssistant({
                            content: assistantText || event.content || 'The coach hit an error.',
                            streaming: false,
                            error: true,
                        });
                        if (voiceActive) { stopSpeaking(); voiceActive = false; }
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
                        if (voiceActive) phraseAccumulator(event.content);
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

            // Voice: streaming flushes the buffered tail + closes the pipeline; the
            // fallback path synthesizes the full reply in one shot.
            if (assistantText.trim()) {
                if (voiceActive) {
                    flushRemainingText();
                } else if (voiceOn && !MSE_SUPPORTED) {
                    playVoice(assistantText, assistantIndex);
                }
            } else if (voiceActive) {
                stopSpeaking();
            }
        } catch {
            setLastAssistant({
                content: 'Could not reach the coach. Check your connection and try again.',
                streaming: false,
                error: true,
            });
            if (voiceActive) { stopSpeaking(); voiceActive = false; }
        } finally {
            setIsStreaming(false);
        }
    };

    const toggleVoice = () => {
        // Turning on: unlock audio within this user gesture for reliable playback.
        if (!voiceEnabled) ensureAudioContext();
        setVoiceEnabled((v) => !v);
    };

    const toggleMic = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }
        if (isListening) {
            try { recognitionRef.current?.stop(); } catch { /* not running */ }
            setIsListening(false);
            return;
        }
        // Unlock audio within this user gesture so the spoken reply can play back.
        if (voiceEnabled) ensureAudioContext();
        const recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) handleSend(transcript);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
        try { recognition.start(); setIsListening(true); } catch { setIsListening(false); }
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
                            {m.role === 'user' ? m.content : stripMarkdownForDisplay(m.content)}
                            {m.streaming && <span className="coach-cursor">|</span>}
                        </div>
                    ))
                )}
            </div>

            {isSpeaking && (
                <button
                    type="button"
                    className="coach-stop-btn"
                    onClick={stopSpeaking}
                    aria-label="Stop speaking"
                >
                    <Square size={16} fill="currentColor" /> Stop
                </button>
            )}

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
                    type="button"
                    className={`coach-mic-btn ${isListening ? 'active' : ''}`}
                    onClick={toggleMic}
                    aria-pressed={isListening}
                    aria-label={isListening ? 'Stop listening' : 'Speak to the coach'}
                    title={isListening ? 'Listening…' : 'Voice input'}
                >
                    <Mic size={20} />
                </button>
                <button
                    type="submit"
                    className="coach-send-btn"
                    disabled={isStreaming || !input.trim()}
                    aria-label="Send message"
                >
                    <Send size={20} />
                </button>
            </form>

            {/* Hidden sink for MSE incremental audio playback. */}
            <audio
                ref={audioElRef}
                style={{ display: 'none' }}
                onEnded={() => { setIsSpeaking(false); setSpeakingIndex(null); }}
            />
        </div>
    );
};

export default CoachView;
