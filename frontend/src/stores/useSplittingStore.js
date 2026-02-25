import { create } from 'zustand';
import splittingService from '../services/splittingService';

const useSplittingStore = create((set, get) => ({
  instructions: [],
  loading: false,

  fetchInstructions: async () => {
    set({ loading: true });
    const { data } = await splittingService.getAll();
    set({ instructions: data, loading: false });
  },

  createInstruction: async (name, instructions) => {
    const { data } = await splittingService.create({ name, instructions });
    set((s) => ({ instructions: [data, ...s.instructions] }));
    return data;
  },

  updateInstruction: async (id, fields) => {
    const { data } = await splittingService.update(id, fields);
    set((s) => ({
      instructions: s.instructions.map((i) => (i.id === id ? data : i)),
    }));
    return data;
  },

  deleteInstruction: async (id) => {
    await splittingService.remove(id);
    set((s) => ({ instructions: s.instructions.filter((i) => i.id !== id) }));
  },
}));

export default useSplittingStore;
