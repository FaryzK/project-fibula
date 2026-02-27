import api from './api';

export default {
  getSummary(workflowId) {
    return api.get(`/workflows/${workflowId}/flow-inspector/summary`);
  },

  getNodeDocuments(workflowId, nodeId, tab) {
    return api.get(`/workflows/${workflowId}/flow-inspector/nodes/${nodeId}/documents`, {
      params: { tab },
    });
  },

  getOrphaned(workflowId) {
    return api.get(`/workflows/${workflowId}/flow-inspector/orphaned`);
  },

  deleteDocument(workflowId, execId) {
    return api.delete(`/workflows/${workflowId}/flow-inspector/documents/${execId}`);
  },

  retrigger(workflowId, execIds, triggerNodeIds) {
    return api.post(`/workflows/${workflowId}/flow-inspector/retrigger`, {
      execIds,
      triggerNodeIds,
    });
  },
};
