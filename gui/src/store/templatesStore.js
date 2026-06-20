import { create } from 'zustand';
import api from '../api';

const useTemplatesStore = create((set, get) => ({
  templates: null,
  loading:   false,
  error:     null,
  saving:    false,
  layout:        null,
  layoutLoading: false,
  layoutError:   null,

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/templates');
      set({ templates: res.data, loading: false });
    } catch (err) {
      set({ loading: false, error: err.response?.data?.error || err.message });
    }
  },

  setActiveMode: async (mode) => {
    set({ saving: true });
    try {
      const res = await api.post('/templates/active', { mode });
      set({ templates: res.data.templates, saving: false });
      return { success: true };
    } catch (err) {
      set({ saving: false });
      return { success: false, error: err.response?.data?.error || err.message };
    }
  },

  addSlot: async (slot) => {
    set({ saving: true });
    try {
      const res = await api.post('/templates/slots', slot);
      set({ templates: res.data.templates, saving: false });
      return { success: true };
    } catch (err) {
      set({ saving: false });
      return { success: false, error: err.response?.data?.error || err.message };
    }
  },

  updateSlot: async (id, patch) => {
    set({ saving: true });
    try {
      const res = await api.patch(`/templates/slots/${id}`, patch);
      set({ templates: res.data.templates, saving: false });
      return { success: true };
    } catch (err) {
      set({ saving: false });
      return { success: false, error: err.response?.data?.error || err.message };
    }
  },

  deleteSlot: async (id) => {
    set({ saving: true });
    try {
      const res = await api.delete(`/templates/slots/${id}`);
      set({ templates: res.data.templates, saving: false });
      return { success: true };
    } catch (err) {
      set({ saving: false });
      return { success: false, error: err.response?.data?.error || err.message };
    }
  },
  fetchLayout: async () => {
    set({ layoutLoading: true, layoutError: null });
    try {
      const res = await api.get('/templates/layout');
      set({ layout: res.data, layoutLoading: false });
    } catch (err) {
      set({ layoutLoading: false, layoutError: err.response?.data?.error || err.message });
    }
  },
  saveLayout: async (layout) => {
    set({ saving: true });
    try {
      const res = await api.put('/templates/layout', { layout });
      set({ layout: res.data.layout, saving: false });
      return { success: true };
    } catch (err) {
      set({ saving: false });
      return { success: false, error: err.response?.data?.error || err.message };
    }
  },
}));

export default useTemplatesStore;
