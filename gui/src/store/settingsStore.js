import { create } from 'zustand';
import api from '../api';

const useSettingsStore = create((set) => {
  const saveTimeouts = Object.create(null);

  const clearSaveTimeout = (sectionId) => {
    const timerId = saveTimeouts[sectionId];
    if (timerId) {
      clearTimeout(timerId);
      delete saveTimeouts[sectionId];
    }
  };

  return {
    settings: null,
    schema: null,
    loading: false,
    error: null,
    saveStatus: {},
    testStatus: {},

    fetchSettings: async () => {
      set({ loading: true, error: null });
      try {
        const res = await api.get('/settings');
        set({ settings: res.data, loading: false });
      } catch (err) {
        const msg = err.response?.data?.error || err.message;
        set({ loading: false, error: msg });
      }
    },

    fetchSchema: async () => {
      try {
        const res = await api.get('/settings/schema');
        set({ schema: res.data });
      } catch (err) {
        const msg = err.response?.data?.error || err.message;
        set({ error: msg });
      }
    },

    saveSection: async (sectionId, payload) => {
      clearSaveTimeout(sectionId);

      set((s) => ({
        saveStatus: { ...s.saveStatus, [sectionId]: 'saving' },
      }));

      try {
        const res = await api.post('/settings', payload);

        set((s) => ({
          settings: res.data.settings,
          saveStatus: { ...s.saveStatus, [sectionId]: 'saved' },
        }));

        saveTimeouts[sectionId] = setTimeout(() => {
          set((s) => ({
            saveStatus: { ...s.saveStatus, [sectionId]: 'idle' },
          }));
          delete saveTimeouts[sectionId];
        }, 3000);

        return { success: true, needsRestart: res.data.needsRestart };
      } catch (err) {
        clearSaveTimeout(sectionId);

        set((s) => ({
          saveStatus: { ...s.saveStatus, [sectionId]: 'error' },
        }));

        return {
          success: false,
          error: err.response?.data?.error || err.message,
        };
      }
    },

    testConnection: async (sectionId, endpoint, body) => {
      set((s) => ({
        testStatus: {
          ...s.testStatus,
          [sectionId]: { loading: true, success: null, message: null },
        },
      }));

      try {
        const res = await api.post(endpoint.replace(/^\/api/, ''), body || {});
        const data = res.data;
        const msg = data.version
          ? `Connected — v${data.version}`
          : (data.message || data.error || 'No response detail');

        set((s) => ({
          testStatus: {
            ...s.testStatus,
            [sectionId]: {
              loading: false,
              success: data.success,
              message: msg,
            },
          },
        }));
      } catch (err) {
        set((s) => ({
          testStatus: {
            ...s.testStatus,
            [sectionId]: {
              loading: false,
              success: false,
              message: err.response?.data?.error || err.message,
            },
          },
        }));
      }
    },

    clearTestStatus: (sectionId) =>
      set((s) => {
        const { [sectionId]: _omitted, ...rest } = s.testStatus;
        return { testStatus: rest };
      }),

    revealSecret: async (key) => {
      // SD-9: fetch one unmasked secret on explicit user action. The plaintext
      // is returned to the caller for transient display only; never stored in
      // global state (keeps the reveal blast radius to the component).
      try {
        const res = await api.post('/settings/reveal', { key });
        return { success: true, value: res.data.value };
      } catch (err) {
        return { success: false, error: err.response?.data?.error || err.message };
      }
    },
  };
});

export default useSettingsStore;
