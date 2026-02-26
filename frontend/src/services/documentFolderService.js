import api from './api';

const documentFolderService = {
  list: () => api.get('/document-folders').then((r) => r.data),
  create: (payload) => api.post('/document-folders', payload).then((r) => r.data),
  getOne: (id) => api.get(`/document-folders/${id}`).then((r) => r.data),
  update: (id, payload) => api.patch(`/document-folders/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/document-folders/${id}`),
  listDocuments: (id) => api.get(`/document-folders/${id}/documents`).then((r) => r.data),
  sendOut: (folderId, heldId) =>
    api.post(`/document-folders/${folderId}/documents/${heldId}/send-out`).then((r) => r.data),
  deleteHeld: (folderId, heldId) =>
    api.delete(`/document-folders/${folderId}/documents/${heldId}`),
};

export default documentFolderService;
