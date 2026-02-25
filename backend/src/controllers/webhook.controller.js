const nodeModel = require('../models/node.model');
const workflowRunModel = require('../models/workflowRun.model');
const documentExecutionModel = require('../models/documentExecution.model');
const { runWorkflow } = require('../services/execution.service');

/**
 * POST /api/webhooks/:nodeId/trigger
 * No auth required — inbound webhook from external systems.
 *
 * JSON body → metadata; multipart with file → metadata + document file.
 */
async function trigger(req, res) {
  const { nodeId } = req.params;

  const node = await nodeModel.findById(nodeId);
  if (!node) return res.status(404).json({ error: 'Webhook node not found' });
  if (node.node_type !== 'WEBHOOK') {
    return res.status(400).json({ error: 'Node is not a WEBHOOK type' });
  }

  const payload = req.body || {};

  // Create a workflow run
  const run = await workflowRunModel.create({
    workflowId: node.workflow_id,
    triggeredBy: 'WEBHOOK',
  });

  // Create the initial document execution with payload as metadata
  // webhook payloads become the starting metadata; no document file
  const exec = await documentExecutionModel.create({
    workflowRunId: run.id,
    documentId: null,
    metadata: JSON.stringify({ ...payload, _webhook_node_id: nodeId }),
  });

  // Run fire-and-forget
  runWorkflow(run.id).catch(() => {});

  return res.status(202).json({ run_id: run.id, execution_id: exec.id });
}

module.exports = { trigger };
