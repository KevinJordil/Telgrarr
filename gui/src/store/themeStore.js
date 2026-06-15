import { create } from 'zustand';
const VALID_THEMES = ['dark', 'light', 'neon', 'telegram'];
const safeTheme = (t) => (VALID_THEMES.includes(t) ? t : 'dark');

const useThemeStore = create((set) => ({
  theme: safeTheme(localStorage.getItem('telgrarr_theme')),
  setTheme: (newTheme) => {
    if (!VALID_THEMES.includes(newTheme)) return;
    localStorage.setItem('telgrarr_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    set({ theme: newTheme });
  },
  initTheme: () => {
    const current = safeTheme(localStorage.getItem('telgrarr_theme'));
    document.documentElement.setAttribute('data-theme', current);
    set({ theme: current });
  }
}));

export default useThemeStore;
