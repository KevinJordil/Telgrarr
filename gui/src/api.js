import axios from 'axios';
import useAuthStore from './store/authStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// ── Request interceptor — inject Bearer token ─────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── 401 debounced logout guard ────────────────────────────────────────────
// Problem solved: on a new tab, 3-4 parallel requests can all get 401
// simultaneously. A counter would reach the threshold instantly from a
// single causal event (one expired session). A debounce collapses all
// parallel 401s into ONE logout decision after a short settling window.
let _logoutTimer = null;

function scheduleLogout() {
  if (_logoutTimer) return; // already scheduled — do not reset the timer
  _logoutTimer = setTimeout(() => {
    _logoutTimer = null;
    // Only logout if still unauthenticated after the settling window
    if (useAuthStore.getState().token) {
      useAuthStore.getState().logout();
    }
  }, 2000);
}

function cancelLogout() {
  if (_logoutTimer) {
    clearTimeout(_logoutTimer);
    _logoutTimer = null;
  }
}

api.interceptors.response.use(
  (response) => {
    // Any success cancels any pending logout
    cancelLogout();
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      scheduleLogout();
    }
    return Promise.reject(error);
  }
);

export default api;
