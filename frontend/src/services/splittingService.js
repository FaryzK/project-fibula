import api from './api';

export default {
  getAll: () => api.get('/splitting-instructions'),
  getOne: (id) => api.get(`/splitting-instructions/${id}`),
  create: (data) => api.post('/splitting-instructions', data),
  update: (id, data) => api.patch(`/splitting-instructions/${id}`, data),
  remove: (id) => api.delete(`/splitting-instructions/${id}`),
};
