import api from './api';

const reconciliationService = {
  list: () => api.get('/reconciliation-rules').then((r) => r.data),
  create: (payload) => api.post('/reconciliation-rules', payload).then((r) => r.data),
  getOne: (id) => api.get(`/reconciliation-rules/${id}`).then((r) => r.data),
  update: (id, payload) => api.patch(`/reconciliation-rules/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/reconciliation-rules/${id}`),

  // Matching sets (kept for existing pages)
  listMatchingSets: (id) =>
    api.get(`/reconciliation-rules/${id}/matching-sets`).then((r) => r.data),
  getMatchingSet: (ruleId, setId) =>
    api.get(`/reconciliation-rules/${ruleId}/matching-sets/${setId}`).then((r) => r.data),

  // New: Held documents pool
  listHeldDocs: () =>
    api.get('/reconciliation-rules/documents').then((r) => r.data),
  rejectDoc: (heldDocId) =>
    api.post(`/reconciliation-rules/documents/${heldDocId}/reject`),
  deleteDoc: (heldDocId) =>
    api.delete(`/reconciliation-rules/documents/${heldDocId}`),

  // New: Anchor docs per rule
  listAnchorDocs: (ruleId) =>
    api.get(`/reconciliation-rules/${ruleId}/anchor-docs`).then((r) => r.data),
  sendOutAnchor: (ruleId, anchorDocExecId) =>
    api.post(`/reconciliation-rules/${ruleId}/anchor-docs/${anchorDocExecId}/send-out`),

  // New: Comparison results
  listComparisonResults: (ruleId, setId) =>
    api.get(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/comparisons`).then((r) => r.data),
  forceReconcileComparison: (ruleId, setId, compId) =>
    api.post(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/comparisons/${compId}/force-reconcile`).then((r) => r.data),
  rerunComparisons: (ruleId, setId) =>
    api.post(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/rerun-comparisons`).then((r) => r.data),

  // Legacy set-level actions (kept for backward compat)
  forceReconcile: (ruleId, setId) =>
    api.post(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/force-reconcile`).then((r) => r.data),
  reject: (ruleId, setId) =>
    api.post(`/reconciliation-rules/${ruleId}/matching-sets/${setId}/reject`).then((r) => r.data),
};

export default reconciliationService;
