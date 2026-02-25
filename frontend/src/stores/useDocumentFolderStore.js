import { create } from 'zustand';
import documentFolderService from '../services/documentFolderService';

const useDocumentFolderStore = create((set) => ({
  folders: [],
  loading: false,
  error: null,

  loadFolders: async () => {
    set({ loading: true, error: null });
    try {
      const folders = await documentFolderService.list();
      set({ folders, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  createFolder: async (payload) => {
    const folder = await documentFolderService.create(payload);
    set((s) => ({ folders: [folder, ...s.folders] }));
    return folder;
  },

  updateFolder: async (id, payload) => {
    const updated = await documentFolderService.update(id, payload);
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }));
    return updated;
  },

  removeFolder: async (id) => {
    await documentFolderService.remove(id);
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
  },
}));

export default useDocumentFolderStore;
