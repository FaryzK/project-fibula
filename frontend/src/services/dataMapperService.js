import api from './api';

const dataMapperService = {
  // Data Map Sets
  listSets: () => api.get('/data-map-sets').then((r) => r.data),
  createSet: (payload) => api.post('/data-map-sets', payload).then((r) => r.data),
  getSet: (id) => api.get(`/data-map-sets/${id}`).then((r) => r.data),
  updateSet: (id, payload) => api.patch(`/data-map-sets/${id}`, payload).then((r) => r.data),
  removeSet: (id) => api.delete(`/data-map-sets/${id}`),

  // Data Map Rules
  listRules: () => api.get('/data-map-rules').then((r) => r.data),
  createRule: (payload) => api.post('/data-map-rules', payload).then((r) => r.data),
  getRule: (id) => api.get(`/data-map-rules/${id}`).then((r) => r.data),
  updateRule: (id, payload) => api.patch(`/data-map-rules/${id}`, payload).then((r) => r.data),
  removeRule: (id) => api.delete(`/data-map-rules/${id}`),
};

export default dataMapperService;
