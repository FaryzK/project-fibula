import { create } from 'zustand';
import reconciliationService from '../services/reconciliationService';

const useReconciliationStore = create((set) => ({
  rules: [],
  loading: false,
  error: null,

  loadRules: async () => {
    set({ loading: true, error: null });
    try {
      const rules = await reconciliationService.list();
      set({ rules, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  createRule: async (payload) => {
    const rule = await reconciliationService.create(payload);
    set((s) => ({ rules: [rule, ...s.rules] }));
    return rule;
  },

  updateRule: async (id, payload) => {
    const updated = await reconciliationService.update(id, payload);
    set((s) => ({ rules: s.rules.map((r) => (r.id === id ? updated : r)) }));
    return updated;
  },

  removeRule: async (id) => {
    await reconciliationService.remove(id);
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
  },
}));

export default useReconciliationStore;
