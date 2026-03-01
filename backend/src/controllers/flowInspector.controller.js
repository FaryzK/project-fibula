const nodeModel = require('../models/node.model');
const edgeModel = require('../models/edge.model');
const documentExecutionModel = require('../models/documentExecution.model');
const workflowRunModel = require('../models/workflowRun.model');
const executionService = require('../services/execution.service');

// Kahn's algorithm — returns node IDs in topological order
function topoSort(nodes, edges) {
  const inDegree = {};
  const adj = {};
  for (const n of nodes) {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  }
  for (const e of edges) {
    if (adj[e.source_node_id]) adj[e.source_node_id].push(e.target_node_id);
    inDegree[e.target_node_id] = (inDegree[e.target_node_id] || 0) + 1;
  }
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const result = [];
  while (queue.length > 0) {
    const id = queue.shift();
    result.push(id);
    for (const neighbor of (adj[id] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }
  // Append any nodes not reached (isolated or in cycles)
  const seen = new Set(result);
  for (const n of nodes) {
    if (!seen.has(n.id)) result.push(n.id);
  }
  return result;
}

// GET /api/workflows/:workflowId/flow-inspector/summary
async function getSummary(req, res, next) {
  try {
    const { workflowId } = req.params;
    const [nodes, edges, { liveRows, failedRows }] = await Promise.all([
      nodeModel.findByWorkflowId(workflowId),
      edgeModel.findByWorkflowId(workflowId),
      documentExecutionModel.getFlowInspectorSummary(workflowId),
    ]);

    const processingCount = {};
    const heldCount = {};
    const unroutedCount = {};
    const failedCount = {};
    for (const row of liveRows) {
      if (row.status === 'processing') processingCount[row.node_id] = Number(row.count);
      else if (row.status === 'held') heldCount[row.node_id] = Number(row.count);
      else if (row.status === 'unrouted') unroutedCount[row.node_id] = Number(row.count);
    }
    for (const row of failedRows) {
      failedCount[row.node_id] = Number(row.count);
    }

    const order = topoSort(nodes, edges);
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const result = order
      .map((id) => nodeMap[id])
      .filter(Boolean)
      .map((n) => ({
        id: n.id,
        name: n.name,
        node_type: n.node_type,
        config: n.config,
        processing: processingCount[n.id] || 0,
        held: heldCount[n.id] || 0,
        unrouted: unroutedCount[n.id] || 0,
        failed: failedCount[n.id] || 0,
      }));

    res.json(result);
  } catch (err) { next(err); }
}

// GET /api/workflows/:workflowId/flow-inspector/nodes/:nodeId/documents?tab=processing|held|failed|unrouted&port=<portId>
async function getNodeDocuments(req, res, next) {
  try {
    const { workflowId, nodeId } = req.params;
    const { tab = 'processing', port } = req.query;

    let docs;
    if (tab === 'failed') {
      docs = await documentExecutionModel.getNodeFailedDocs(workflowId, nodeId);
    } else if (tab === 'unrouted') {
      if (!port) return res.status(400).json({ error: 'port is required for unrouted tab' });
      docs = await documentExecutionModel.getNodeUnroutedDocs(workflowId, nodeId, port);
    } else {
      docs = await documentExecutionModel.getNodeLiveDocs(workflowId, nodeId, tab);
    }
    res.json(docs);
  } catch (err) { next(err); }
}

// GET /api/workflows/:workflowId/flow-inspector/orphaned
async function getOrphaned(req, res, next) {
  try {
    const docs = await documentExecutionModel.getOrphanedDocs(req.params.workflowId);
    res.json(docs);
  } catch (err) { next(err); }
}

// GET /api/workflows/:workflowId/flow-inspector/nodes/:nodeId/unrouted-count?port=<portId>
async function getUnroutedCount(req, res, next) {
  try {
    const { nodeId } = req.params;
    const { port } = req.query;
    const count = port
      ? await documentExecutionModel.countUnroutedAtPort(nodeId, port)
      : await documentExecutionModel.countUnroutedAtNode(nodeId);
    res.json({ count });
  } catch (err) { next(err); }
}

// DELETE /api/workflows/:workflowId/flow-inspector/documents/:execId
async function deleteDocument(req, res, next) {
  try {
    await documentExecutionModel.deleteExecution(req.params.execId);
    res.status(204).send();
  } catch (err) { next(err); }
}

// POST /api/workflows/:workflowId/flow-inspector/retrigger
// Body: { execIds: [...], triggerNodeIds: [...] }
async function retrigger(req, res, next) {
  try {
    const { workflowId } = req.params;
    const { execIds, triggerNodeIds } = req.body;

    if (!execIds?.length || !triggerNodeIds?.length) {
      return res.status(400).json({ error: 'execIds and triggerNodeIds are required' });
    }

    // Resolve document IDs from execution records
    const execRecords = await Promise.all(execIds.map((id) => documentExecutionModel.findById(id)));
    const validDocIds = execRecords.filter(Boolean).map((e) => e.document_id).filter(Boolean);

    if (validDocIds.length === 0) {
      return res.status(400).json({ error: 'No valid documents found' });
    }

    // Build one entry per (triggerNode × doc).
    // Branch naming is baked into the document record's file_name (e.g. invoice(1).pdf),
    // so no branch metadata needs to be preserved — the new run reads the file name directly.
    const entries = triggerNodeIds.flatMap((nodeId) =>
      validDocIds.map((docId) => ({ docId, startNodeId: nodeId }))
    );

    const run = await workflowRunModel.create({ workflowId, triggeredBy: 'RETRIGGER' });
    await documentExecutionModel.createMany(run.id, entries);

    // Remove source executions from the Orphaned / Unrouted panels now that they have been re-triggered
    await documentExecutionModel.markRetriggered(execIds);

    executionService.runWorkflow(run.id).catch((err) => {
      console.error(`retrigger runWorkflow failed for run ${run.id}:`, err);
    });

    res.status(201).json({ runId: run.id });
  } catch (err) { next(err); }
}

// POST /api/workflows/:workflowId/flow-inspector/send-out
// Body: { execIds: [...], nodeId, portId }
// Resumes unrouted documents from the downstream node connected to the given output port.
async function sendOut(req, res, next) {
  try {
    const { workflowId } = req.params;
    const { execIds, nodeId, portId } = req.body;

    if (!execIds?.length || !nodeId || !portId) {
      return res.status(400).json({ error: 'execIds, nodeId, and portId are required' });
    }

    // Check that the port has at least one connected edge
    const edges = await edgeModel.findByWorkflowId(workflowId);
    const outEdges = edges.filter(
      (e) => e.source_node_id === nodeId && (e.source_port === portId || portId === 'default')
    );

    if (outEdges.length === 0) {
      return res.status(409).json({ error: 'port_not_connected' });
    }

    // Resume each document execution asynchronously
    for (const execId of execIds) {
      const execRecord = await documentExecutionModel.findById(execId);
      if (!execRecord || execRecord.status !== 'unrouted') continue;

      executionService.resumeDocumentExecution(
        execId,
        nodeId,
        execRecord.workflow_run_id,
        portId,
      ).catch((err) => {
        console.error(`sendOut resumeDocumentExecution failed for exec ${execId}:`, err);
      });
    }

    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { getSummary, getNodeDocuments, getOrphaned, getUnroutedCount, deleteDocument, retrigger, sendOut };
