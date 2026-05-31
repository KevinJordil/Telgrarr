import { create } from 'zustand';

const useAuthStore = create((set) => ({
  token: localStorage.getItem('telgrarr_token') || null,
  isAuthenticated: !!localStorage.getItem('telgrarr_token'),
  login: (token) => {
    localStorage.setItem('telgrarr_token', token);
    set({ token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('telgrarr_token');
    set({ token: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
