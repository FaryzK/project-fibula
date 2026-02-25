import { create } from 'zustand';
import * as workflowService from '../services/workflowService';

const useWorkflowStore = create((set, get) => ({
  workflows: [],
  loading: false,
  error: null,

  fetchWorkflows: async () => {
    set({ loading: true, error: null });
    try {
      const workflows = await workflowService.getWorkflows();
      set({ workflows, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  createWorkflow: async (name) => {
    const workflow = await workflowService.createWorkflow(name);
    set((s) => ({ workflows: [workflow, ...s.workflows] }));
    return workflow;
  },

  renameWorkflow: async (id, name) => {
    const updated = await workflowService.updateWorkflow(id, { name });
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? updated : w)),
    }));
  },

  deleteWorkflow: async (id) => {
    await workflowService.deleteWorkflow(id);
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }));
  },

  togglePublish: async (id, isPublished) => {
    const updated = isPublished
      ? await workflowService.unpublishWorkflow(id)
      : await workflowService.publishWorkflow(id);
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? updated : w)),
    }));
  },
}));

export default useWorkflowStore;
