import api from './api';

export default {
  uploadDocument(file) {
    const form = new FormData();
    form.append('file', file);
    return api.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // payload: { document_ids } or { entries: [{ document_ids, node_id }] }
  createRun(workflowId, payload) {
    return api.post(`/workflows/${workflowId}/runs`, payload);
  },

  getRuns(workflowId) {
    return api.get(`/workflows/${workflowId}/runs`);
  },

  getRun(runId) {
    return api.get(`/runs/${runId}`);
  },

  getExecutions(runId) {
    return api.get(`/runs/${runId}/executions`);
  },

  getNodeStatuses(runId) {
    return api.get(`/runs/${runId}/node-statuses`);
  },

  getNodeLog(runId, nodeId) {
    return api.get(`/runs/${runId}/nodes/${nodeId}/log`);
  },
};
