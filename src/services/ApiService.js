import { DEFAULT_VOICE_ID } from '../constants/voiceIds';
import { DEFAULT_PERSONALITY } from '../constants/coachPersonalities';

const API_URL = import.meta.env.VITE_API_URL || null;

const getToken = () => localStorage.getItem('fitness_auth_token');

// Single fetch wrapper for all authenticated data calls. It always sends the
// HttpOnly session cookie (credentials:'include') for Google OAuth users, and
// additionally attaches the Authorization: Bearer header for email/password
// users when a localStorage token exists.
//
// The Bearer header is omitted when there is no token. This is deliberate: the
// backend prefers the header over the cookie, so a present-but-empty
// "Bearer null" header would shadow the cookie and fail auth for OAuth users.
const apiFetch = (path, options = {}) => {
  if (!API_URL) return Promise.reject(new Error('No API URL configured'));
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
};

// Usable whenever a backend URL is configured. Auth is carried by the cookie
// (OAuth) or the Bearer header (email/password); OAuth users have no readable
// token, so this must NOT require getToken() or they could never sync.
const isAvailable = () => !!API_URL;

// Auth
export const register = async (email, password, name) => {
  const r = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || `Registration failed (${r.status})`);
  }
  return r.json();
};

export const login = async (email, password) => {
  const r = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || `Login failed (${r.status})`);
  }
  return r.json();
};

export const getMe = () =>
  fetch(`${API_URL}/api/auth/me`, {
    credentials: 'include',  // sends the HttpOnly cookie
    headers: { 'Content-Type': 'application/json' }
  }).then(r => {
    if (!r.ok) throw new Error('Not authenticated');
    return r.json();
  });

// Workouts
export const getHistory = () =>
  apiFetch('/api/workouts').then(r => r.json());

export const saveWorkout = async (workout) => {
  const r = await apiFetch('/api/workouts', {
    method: 'POST',
    // Map the camelCase local shape to the backend's snake_case WorkoutCreate.
    // Without this, start_time/end_time arrive as unknown fields and persist as
    // null — which also defeats the name+startTime dedup used by the cloud pull.
    body: JSON.stringify({
      name: workout.name,
      client_id: workout.client_id || null,
      start_time: workout.startTime ?? null,
      end_time: workout.endTime ?? null,
      status: workout.status ?? 'completed',
      notes: workout.notes ?? null,
      exercises: workout.exercises ?? null,
      recommendations: workout.recommendations ?? null
    })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/workouts — ${text}`);
  }
  return r.json();
};

export const getActiveWorkout = () =>
  apiFetch('/api/workouts/active').then(r => r.json());

export const saveActiveWorkout = async (workout) => {
  const r = await apiFetch('/api/workouts/active', {
    method: 'PUT',
    body: JSON.stringify({ workout_data: workout })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/workouts/active — ${text}`);
  }
  return r.json();
};

export const clearActiveWorkout = async () => {
  const r = await apiFetch('/api/workouts/active', {
    method: 'DELETE'
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/workouts/active — ${text}`);
  }
  // 204 No Content on success — nothing to parse.
};

export const getProfile = () =>
  apiFetch('/api/profile').then(r => r.json());

export const saveProfile = async (profile) => {
  const r = await apiFetch('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(profile)
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/profile — ${text}`);
  }
  return r.json();
};

export const getWeightHistory = () =>
  apiFetch('/api/weight').then(r => r.json());

export const addWeightEntry = async (weight, recordedAt) => {
  const r = await apiFetch('/api/weight', {
    method: 'POST',
    body: JSON.stringify({ weight, recorded_at: recordedAt })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/weight — ${text}`);
  }
  return r.json();
};

export const getCustomTemplates = () =>
  apiFetch('/api/templates').then(r => r.json());

export const saveCustomTemplate = async (template) => {
  const r = await apiFetch('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ name: template.name, template_data: template })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/templates — ${text}`);
  }
  return r.json();
};

export const deleteCustomTemplate = async (id) => {
  const r = await apiFetch(`/api/templates/${id}`, {
    method: 'DELETE'
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[ApiService] HTTP ${r.status} — /api/templates/${id} — ${text}`);
  }
  // 204 No Content on success — nothing to parse.
};

export { isAvailable };

export const getGoogleAuthUrl = () => {
  if (!API_URL) return null;
  return `${API_URL}/api/auth/google`;
};

// Coach
export const sendCoachMessage = async (message, workoutContext = null, personality = DEFAULT_PERSONALITY) => {
  const res = await apiFetch('/api/coach/chat', {
    method: 'POST',
    body: JSON.stringify({ message, workout_context: workoutContext, personality })
  });
  // Returns raw Response for SSE streaming — do NOT call .json()
  return res;
};

export const getCoachHistory = () =>
  apiFetch('/api/coach/history').then(r => r.json());

export const synthesizeVoice = (text, voiceId = DEFAULT_VOICE_ID) =>
  apiFetch('/api/voice/coach-synthesize', {
    method: 'POST',
    body: JSON.stringify({ text, voice_id: voiceId })
  }).then(r => r.json());
