import { create } from 'zustand';

// C.7b / S4: the session token now lives ONLY in an httpOnly cookie (unreadable by JS).
// We keep a NON-secret 'authed' flag for UI gating; the raw token is never stored, and
// any legacy token left in localStorage is evicted on load.
try { localStorage.removeItem('telgrarr_token'); } catch (_) {}

const useAuthStore = create((set) => ({
  isAuthenticated: localStorage.getItem('telgrarr_authed') === '1',
  login: () => {
    try { localStorage.setItem('telgrarr_authed', '1'); } catch (_) {}
    set({ isAuthenticated: true });
  },
  logout: () => {
    try { localStorage.removeItem('telgrarr_authed'); } catch (_) {}
    set({ isAuthenticated: false });
    // Only the server can clear an httpOnly cookie. Fire-and-forget; plain fetch avoids
    // an api<->store import cycle; same-origin request sends the cookie automatically.
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
  },
}));

export default useAuthStore;
