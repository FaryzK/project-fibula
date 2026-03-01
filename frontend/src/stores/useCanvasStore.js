import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import * as workflowService from '../services/workflowService';
import executionService from '../services/executionService';

// Maps DB rows → React Flow objects
function dbNodeToRF(n) {
  return {
    id: n.id,
    type: 'fibulaNode',
    position: { x: n.position_x, y: n.position_y },
    data: { label: n.name, nodeType: n.node_type, config: n.config },
  };
}

function dbEdgeToRF(e) {
  return {
    id: e.id,
    source: e.source_node_id,
    sourceHandle: e.source_port,
    target: e.target_node_id,
    targetHandle: e.target_port,
    type: 'default',
  };
}

// Anti-collision: find a free position starting from (x, y), stepping right then up
function findFreePosition(existingNodes, startX, startY, nodeW = 160, nodeH = 80, step = 200) {
  let x = startX;
  let y = startY;
  const maxAttempts = 50;

  for (let i = 0; i < maxAttempts; i++) {
    const collision = existingNodes.some(
      (n) =>
        Math.abs(n.position.x - x) < nodeW &&
        Math.abs(n.position.y - y) < nodeH
    );
    if (!collision) return { x, y };
    x += step;
    if (i > 0 && i % 5 === 0) {
      x = startX;
      y -= step;
    }
  }
  return { x, y };
}

const useCanvasStore = create((set, get) => ({
  workflowId: null,
  workflowName: '',
  isPublished: false,
  nodes: [],
  edges: [],
  loading: false,

  // Execution state
  activeRunId: null,
  runStatus: null,          // 'running' | 'completed' | 'failed' | null
  nodeStatuses: {},         // { [nodeId]: { statuses: [{status, count}] } }
  uploading: false,
  uploadError: null,
  pollInterval: null,

  loadWorkflow: async (workflowId) => {
    set({ loading: true });
    const [workflow, dbNodes, dbEdges] = await Promise.all([
      workflowService.getWorkflow(workflowId),
      workflowService.getNodes(workflowId),
      workflowService.getEdges(workflowId),
    ]);
    set({
      workflowId,
      workflowName: workflow.name,
      isPublished: workflow.is_published,
      nodes: dbNodes.map(dbNodeToRF),
      edges: dbEdges.map(dbEdgeToRF),
      loading: false,
    });
  },

  onNodesChange: (changes) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
  },

  onEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
  },

  // Called after drag ends — persist position to backend
  onNodeDragStop: async (_, node) => {
    const { workflowId } = get();
    await workflowService.updateNode(workflowId, node.id, {
      position_x: node.position.x,
      position_y: node.position.y,
    });
  },

  // Called when user draws a new edge
  onConnect: async (connection) => {
    const { workflowId } = get();
    const dbEdge = await workflowService.createEdge(workflowId, {
      source_node_id: connection.source,
      source_port: connection.sourceHandle || 'default',
      target_node_id: connection.target,
      target_port: connection.targetHandle || 'default',
    });
    set((s) => ({ edges: [...s.edges, dbEdgeToRF(dbEdge)] }));
  },

  // Add a node at center of viewport with anti-collision
  addNode: async (nodeType, nodeName, viewportCenter) => {
    const { workflowId, nodes } = get();
    const { x: startX, y: startY } = viewportCenter;
    const { x, y } = findFreePosition(nodes, startX, startY);

    const dbNode = await workflowService.createNode(workflowId, {
      node_type: nodeType,
      name: nodeName,
      position_x: x,
      position_y: y,
    });
    set((s) => ({ nodes: [...s.nodes, dbNodeToRF(dbNode)] }));
    return dbNode;
  },

  // Delete edge from canvas and backend
  deleteEdge: async (edgeId) => {
    const { workflowId } = get();
    await workflowService.deleteEdge(workflowId, edgeId);
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) }));
  },

  // Delete node from canvas and backend.
  // Returns { heldCount, unroutedCount } if the node has held/unrouted docs and force=false; null on success.
  deleteNode: async (nodeId, force = false) => {
    const { workflowId } = get();
    const result = await workflowService.deleteNode(workflowId, nodeId, force);
    if (result?.heldCount > 0 || result?.unroutedCount > 0) return result;
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    return null;
  },

  renameNode: async (nodeId, name) => {
    const { workflowId } = get();
    await workflowService.updateNode(workflowId, nodeId, { name });
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label: name } } : n
      ),
    }));
  },

  renameWorkflow: async (name) => {
    const { workflowId } = get();
    await workflowService.updateWorkflow(workflowId, { name });
    set({ workflowName: name });
  },

  togglePublish: async () => {
    const { workflowId, isPublished } = get();
    const updated = isPublished
      ? await workflowService.unpublishWorkflow(workflowId)
      : await workflowService.publishWorkflow(workflowId);
    set({ isPublished: updated.is_published });
  },

  // Upload files and trigger a workflow run.
  // entries: [{ files: FileList|File[], nodeId: string }]
  // If a single entry has nodeId=null it uses the legacy flat document_ids path.
  triggerRun: async (entries) => {
    const { workflowId } = get();
    set({ uploading: true, uploadError: null });
    try {
      // Upload all files for all entries in parallel, preserving nodeId association
      const uploadedEntries = await Promise.all(
        entries.map(async ({ files, nodeId }) => {
          const docIds = await Promise.all(
            Array.from(files).map((f) => executionService.uploadDocument(f).then((r) => r.data.id))
          );
          return { document_ids: docIds, node_id: nodeId };
        })
      );

      // Build request payload
      const allHaveNodes = uploadedEntries.every((e) => e.node_id);
      const payload = allHaveNodes
        ? { entries: uploadedEntries }
        : { document_ids: uploadedEntries.flatMap((e) => e.document_ids) };

      // Create run
      const { data: run } = await executionService.createRun(workflowId, payload);
      set({ activeRunId: run.id, runStatus: 'running', nodeStatuses: {}, uploading: false });

      // Start polling for status
      get()._startPolling(run.id);
    } catch (err) {
      set({ uploading: false, uploadError: err.message || 'Upload failed' });
    }
  },

  _startPolling: (runId) => {
    const { pollInterval } = get();
    if (pollInterval) clearInterval(pollInterval);

    const doPoll = async () => {
      try {
        const [runRes, statusRes] = await Promise.all([
          executionService.getRun(runId),
          executionService.getNodeStatuses(runId),
        ]);

        // Build nodeStatuses map: { [nodeId]: [{status, count}] }
        const nodeStatuses = {};
        for (const item of statusRes.data) {
          if (!nodeStatuses[item.node_id]) nodeStatuses[item.node_id] = [];
          nodeStatuses[item.node_id].push({ status: item.status, count: Number(item.count), output_port: item.output_port || null });
        }

        set({ runStatus: runRes.data.status, nodeStatuses });

        if (runRes.data.status !== 'running') {
          clearInterval(interval);
          set({ pollInterval: null });
        }
      } catch (_) {
        // Silently ignore polling errors
      }
    };

    // Poll immediately so fast nodes (categorisation) still get their status captured
    doPoll();
    const interval = setInterval(doPoll, 2000);

    set({ pollInterval: interval });
  },

  clearRun: () => {
    const { pollInterval } = get();
    if (pollInterval) clearInterval(pollInterval);
    set({ activeRunId: null, runStatus: null, nodeStatuses: {}, pollInterval: null, uploadError: null });
  },
}));

export default useCanvasStore;
