const { db } = require('../config/db');

const TABLE = 'workflow_runs';

module.exports = {
  async create({ workflowId, triggeredBy }) {
    const [row] = await db(TABLE)
      .insert({
        workflow_id: workflowId,
        triggered_by: triggeredBy,
        status: 'running',
      })
      .returning('*');
    return row;
  },

  async findById(id) {
    return db(TABLE).where({ id }).first();
  },

  async findByWorkflowId(workflowId) {
    return db(TABLE).where({ workflow_id: workflowId }).orderBy('started_at', 'desc');
  },

  async updateStatus(id, status, completedAt = null) {
    const update = { status };
    if (completedAt) update.completed_at = completedAt;
    const [row] = await db(TABLE).where({ id }).update(update).returning('*');
    return row;
  },
};
