const workflowModel = require('../models/workflow.model');

async function list(req, res, next) {
  try {
    const workflows = await workflowModel.findByUserId(req.dbUser.id);
    res.json(workflows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const workflow = await workflowModel.create({ userId: req.dbUser.id, name });
    res.status(201).json(workflow);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const workflow = await workflowModel.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const workflow = await workflowModel.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const updated = await workflowModel.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const workflow = await workflowModel.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    await workflowModel.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function publish(req, res, next) {
  try {
    const workflow = await workflowModel.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const updated = await workflowModel.setPublished(req.params.id, true);
    res.json(updated);
  } catch (err) { next(err); }
}

async function unpublish(req, res, next) {
  try {
    const workflow = await workflowModel.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const updated = await workflowModel.setPublished(req.params.id, false);
    res.json(updated);
  } catch (err) { next(err); }
}

module.exports = { list, create, getOne, update, remove, publish, unpublish };
