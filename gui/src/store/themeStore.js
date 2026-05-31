import { create } from 'zustand';

const useThemeStore = create((set) => ({
  theme: localStorage.getItem('telgrarr_theme') || 'dark',
  setTheme: (newTheme) => {
    localStorage.setItem('telgrarr_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    set({ theme: newTheme });
  },
  initTheme: () => {
    const current = localStorage.getItem('telgrarr_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', current);
    set({ theme: current });
  }
}));

export default useThemeStore;
