const nodeModel = require('../models/node.model');
const workflowModel = require('../models/workflow.model');
const documentExecutionModel = require('../models/documentExecution.model');

async function list(req, res, next) {
  try {
    const nodes = await nodeModel.findByWorkflowId(req.params.workflowId);
    res.json(nodes);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { node_type, name, position_x, position_y, config } = req.body;
    if (!node_type) return res.status(400).json({ error: 'node_type is required' });
    const node = await nodeModel.create({
      workflowId: req.params.workflowId,
      nodeType: node_type,
      name: name || node_type,
      positionX: position_x,
      positionY: position_y,
      config,
    });
    res.status(201).json(node);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    // When an EXTRACTOR node's extractor_id is changed, orphan held docs from the old extractor
    if (req.body.config && req.body.config.extractor_id) {
      const currentNode = await nodeModel.findById(req.params.nodeId);
      if (currentNode && currentNode.node_type === 'EXTRACTOR') {
        const oldExtractorId = currentNode.config && currentNode.config.extractor_id;
        const newExtractorId = req.body.config.extractor_id;
        if (oldExtractorId && oldExtractorId !== newExtractorId) {
          await documentExecutionModel.orphanExtractorHeldDocs(
            req.params.nodeId,
            oldExtractorId,
            currentNode.name
          );
        }
      }
    }
    const updated = await nodeModel.update(req.params.nodeId, req.body);
    res.json(updated);
  } catch (err) { next(err); }
}

// DELETE /api/workflows/:workflowId/nodes/:nodeId
// Without ?force=true: returns 409 if the node has held documents (frontend shows warning).
// With ?force=true: orphans held documents then deletes the node.
async function remove(req, res, next) {
  try {
    const { nodeId } = req.params;
    const force = req.query.force === 'true';

    const heldCount = await documentExecutionModel.countHeldAtNode(nodeId);

    if (heldCount > 0 && !force) {
      return res.status(409).json({ heldCount });
    }

    if (heldCount > 0) {
      const node = await nodeModel.findById(nodeId);
      await documentExecutionModel.orphanHeldDocs(nodeId, node?.name || 'Deleted node');
    }

    await nodeModel.remove(nodeId);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
