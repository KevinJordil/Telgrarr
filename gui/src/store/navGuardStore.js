import { create } from 'zustand';

// Navigation guard.
// The app uses the component BrowserRouter (not a data router), so React
// Router's useBlocker/usePrompt are unavailable. Instead, a page (e.g. Settings)
// registers an `intercept` while it has unsaved work; in-app navigation sources
// (BottomNav) route their navigation through `run()`, which hands control to the
// intercept if one is active. The intercept decides: prompt the user, then call
// proceed() to continue the navigation, or do nothing to stay. With no intercept
// registered, run() navigates immediately (zero overhead for every other page).
const useNavGuard = create((set, get) => ({
  intercept: null, // ((proceed: () => void) => void) | null

  setIntercept: (fn) => set({ intercept: typeof fn === 'function' ? fn : null }),
  clearIntercept: () => set({ intercept: null }),
  dirtyFlags: {},
  setDirty: (key, isDirty) =>
    set((s) => {
      if (!!s.dirtyFlags[key] === !!isDirty) return {};
      const next = { ...s.dirtyFlags };
      if (isDirty) next[key] = true; else delete next[key];
      return { dirtyFlags: next };
    }),
  hasExternalDirty: () => Object.keys(get().dirtyFlags).length > 0,

  run: (proceed) => {
    if (typeof proceed !== 'function') return;
    const fn = get().intercept;
    if (typeof fn === 'function') fn(proceed);
    else proceed();
  },
}));

export default useNavGuard;
