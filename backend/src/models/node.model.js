const { db } = require('../config/db');

async function findByWorkflowId(workflowId) {
  return db('nodes').where({ workflow_id: workflowId }).orderBy('created_at', 'asc');
}

async function create({ workflowId, nodeType, name, positionX = 0, positionY = 0, config = {} }) {
  const [row] = await db('nodes')
    .insert({
      workflow_id: workflowId,
      node_type: nodeType,
      name,
      position_x: positionX,
      position_y: positionY,
      config,
    })
    .returning('*');
  return row;
}

async function update(id, fields) {
  const allowed = {};
  if (fields.name !== undefined) allowed.name = fields.name;
  if (fields.position_x !== undefined) allowed.position_x = fields.position_x;
  if (fields.position_y !== undefined) allowed.position_y = fields.position_y;
  if (fields.config !== undefined) allowed.config = fields.config;

  const [row] = await db('nodes').where({ id }).update(allowed).returning('*');
  return row;
}

async function remove(id) {
  await db('nodes').where({ id }).delete();
}

module.exports = { findByWorkflowId, create, update, remove };
