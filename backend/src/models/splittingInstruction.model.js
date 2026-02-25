const { db } = require('../config/db');

const TABLE = 'splitting_instructions';
const NODES = 'nodes';
const WORKFLOWS = 'workflows';

module.exports = {
  async findByUserId(userId) {
    return db(TABLE).where({ user_id: userId }).orderBy('created_at', 'desc');
  },

  async findById(id) {
    return db(TABLE).where({ id }).first();
  },

  async create({ userId, name, instructions }) {
    const [row] = await db(TABLE)
      .insert({ user_id: userId, name, instructions })
      .returning('*');
    return row;
  },

  async update(id, fields) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    if (fields.instructions !== undefined) allowed.instructions = fields.instructions;
    const [row] = await db(TABLE).where({ id }).update(allowed).returning('*');
    return row;
  },

  async remove(id) {
    return db(TABLE).where({ id }).delete();
  },

  // Returns workflows + node names that reference this instruction in node config
  async findUsage(splittingInstructionId) {
    return db(NODES)
      .join(WORKFLOWS, `${NODES}.workflow_id`, `${WORKFLOWS}.id`)
      .where(`${NODES}.node_type`, 'SPLITTING')
      .whereRaw(`${NODES}.config->>'splitting_instruction_id' = ?`, [splittingInstructionId])
      .select(
        `${WORKFLOWS}.id as workflow_id`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.id as node_id`,
        `${NODES}.name as node_name`
      );
  },
};
