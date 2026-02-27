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
      .select(`${LOG_TABLE}.node_id`, `${LOG_TABLE}.status`, `${LOG_TABLE}.output_port`)
      .count('* as count')
      .groupBy(`${LOG_TABLE}.node_id`, `${LOG_TABLE}.status`, `${LOG_TABLE}.output_port`);
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

  async updateLog(logId, { status, outputMetadata, error, outputPort }) {
    const update = { status };
    if (outputMetadata !== undefined) update.output_metadata = JSON.stringify(outputMetadata);
    if (error !== undefined) update.error = error;
    if (outputPort !== undefined) update.output_port = outputPort;
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

  // ── Flow Inspector ──────────────────────────────────────────────────────────

  // Per-node processing/held counts (live) + failed counts for a whole workflow
  async getFlowInspectorSummary(workflowId) {
    const liveRows = await db('document_executions as de')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .where('wr.workflow_id', workflowId)
      .whereIn('de.status', ['processing', 'held'])
      .whereNotNull('de.current_node_id')
      .select('de.current_node_id as node_id', 'de.status')
      .count('* as count')
      .groupBy('de.current_node_id', 'de.status');

    const failedRows = await db('node_execution_logs as nel')
      .join('document_executions as de', 'de.id', 'nel.document_execution_id')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .where('wr.workflow_id', workflowId)
      .where('nel.status', 'failed')
      .select('nel.node_id')
      .countDistinct('nel.document_execution_id as count')
      .groupBy('nel.node_id');

    return { liveRows, failedRows };
  },

  // Documents currently processing or held at a specific node
  async getNodeLiveDocs(workflowId, nodeId, status) {
    return db('document_executions as de')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .join('documents as d', 'd.id', 'de.document_id')
      .leftJoin('extractor_held_documents as ehd', 'ehd.document_execution_id', 'de.id')
      .where('wr.workflow_id', workflowId)
      .where('de.current_node_id', nodeId)
      .where('de.status', status)
      .select(
        'de.id',
        'de.status',
        'de.updated_at',
        'de.created_at',
        'd.file_name',
        'd.id as document_id',
        'ehd.held_reason',
      )
      .orderBy('de.updated_at', 'asc');
  },

  // Documents that have failed at a specific node across all runs of a workflow
  async getNodeFailedDocs(workflowId, nodeId) {
    return db('node_execution_logs as nel')
      .join('document_executions as de', 'de.id', 'nel.document_execution_id')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .join('documents as d', 'd.id', 'de.document_id')
      .where('wr.workflow_id', workflowId)
      .where('nel.node_id', nodeId)
      .where('nel.status', 'failed')
      .select('de.id', 'd.file_name', 'd.id as document_id', 'nel.error', 'nel.completed_at')
      .orderBy('nel.completed_at', 'desc');
  },

  // Orphaned documents for a workflow
  async getOrphanedDocs(workflowId) {
    return db('document_executions as de')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .join('documents as d', 'd.id', 'de.document_id')
      .where('wr.workflow_id', workflowId)
      .where('de.status', 'orphaned')
      .select('de.id', 'd.file_name', 'd.id as document_id', 'de.orphaned_node_name', 'de.updated_at')
      .orderBy('de.updated_at', 'desc');
  },

  // Mark all held docs at a node as orphaned (called on node deletion)
  async orphanHeldDocs(nodeId, nodeName) {
    return db(TABLE)
      .where({ current_node_id: nodeId, status: 'held' })
      .update({
        status: 'orphaned',
        current_node_id: null,
        orphaned_node_name: nodeName,
        updated_at: db.fn.now(),
      });
  },

  // Count held docs at a node (used for deletion warning)
  async countHeldAtNode(nodeId) {
    const [{ count }] = await db(TABLE)
      .where({ current_node_id: nodeId, status: 'held' })
      .count('* as count');
    return Number(count);
  },

  // Delete a document execution record
  async deleteExecution(id) {
    await db(TABLE).where({ id }).delete();
  },
};
