import api from './api';

export async function getWorkflows() {
  const res = await api.get('/workflows');
  return res.data;
}

export async function createWorkflow(name) {
  const res = await api.post('/workflows', { name });
  return res.data;
}

export async function getWorkflow(id) {
  const res = await api.get(`/workflows/${id}`);
  return res.data;
}

export async function updateWorkflow(id, fields) {
  const res = await api.patch(`/workflows/${id}`, fields);
  return res.data;
}

export async function deleteWorkflow(id) {
  await api.delete(`/workflows/${id}`);
}

export async function publishWorkflow(id) {
  const res = await api.patch(`/workflows/${id}/publish`);
  return res.data;
}

export async function unpublishWorkflow(id) {
  const res = await api.patch(`/workflows/${id}/unpublish`);
  return res.data;
}

export async function getNodes(workflowId) {
  const res = await api.get(`/workflows/${workflowId}/nodes`);
  return res.data;
}

export async function createNode(workflowId, node) {
  const res = await api.post(`/workflows/${workflowId}/nodes`, node);
  return res.data;
}

export async function updateNode(workflowId, nodeId, fields) {
  const res = await api.patch(`/workflows/${workflowId}/nodes/${nodeId}`, fields);
  return res.data;
}

export async function deleteNode(workflowId, nodeId, force = false) {
  const url = `/workflows/${workflowId}/nodes/${nodeId}${force ? '?force=true' : ''}`;
  try {
    await api.delete(url);
    return null;
  } catch (err) {
    if (err.response?.status === 409) {
      return { heldCount: err.response.data.heldCount || 0, unroutedCount: err.response.data.unroutedCount || 0 };
    }
    throw err;
  }
}

export async function getEdges(workflowId) {
  const res = await api.get(`/workflows/${workflowId}/edges`);
  return res.data;
}

export async function createEdge(workflowId, edge) {
  const res = await api.post(`/workflows/${workflowId}/edges`, edge);
  return res.data;
}

export async function deleteEdge(workflowId, edgeId) {
  await api.delete(`/workflows/${workflowId}/edges/${edgeId}`);
}
