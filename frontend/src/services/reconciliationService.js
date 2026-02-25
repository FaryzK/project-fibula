import api from './api';

const reconciliationService = {
  list: () => api.get('/reconciliation-rules').then((r) => r.data),
  create: (payload) => api.post('/reconciliation-rules', payload).then((r) => r.data),
  getOne: (id) => api.get(`/reconciliation-rules/${id}`).then((r) => r.data),
  update: (id, payload) => api.patch(`/reconciliation-rules/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/reconciliation-rules/${id}`),
  listMatchingSets: (id) =>
    api.get(`/reconciliation-rules/${id}/matching-sets`).then((r) => r.data),
  getMatchingSet: (ruleId, setId) =>
    api.get(`/reconciliation-rules/${ruleId}/matching-sets/${setId}`).then((r) => r.data),
  forceReconcile: (ruleId, setId) =>
    api.post(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/force-reconcile`).then((r) => r.data),
  reject: (ruleId, setId) =>
    api.post(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/reject`).then((r) => r.data),
};

export default reconciliationService;
