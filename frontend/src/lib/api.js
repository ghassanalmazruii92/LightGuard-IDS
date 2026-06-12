import axios from 'axios';

/**
 * When the UI is served by a static host (Apache, etc.) that rewrites unknown paths
 * to index.html, POST /api/... can hit the static handler and return "405 Method Not Allowed".
 * Set VITE_API_BASE in .env (e.g. http://127.0.0.1:8000) so API calls go directly to Uvicorn.
 * Leave empty for Vite dev (proxy handles /api and /auth).
 */
const baseURL = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const api = axios.create({ baseURL });

// Guard against multiple simultaneous 401s triggering multiple redirects.
let _redirecting = false;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !_redirecting) {
      _redirecting = true;
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
