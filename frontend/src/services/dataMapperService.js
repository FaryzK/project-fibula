import api from './api';

const dataMapperService = {
  // Data Map Sets
  listSets: () => api.get('/data-map-sets').then((r) => r.data),
  createSet: (payload) => api.post('/data-map-sets', payload).then((r) => r.data),
  createSetFromUpload: (formData) =>
    api.post('/data-map-sets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  getSet: (id, params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.pageSize) q.set('pageSize', params.pageSize);
    if (params.filters) q.set('filters', JSON.stringify(params.filters));
    const qs = q.toString();
    return api.get(`/data-map-sets/${id}${qs ? '?' + qs : ''}`).then((r) => r.data);
  },
  updateSet: (id, payload) => api.patch(`/data-map-sets/${id}`, payload).then((r) => r.data),
  removeSet: (id) => api.delete(`/data-map-sets/${id}`),
  getSetUsage: (id) => api.get(`/data-map-sets/${id}/usage`).then((r) => r.data),
  downloadSet: async (id, fileName) => {
    const res = await api.get(`/data-map-sets/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'data-map-set.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  addRecords: (id, formData) =>
    api.post(`/data-map-sets/${id}/records`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  addRecordsJson: (id, records) =>
    api.post(`/data-map-sets/${id}/records`, { records }).then((r) => r.data),
  removeRecord: (setId, recordId) =>
    api.delete(`/data-map-sets/${setId}/records/${recordId}`),
  updateRecord: (setId, recordId, values) =>
    api.patch(`/data-map-sets/${setId}/records/${recordId}`, { values }).then((r) => r.data),

  // Data Map Rules
  listRules: () => api.get('/data-map-rules').then((r) => r.data),
  createRule: (payload) => api.post('/data-map-rules', payload).then((r) => r.data),
  getRule: (id) => api.get(`/data-map-rules/${id}`).then((r) => r.data),
  updateRule: (id, payload) => api.patch(`/data-map-rules/${id}`, payload).then((r) => r.data),
  removeRule: (id) => api.delete(`/data-map-rules/${id}`),
};

export default dataMapperService;
