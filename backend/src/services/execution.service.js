const workflowRunModel = require('../models/workflowRun.model');
const documentExecutionModel = require('../models/documentExecution.model');
const documentModel = require('../models/document.model');
const nodeModel = require('../models/node.model');
const edgeModel = require('../models/edge.model');
const splittingInstructionModel = require('../models/splittingInstruction.model');
const categorisationPromptModel = require('../models/categorisationPrompt.model');
const splittingService = require('./splitting.service');
const categorisationService = require('./categorisation.service');

/**
 * Build an adjacency map: { sourceNodeId: [{ targetNodeId, sourcePort, targetPort }] }
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

function findEntryNodes(nodes, edges) {
  const hasIncoming = new Set(edges.map((e) => e.target_node_id));
  return nodes.filter((n) => !hasIncoming.has(n.id));
}

/**
 * Process a single node.
 * Returns one of:
 *   { type: 'continue', outputMetadata, outputPort }
 *   { type: 'fanout', subDocuments: [{file_url, file_name, file_type, label}] }
 */
async function processNode(node, metadata, workflowRunId) {
  const config = node.config || {};

  switch (node.node_type) {
    case 'SPLITTING': {
      if (!config.splitting_instruction_id) {
        // No instruction configured — pass through
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const instruction = await splittingInstructionModel.findById(config.splitting_instruction_id);
      if (!instruction) {
        throw new Error(`Splitting instruction ${config.splitting_instruction_id} not found`);
      }
      const document = await documentModel.findById(metadata.document_id);
      if (!document) {
        throw new Error(`Document ${metadata.document_id} not found`);
      }
      const subDocuments = await splittingService.processDocument(document, instruction.instructions);
      return { type: 'fanout', subDocuments };
    }

    case 'CATEGORISATION': {
      if (!config.categorisation_prompt_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const prompt = await categorisationPromptModel.findById(config.categorisation_prompt_id);
      if (!prompt || !prompt.labels || prompt.labels.length === 0) {
        throw new Error(`Categorisation prompt ${config.categorisation_prompt_id} not found or has no labels`);
      }
      const document = await documentModel.findById(metadata.document_id);
      if (!document) {
        throw new Error(`Document ${metadata.document_id} not found`);
      }
      const category = await categorisationService.classifyDocument(document, prompt.labels);
      return {
        type: 'continue',
        outputMetadata: { ...metadata, category },
        outputPort: category,
      };
    }

    default:
      // Pass-through for all other node types (IF, SWITCH, etc. — implemented in later phases)
      return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
  }
}

/**
 * Run a single document execution through the workflow graph.
 * pendingExecQueue is a mutable array — fan-outs push new docExecs into it.
 */
async function runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const entryNodes = findEntryNodes(nodes, edges);

  // BFS queue: { nodeId, metadata }
  const queue = entryNodes.map((n) => ({
    nodeId: n.id,
    metadata: JSON.parse(docExecution.metadata || '{}'),
  }));

  while (queue.length > 0) {
    const { nodeId, metadata } = queue.shift();
    const node = nodeMap[nodeId];
    if (!node) continue;

    const log = await documentExecutionModel.createLog({
      documentExecutionId: docExecution.id,
      nodeId,
      status: 'processing',
      inputMetadata: metadata,
    });

    await documentExecutionModel.updateStatus(docExecution.id, {
      status: 'processing',
      currentNodeId: nodeId,
    });

    let result;
    let logStatus = 'completed';
    let logError = null;

    try {
      result = await processNode(node, metadata, workflowRunId);
    } catch (err) {
      logStatus = 'failed';
      logError = err.message;
      result = { type: 'continue', outputMetadata: metadata, outputPort: 'default' };
    }

    await documentExecutionModel.updateLog(log.id, {
      status: logStatus,
      outputMetadata: result.outputMetadata || metadata,
      error: logError,
    });

    if (logStatus === 'failed') {
      await documentExecutionModel.updateStatus(docExecution.id, { status: 'failed', currentNodeId: null });
      return;
    }

    if (result.type === 'fanout') {
      // Mark this execution as completed at this node
      await documentExecutionModel.updateStatus(docExecution.id, {
        status: 'completed',
        currentNodeId: null,
      });

      // Create new document records + executions for each sub-document
      for (const subDoc of result.subDocuments) {
        const newDoc = await documentModel.create({
          userId: null, // sub-documents created by system
          fileName: subDoc.file_name,
          fileUrl: subDoc.file_url,
          fileType: subDoc.file_type,
        });

        const newExec = await documentExecutionModel.createMany(workflowRunId, [newDoc.id]);

        // Enqueue sub-doc executions with the outgoing edges from the splitting node
        const nextNodes = (graph[nodeId] || []).map((e) => ({
          nodeId: e.targetNodeId,
          metadata: { document_id: newDoc.id, label: subDoc.label },
        }));

        // Push as a new document execution to be processed after current one
        pendingExecQueue.push({
          docExecution: newExec[0],
          startQueue: nextNodes,
        });
      }
      return; // current doc execution done
    }

    // Normal continue — follow output port edges
    const { outputMetadata, outputPort } = result;
    const nextEdges = (graph[nodeId] || []).filter(
      (e) => e.sourcePort === outputPort || outputPort === 'default'
    );
    for (const edge of nextEdges) {
      queue.push({ nodeId: edge.targetNodeId, metadata: outputMetadata });
    }
  }

  await documentExecutionModel.updateStatus(docExecution.id, {
    status: 'completed',
    currentNodeId: null,
  });
}

/**
 * Main entry point. Handles fan-outs from splitting nodes.
 */
async function runWorkflow(workflowRunId) {
  const run = await workflowRunModel.findById(workflowRunId);
  if (!run) throw new Error(`Run ${workflowRunId} not found`);

  const [nodes, edges, initialExecs] = await Promise.all([
    nodeModel.findByWorkflowId(run.workflow_id),
    edgeModel.findByWorkflowId(run.workflow_id),
    documentExecutionModel.findByRunId(workflowRunId),
  ]);

  const graph = buildGraph(edges);

  // pendingExecQueue can grow when splitting fan-outs happen
  const pendingExecQueue = initialExecs.map((e) => ({ docExecution: e, startQueue: null }));

  while (pendingExecQueue.length > 0) {
    const { docExecution, startQueue } = pendingExecQueue.shift();
    await runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue);
  }

  const allExecs = await documentExecutionModel.findByRunId(workflowRunId);
  const anyFailed = allExecs.some((e) => e.status === 'failed');
  await workflowRunModel.updateStatus(workflowRunId, anyFailed ? 'failed' : 'completed', new Date());
}

module.exports = { runWorkflow };
