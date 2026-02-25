const { db } = require('../config/db');

const PROMPTS = 'categorisation_prompts';
const LABELS = 'categorisation_labels';
const NODES = 'nodes';
const WORKFLOWS = 'workflows';

module.exports = {
  async findByUserId(userId) {
    const prompts = await db(PROMPTS).where({ user_id: userId }).orderBy('created_at', 'desc');
    // Attach labels to each prompt
    const ids = prompts.map((p) => p.id);
    const labels = ids.length
      ? await db(LABELS).whereIn('prompt_id', ids).orderBy('sort_order', 'asc')
      : [];
    return prompts.map((p) => ({
      ...p,
      labels: labels.filter((l) => l.prompt_id === p.id),
    }));
  },

  async findById(id) {
    const prompt = await db(PROMPTS).where({ id }).first();
    if (!prompt) return null;
    const labels = await db(LABELS).where({ prompt_id: id }).orderBy('sort_order', 'asc');
    return { ...prompt, labels };
  },

  async create({ userId, name, labels }) {
    const [prompt] = await db(PROMPTS)
      .insert({ user_id: userId, name })
      .returning('*');
    const labelRows = await this._insertLabels(prompt.id, labels);
    return { ...prompt, labels: labelRows };
  },

  async update(id, { name, labels }) {
    const update = {};
    if (name !== undefined) update.name = name;
    const [prompt] = await db(PROMPTS).where({ id }).update(update).returning('*');
    if (labels !== undefined) {
      await db(LABELS).where({ prompt_id: id }).delete();
      const labelRows = await this._insertLabels(id, labels);
      return { ...prompt, labels: labelRows };
    }
    const existingLabels = await db(LABELS).where({ prompt_id: id }).orderBy('sort_order', 'asc');
    return { ...prompt, labels: existingLabels };
  },

  async remove(id) {
    await db(LABELS).where({ prompt_id: id }).delete();
    return db(PROMPTS).where({ id }).delete();
  },

  async _insertLabels(promptId, labels) {
    if (!labels || labels.length === 0) return [];
    const rows = labels.map((l, i) => ({
      prompt_id: promptId,
      label: l.label,
      description: l.description,
      sort_order: i,
    }));
    return db(LABELS).insert(rows).returning('*');
  },

  async findUsage(categorisationPromptId) {
    return db(NODES)
      .join(WORKFLOWS, `${NODES}.workflow_id`, `${WORKFLOWS}.id`)
      .where(`${NODES}.node_type`, 'CATEGORISATION')
      .whereRaw(`${NODES}.config->>'categorisation_prompt_id' = ?`, [categorisationPromptId])
      .select(
        `${WORKFLOWS}.id as workflow_id`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.id as node_id`,
        `${NODES}.name as node_name`
      );
  },
};
