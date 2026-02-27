const { db } = require('../config/db');

const TABLE = 'document_executions';
const LOG_TABLE = 'node_execution_logs';

module.exports = {
  async create({ workflowRunId, documentId, metadata = '{}' }) {
    const [row] = await db(TABLE)
      .insert({
        workflow_run_id: workflowRunId,
        document_id: documentId || null,
        status: 'pending',
        metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      })
      .returning('*');
    return row;
  },

  // entries: [{ docId, startNodeId? }] — or legacy: plain string array
  async createMany(workflowRunId, entries) {
    const rows = entries.map((entry) => {
      const docId = typeof entry === 'string' ? entry : entry.docId;
      const startNodeId = typeof entry === 'string' ? null : (entry.startNodeId || null);
      return {
        workflow_run_id: workflowRunId,
        document_id: docId,
        start_node_id: startNodeId,
        status: 'pending',
        metadata: JSON.stringify({}),
      };
    });
    return db(TABLE).insert(rows).returning('*');
  },

  async findById(id) {
    return db(TABLE).where({ id }).first();
  },

  async findByRunId(workflowRunId) {
    return db(TABLE).where({ workflow_run_id: workflowRunId }).orderBy('created_at', 'asc');
  },

  async updateStatus(id, { status, currentNodeId, metadata }) {
    const update = { status };
    if (currentNodeId !== undefined) update.current_node_id = currentNodeId;
    if (metadata !== undefined) update.metadata = JSON.stringify(metadata);
    update.updated_at = db.fn.now();
    const [row] = await db(TABLE).where({ id }).update(update).returning('*');
    return row;
  },

  // Returns [{node_id, status, count}] for the canvas overlay
  async getNodeStatusSummary(workflowRunId) {
    return db(LOG_TABLE)
      .join(TABLE, `${LOG_TABLE}.document_execution_id`, `${TABLE}.id`)
      .where(`${TABLE}.workflow_run_id`, workflowRunId)
      .select(`${LOG_TABLE}.node_id`, `${LOG_TABLE}.status`)
      .count('* as count')
      .groupBy(`${LOG_TABLE}.node_id`, `${LOG_TABLE}.status`);
  },

  // Log a node execution step
  async createLog({ documentExecutionId, nodeId, status, inputMetadata, outputMetadata, error }) {
    const [row] = await db(LOG_TABLE)
      .insert({
        document_execution_id: documentExecutionId,
        node_id: nodeId,
        status,
        input_metadata: JSON.stringify(inputMetadata || {}),
        output_metadata: JSON.stringify(outputMetadata || {}),
        error: error || null,
        completed_at: ['completed', 'failed'].includes(status) ? db.fn.now() : null,
      })
      .returning('*');
    return row;
  },

  async updateLog(logId, { status, outputMetadata, error }) {
    const update = { status };
    if (outputMetadata !== undefined) update.output_metadata = JSON.stringify(outputMetadata);
    if (error !== undefined) update.error = error;
    if (['completed', 'failed', 'held'].includes(status)) update.completed_at = db.fn.now();
    const [row] = await db(LOG_TABLE).where({ id: logId }).update(update).returning('*');
    return row;
  },

  // Find the most recent log for a specific (documentExecutionId, nodeId) pair
  async findLog(documentExecutionId, nodeId) {
    return db(LOG_TABLE)
      .where({ document_execution_id: documentExecutionId, node_id: nodeId })
      .orderBy('started_at', 'desc')
      .first();
  },

  // Latest log entry for a given node in a given run (for IO visibility)
  async getLatestNodeLog(workflowRunId, nodeId) {
    return db(LOG_TABLE)
      .join(TABLE, `${LOG_TABLE}.document_execution_id`, `${TABLE}.id`)
      .where(`${TABLE}.workflow_run_id`, workflowRunId)
      .where(`${LOG_TABLE}.node_id`, nodeId)
      .orderBy(`${LOG_TABLE}.started_at`, 'desc')
      .select(`${LOG_TABLE}.*`)
      .first();
  },
};
