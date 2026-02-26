import api from './api';

const extractorService = {
  list: () => api.get('/extractors').then((r) => r.data),
  create: (payload) => api.post('/extractors', payload).then((r) => r.data),
  getOne: (id) => api.get(`/extractors/${id}`).then((r) => r.data),
  update: (id, payload) => api.patch(`/extractors/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/extractors/${id}`),
  listHeld: (id) => api.get(`/extractors/${id}/held`).then((r) => r.data),
  sendOut: (extractorId, heldId) =>
    api.post(`/extractors/${extractorId}/held/${heldId}/send-out`).then((r) => r.data),
  listFeedback: (id) => api.get(`/extractors/${id}/feedback`).then((r) => r.data),
  createFeedback: (id, payload) =>
    api.post(`/extractors/${id}/feedback`, payload).then((r) => r.data),
  deleteFeedback: (extractorId, feedbackId) =>
    api.delete(`/extractors/${extractorId}/feedback/${feedbackId}`),
  testExtract: (extractorId, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/extractors/${extractorId}/test-extract`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export default extractorService;
