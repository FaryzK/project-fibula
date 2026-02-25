import { create } from 'zustand';
import categorisationService from '../services/categorisationService';

const useCategorisationStore = create((set) => ({
  prompts: [],
  loading: false,

  fetchPrompts: async () => {
    set({ loading: true });
    const { data } = await categorisationService.getAll();
    set({ prompts: data, loading: false });
  },

  createPrompt: async (name, labels) => {
    const { data } = await categorisationService.create({ name, labels });
    set((s) => ({ prompts: [data, ...s.prompts] }));
    return data;
  },

  updatePrompt: async (id, fields) => {
    const { data } = await categorisationService.update(id, fields);
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === id ? data : p)),
    }));
    return data;
  },

  deletePrompt: async (id) => {
    await categorisationService.remove(id);
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
  },
}));

export default useCategorisationStore;
