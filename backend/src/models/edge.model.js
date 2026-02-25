const { db } = require('../config/db');

async function findByWorkflowId(workflowId) {
  return db('edges').where({ workflow_id: workflowId });
}

async function create({ workflowId, sourceNodeId, sourcePort = 'default', targetNodeId, targetPort = 'default' }) {
  const [row] = await db('edges')
    .insert({
      workflow_id: workflowId,
      source_node_id: sourceNodeId,
      source_port: sourcePort,
      target_node_id: targetNodeId,
      target_port: targetPort,
    })
    .returning('*');
  return row;
}

async function remove(id) {
  await db('edges').where({ id }).delete();
}

module.exports = { findByWorkflowId, create, remove };
