const workflowRunModel = require('../models/workflowRun.model');
const documentExecutionModel = require('../models/documentExecution.model');
const nodeModel = require('../models/node.model');
const edgeModel = require('../models/edge.model');

/**
 * Build an adjacency map from edges: { sourceNodeId: [{ targetNodeId, sourcePort, targetPort }] }
 */
function buildGraph(edges) {
  const graph = {};
  for (const edge of edges) {
    if (!graph[edge.source_node_id]) graph[edge.source_node_id] = [];
    graph[edge.source_node_id].push({
      targetNodeId: edge.target_node_id,
      sourcePort: edge.source_port,
      targetPort: edge.target_port,
    });
  }
  return graph;
}

/**
 * Find entry nodes (nodes with no incoming edges).
 */
function findEntryNodes(nodes, edges) {
  const hasIncoming = new Set(edges.map((e) => e.target_node_id));
  return nodes.filter((n) => !hasIncoming.has(n.id));
}

/**
 * Process a single document through a single node.
 * For Phase 4, all nodes are pass-through (no LLM calls yet).
 * Returns { outputMetadata, outputPort } where outputPort is the port to follow.
 */
async function processNode(node, metadata) {
  // Phase 4: all node types are pass-through, just forward metadata as-is
  // Later phases will add real logic per node_type
  return { outputMetadata: { ...metadata }, outputPort: 'default' };
}

/**
 * Run a single document execution through the workflow graph.
 */
async function runDocument(docExecution, nodes, edges, graph) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const entryNodes = findEntryNodes(nodes, edges);

  // BFS queue: { nodeId, metadata }
  let queue = entryNodes.map((n) => ({ nodeId: n.id, metadata: JSON.parse(docExecution.metadata || '{}') }));

  while (queue.length > 0) {
    const { nodeId, metadata } = queue.shift();
    const node = nodeMap[nodeId];
    if (!node) continue;

    // Log start
    const log = await documentExecutionModel.createLog({
      documentExecutionId: docExecution.id,
      nodeId,
      status: 'processing',
      inputMetadata: metadata,
    });

    // Update doc execution current node
    await documentExecutionModel.updateStatus(docExecution.id, {
      status: 'processing',
      currentNodeId: nodeId,
    });

    let outputMetadata = metadata;
    let outputPort = 'default';
    let logStatus = 'completed';
    let logError = null;

    try {
      const result = await processNode(node, metadata);
      outputMetadata = result.outputMetadata;
      outputPort = result.outputPort;
    } catch (err) {
      logStatus = 'failed';
      logError = err.message;
    }

    // Update log
    await documentExecutionModel.updateLog(log.id, {
      status: logStatus,
      outputMetadata,
      error: logError,
    });

    if (logStatus === 'failed') {
      await documentExecutionModel.updateStatus(docExecution.id, { status: 'failed', currentNodeId: null });
      return;
    }

    // Find next nodes via output port
    const nextEdges = (graph[nodeId] || []).filter((e) => e.sourcePort === outputPort || outputPort === 'default');
    for (const edge of nextEdges) {
      queue.push({ nodeId: edge.targetNodeId, metadata: outputMetadata });
    }
  }

  // All nodes processed — mark complete
  await documentExecutionModel.updateStatus(docExecution.id, {
    status: 'completed',
    currentNodeId: null,
  });
}

/**
 * Main entry point called by the run controller.
 * Runs all document executions in a workflow run.
 */
async function runWorkflow(workflowRunId) {
  const run = await workflowRunModel.findById(workflowRunId);
  if (!run) throw new Error(`Run ${workflowRunId} not found`);

  const [nodes, edges, docExecutions] = await Promise.all([
    nodeModel.findByWorkflowId(run.workflow_id),
    edgeModel.findByWorkflowId(run.workflow_id),
    documentExecutionModel.findByRunId(workflowRunId),
  ]);

  const graph = buildGraph(edges);

  // Run all document executions sequentially (can parallelise later)
  for (const docExec of docExecutions) {
    await runDocument(docExec, nodes, edges, graph);
  }

  // Mark run complete
  const allExecs = await documentExecutionModel.findByRunId(workflowRunId);
  const anyFailed = allExecs.some((e) => e.status === 'failed');
  await workflowRunModel.updateStatus(workflowRunId, anyFailed ? 'failed' : 'completed', new Date());
}

module.exports = { runWorkflow };
