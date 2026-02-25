import { create } from 'zustand';
import extractorService from '../services/extractorService';

const useExtractorStore = create((set) => ({
  extractors: [],
  loading: false,
  error: null,

  loadExtractors: async () => {
    set({ loading: true, error: null });
    try {
      const extractors = await extractorService.list();
      set({ extractors, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  createExtractor: async (payload) => {
    const extractor = await extractorService.create(payload);
    set((s) => ({ extractors: [extractor, ...s.extractors] }));
    return extractor;
  },

  updateExtractor: async (id, payload) => {
    const updated = await extractorService.update(id, payload);
    set((s) => ({ extractors: s.extractors.map((e) => (e.id === id ? updated : e)) }));
    return updated;
  },

  removeExtractor: async (id) => {
    await extractorService.remove(id);
    set((s) => ({ extractors: s.extractors.filter((e) => e.id !== id) }));
  },
}));

export default useExtractorStore;
