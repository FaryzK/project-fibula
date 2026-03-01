import api from './api';

export default {
  getSummary(workflowId) {
    return api.get(`/workflows/${workflowId}/flow-inspector/summary`);
  },

  getNodeDocuments(workflowId, nodeId, tab, port = null) {
    const params = { tab };
    if (tab === 'unrouted' && port) params.port = port;
    return api.get(`/workflows/${workflowId}/flow-inspector/nodes/${nodeId}/documents`, { params });
  },

  getUnroutedCount(workflowId, nodeId, port = null) {
    const params = port ? { port } : {};
    return api.get(`/workflows/${workflowId}/flow-inspector/nodes/${nodeId}/unrouted-count`, { params });
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

  sendOut(workflowId, execIds, nodeId, portId) {
    return api.post(`/workflows/${workflowId}/flow-inspector/send-out`, {
      execIds,
      nodeId,
      portId,
    });
  },
};
