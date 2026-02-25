import api from './api';

export default {
  getAll: () => api.get('/categorisation-prompts'),
  getOne: (id) => api.get(`/categorisation-prompts/${id}`),
  create: (data) => api.post('/categorisation-prompts', data),
  update: (id, data) => api.patch(`/categorisation-prompts/${id}`, data),
  remove: (id) => api.delete(`/categorisation-prompts/${id}`),
};
