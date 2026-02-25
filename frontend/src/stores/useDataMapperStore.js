import { create } from 'zustand';
import dataMapperService from '../services/dataMapperService';

const useDataMapperStore = create((set) => ({
  sets: [],
  rules: [],
  loading: false,
  error: null,

  loadSets: async () => {
    set({ loading: true, error: null });
    try {
      const sets = await dataMapperService.listSets();
      set({ sets, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  loadRules: async () => {
    set({ loading: true, error: null });
    try {
      const rules = await dataMapperService.listRules();
      set({ rules, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  createSet: async (payload) => {
    const set_ = await dataMapperService.createSet(payload);
    set((s) => ({ sets: [set_, ...s.sets] }));
    return set_;
  },

  updateSet: async (id, payload) => {
    const updated = await dataMapperService.updateSet(id, payload);
    set((s) => ({ sets: s.sets.map((x) => (x.id === id ? updated : x)) }));
    return updated;
  },

  removeSet: async (id) => {
    await dataMapperService.removeSet(id);
    set((s) => ({ sets: s.sets.filter((x) => x.id !== id) }));
  },

  createRule: async (payload) => {
    const rule = await dataMapperService.createRule(payload);
    set((s) => ({ rules: [rule, ...s.rules] }));
    return rule;
  },

  updateRule: async (id, payload) => {
    const updated = await dataMapperService.updateRule(id, payload);
    set((s) => ({ rules: s.rules.map((r) => (r.id === id ? updated : r)) }));
    return updated;
  },

  removeRule: async (id) => {
    await dataMapperService.removeRule(id);
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
  },
}));

export default useDataMapperStore;
