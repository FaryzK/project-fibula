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

  // entries: [{ docId, startNodeId?, metadata? }] — or legacy: plain string array
  async createMany(workflowRunId, entries) {
    const rows = entries.map((entry) => {
      const docId = typeof entry === 'string' ? entry : entry.docId;
      const startNodeId = typeof entry === 'string' ? null : (entry.startNodeId || null);
      const metadata = typeof entry === 'string' ? {} : (entry.metadata || {});
      return {
        workflow_run_id: workflowRunId,
        document_id: docId,
        start_node_id: startNodeId,
        status: 'pending',
        metadata: JSON.stringify(metadata),
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

  async updateStatus(id, { status, currentNodeId, metadata, unroutedPort }) {
    const update = { status };
    if (currentNodeId !== undefined) update.current_node_id = currentNodeId;
    if (metadata !== undefined) update.metadata = JSON.stringify(metadata);
    if (unroutedPort !== undefined) update.unrouted_port = unroutedPort;
    // Clear unrouted_port when moving out of unrouted state
    if (status !== 'unrouted' && unroutedPort === undefined) update.unrouted_port = null;
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
    if (['completed', 'failed', 'held', 'unrouted'].includes(status)) update.completed_at = db.fn.now();
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

  // Per-node processing/held/unrouted counts (live) + failed counts for a whole workflow
  async getFlowInspectorSummary(workflowId) {
    const liveRows = await db('document_executions as de')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .where('wr.workflow_id', workflowId)
      .whereIn('de.status', ['processing', 'held', 'unrouted'])
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
        'de.metadata',
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

  // Mark all held docs at a node as orphaned (called on node deletion).
  // Also removes their extractor_held_documents records so they no longer appear in the extractor's Held tab.
  async orphanHeldDocs(nodeId, nodeName) {
    const executions = await db(TABLE)
      .where({ current_node_id: nodeId, status: 'held' })
      .select('id');

    if (executions.length) {
      const execIds = executions.map((e) => e.id);
      await db('extractor_held_documents').whereIn('document_execution_id', execIds).delete();
    }

    return db(TABLE)
      .where({ current_node_id: nodeId, status: 'held' })
      .update({
        status: 'orphaned',
        current_node_id: null,
        orphaned_node_name: nodeName,
        updated_at: db.fn.now(),
      });
  },

  // Orphan held docs at a node that belong to a specific extractor (called when node extractor is reconfigured).
  // Also deletes the extractor_held_documents records so they no longer appear in the extractor's Held tab.
  async orphanExtractorHeldDocs(nodeId, oldExtractorId, nodeName) {
    const rows = await db('extractor_held_documents as ehd')
      .join(TABLE + ' as de', 'de.id', 'ehd.document_execution_id')
      .where('de.current_node_id', nodeId)
      .where('de.status', 'held')
      .where('ehd.extractor_id', oldExtractorId)
      .where('ehd.status', 'held')
      .select('de.id as doc_exec_id', 'ehd.id as held_id');

    if (!rows.length) return 0;

    const docExecIds = rows.map((r) => r.doc_exec_id);
    const heldIds = rows.map((r) => r.held_id);

    await db(TABLE)
      .whereIn('id', docExecIds)
      .update({
        status: 'orphaned',
        current_node_id: null,
        orphaned_node_name: nodeName,
        updated_at: db.fn.now(),
      });

    await db('extractor_held_documents').whereIn('id', heldIds).delete();

    return rows.length;
  },

  // Count held docs at a node (used for deletion warning)
  async countHeldAtNode(nodeId) {
    const [{ count }] = await db(TABLE)
      .where({ current_node_id: nodeId, status: 'held' })
      .count('* as count');
    return Number(count);
  },

  // Count unrouted docs at a node (all ports)
  async countUnroutedAtNode(nodeId) {
    const [{ count }] = await db(TABLE)
      .where({ current_node_id: nodeId, status: 'unrouted' })
      .count('* as count');
    return Number(count);
  },

  // Count unrouted docs at a specific port
  async countUnroutedAtPort(nodeId, portId) {
    const [{ count }] = await db(TABLE)
      .where({ current_node_id: nodeId, status: 'unrouted', unrouted_port: portId })
      .count('* as count');
    return Number(count);
  },

  // Documents currently unrouted at a specific node port
  async getNodeUnroutedDocs(workflowId, nodeId, portId) {
    return db('document_executions as de')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .join('documents as d', 'd.id', 'de.document_id')
      .where('wr.workflow_id', workflowId)
      .where('de.current_node_id', nodeId)
      .where('de.status', 'unrouted')
      .where('de.unrouted_port', portId)
      .select(
        'de.id',
        'de.status',
        'de.updated_at',
        'de.unrouted_port',
        'de.metadata',
        'd.file_name',
        'd.id as document_id',
      )
      .orderBy('de.updated_at', 'asc');
  },

  // Orphan unrouted docs — optionally filtered to a specific port (portId=null means all ports)
  async orphanUnroutedDocs(nodeId, nodeName, portId = null) {
    const query = db(TABLE)
      .where({ current_node_id: nodeId, status: 'unrouted' });
    if (portId !== null) query.where('unrouted_port', portId);

    return query.update({
      status: 'orphaned',
      current_node_id: null,
      unrouted_port: null,
      orphaned_node_name: nodeName,
      updated_at: db.fn.now(),
    });
  },

  // Unrouted document executions for a user, filtered to RECONCILIATION nodes only.
  // Used by the Reconciliation page's Unrouted tab to show docs released from recon
  // but with no connected downstream edge.
  async listUnroutedDocs(userId) {
    return db('document_executions as de')
      .join('workflow_runs as wr', 'wr.id', 'de.workflow_run_id')
      .join('workflows as w', 'w.id', 'wr.workflow_id')
      .join('documents as d', 'd.id', 'de.document_id')
      .join('nodes as n', 'n.id', 'de.current_node_id')
      .where('w.user_id', userId)
      .where('de.status', 'unrouted')
      .where('n.node_type', 'RECONCILIATION')
      .select(
        'de.id',
        'de.unrouted_port',
        'de.updated_at',
        'de.metadata',
        'd.file_name',
        'd.id as document_id',
        'w.id as workflow_id',
        'w.name as workflow_name',
        'n.name as node_name',
        'n.node_type',
      )
      .orderBy('de.updated_at', 'desc');
  },

  // Delete a document execution record
  async deleteExecution(id) {
    await db(TABLE).where({ id }).delete();
  },

  // Mark orphaned/unrouted executions as completed after re-triggering, removing them from their panels.
  // Safe to call with mixed failed/orphaned/unrouted IDs — only orphaned and unrouted are updated.
  async markRetriggered(execIds) {
    if (!execIds || !execIds.length) return;
    return db(TABLE)
      .whereIn('id', execIds)
      .whereIn('status', ['orphaned', 'unrouted'])
      .update({ status: 'completed', current_node_id: null, unrouted_port: null, updated_at: db.fn.now() });
  },

  // Called on server startup to clean up any executions and runs left in a processing/running
  // state by a previous server session that was killed mid-execution.
  async cleanupStaleProcessing() {
    await db(TABLE)
      .where('status', 'processing')
      .update({ status: 'failed', current_node_id: null, updated_at: db.fn.now() });
    await db('workflow_runs')
      .where('status', 'running')
      .update({ status: 'failed', completed_at: db.fn.now() });
  },
};
