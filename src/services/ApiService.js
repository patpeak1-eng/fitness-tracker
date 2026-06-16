const API_URL = import.meta.env.VITE_API_URL || null;

const getToken = () => localStorage.getItem('fitness_auth_token');

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
});

const isAvailable = () => !!(API_URL && getToken());

// Auth
export const register = (email, password, name) =>
  fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  }).then(r => r.json());

export const login = (email, password) =>
  fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json());

// Workouts
export const getHistory = () =>
  fetch(`${API_URL}/api/workouts`, { headers: headers() })
    .then(r => r.json());

export const saveWorkout = (workout) =>
  fetch(`${API_URL}/api/workouts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(workout)
  }).then(r => r.json());

export const getActiveWorkout = () =>
  fetch(`${API_URL}/api/workouts/active`, { headers: headers() })
    .then(r => r.json());

export const saveActiveWorkout = (workout) =>
  fetch(`${API_URL}/api/workouts/active`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ workout_data: workout })
  }).then(r => r.json());

export const clearActiveWorkout = () =>
  fetch(`${API_URL}/api/workouts/active`, {
    method: 'DELETE',
    headers: headers()
  }).then(r => r.json());

export const getProfile = () =>
  fetch(`${API_URL}/api/profile`, { headers: headers() })
    .then(r => r.json());

export const saveProfile = (profile) =>
  fetch(`${API_URL}/api/profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(profile)
  }).then(r => r.json());

export const getWeightHistory = () =>
  fetch(`${API_URL}/api/weight`, { headers: headers() })
    .then(r => r.json());

export const addWeightEntry = (weight) =>
  fetch(`${API_URL}/api/weight`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ weight })
  }).then(r => r.json());

export const getCustomTemplates = () =>
  fetch(`${API_URL}/api/templates`, { headers: headers() })
    .then(r => r.json());

export const saveCustomTemplate = (template) =>
  fetch(`${API_URL}/api/templates`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: template.name, template_data: template })
  }).then(r => r.json());

export const deleteCustomTemplate = (id) =>
  fetch(`${API_URL}/api/templates/${id}`, {
    method: 'DELETE',
    headers: headers()
  }).then(r => r.json());

export { isAvailable };

export const getGoogleAuthUrl = () => {
  if (!API_URL) return null;
  return `${API_URL}/api/auth/google`;
};
