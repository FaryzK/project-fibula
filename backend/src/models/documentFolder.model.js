const { db } = require('../config/db');

const FOLDERS = 'document_folder_instances';
const HELD = 'document_folder_held';
const NODES = 'nodes';
const WORKFLOWS = 'workflows';
const DOC_EXECUTIONS = 'document_executions';
const DOCUMENTS = 'documents';

module.exports = {
  async findByUserId(userId) {
    const folders = await db(FOLDERS).where({ user_id: userId }).orderBy('created_at', 'desc');
    if (folders.length === 0) return [];
    const ids = folders.map((f) => f.id);
    const counts = await db(HELD)
      .whereIn('folder_instance_id', ids)
      .where('status', 'held')
      .groupBy('folder_instance_id')
      .select('folder_instance_id')
      .count('* as held_count');
    const countMap = {};
    for (const row of counts) countMap[row.folder_instance_id] = parseInt(row.held_count, 10);
    return folders.map((f) => ({ ...f, held_count: countMap[f.id] || 0 }));
  },

  async findById(id) {
    return db(FOLDERS).where({ id }).first();
  },

  async create({ userId, name }) {
    const [row] = await db(FOLDERS).insert({ user_id: userId, name }).returning('*');
    return row;
  },

  async update(id, fields) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    const [row] = await db(FOLDERS).where({ id }).update(allowed).returning('*');
    return row;
  },

  async remove(id) {
    await db(HELD).where({ folder_instance_id: id }).delete();
    return db(FOLDERS).where({ id }).delete();
  },

  async findHeld(folderId) {
    return db(HELD)
      .join(DOC_EXECUTIONS, `${HELD}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .join(DOCUMENTS, `${DOC_EXECUTIONS}.document_id`, `${DOCUMENTS}.id`)
      .join(WORKFLOWS, `${HELD}.workflow_id`, `${WORKFLOWS}.id`)
      .join(NODES, `${HELD}.node_id`, `${NODES}.id`)
      .where(`${HELD}.folder_instance_id`, folderId)
      .where(`${HELD}.status`, 'held')
      .select(
        `${HELD}.id`,
        `${HELD}.document_execution_id`,
        `${HELD}.workflow_id`,
        `${HELD}.node_id`,
        `${HELD}.arrived_at`,
        `${HELD}.status`,
        `${DOCUMENTS}.file_name`,
        `${DOCUMENTS}.file_url`,
        `${DOC_EXECUTIONS}.metadata`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.name as node_name`
      )
      .orderBy(`${HELD}.arrived_at`, 'desc');
  },

  async findHeldById(heldId) {
    return db(HELD).where({ id: heldId }).first();
  },

  async createHeld({ folderInstanceId, documentExecutionId, workflowId, nodeId }) {
    const [row] = await db(HELD)
      .insert({
        folder_instance_id: folderInstanceId,
        document_execution_id: documentExecutionId,
        workflow_id: workflowId,
        node_id: nodeId,
        status: 'held',
        arrived_at: new Date(),
      })
      .returning('*');
    return row;
  },

  async sendOut(heldId) {
    const [row] = await db(HELD).where({ id: heldId }).update({ status: 'sent_out' }).returning('*');
    return row;
  },

  async deleteHeld(heldId) {
    return db(HELD).where({ id: heldId }).delete();
  },

  async findUsage(folderId) {
    return db(NODES)
      .join(WORKFLOWS, `${NODES}.workflow_id`, `${WORKFLOWS}.id`)
      .where(`${NODES}.node_type`, 'DOCUMENT_FOLDER')
      .whereRaw(`${NODES}.config->>'folder_instance_id' = ?`, [folderId])
      .select(
        `${WORKFLOWS}.id as workflow_id`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.id as node_id`,
        `${NODES}.name as node_name`
      );
  },
};
