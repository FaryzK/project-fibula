const edgeModel = require('../models/edge.model');

async function list(req, res, next) {
  try {
    const edges = await edgeModel.findByWorkflowId(req.params.workflowId);
    res.json(edges);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { source_node_id, target_node_id, source_port, target_port } = req.body;
    if (!source_node_id || !target_node_id) {
      return res.status(400).json({ error: 'source_node_id and target_node_id are required' });
    }
    const edge = await edgeModel.create({
      workflowId: req.params.workflowId,
      sourceNodeId: source_node_id,
      sourcePort: source_port || 'default',
      targetNodeId: target_node_id,
      targetPort: target_port || 'default',
    });
    res.status(201).json(edge);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await edgeModel.remove(req.params.edgeId);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, remove };
