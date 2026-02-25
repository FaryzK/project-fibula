const nodeModel = require('../models/node.model');
const workflowModel = require('../models/workflow.model');

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
    const updated = await nodeModel.update(req.params.nodeId, req.body);
    res.json(updated);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await nodeModel.remove(req.params.nodeId);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
