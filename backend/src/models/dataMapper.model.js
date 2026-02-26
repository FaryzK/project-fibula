const { db } = require('../config/db');

const SETS = 'data_map_sets';
const RECORDS = 'data_map_records';
const RULES = 'data_map_rules';
const LOOKUPS = 'data_map_rule_lookups';
const TARGETS = 'data_map_rule_targets';
const NODES = 'nodes';
const WORKFLOWS = 'workflows';

module.exports = {
  // ── Data Map Sets ─────────────────────────────────────────────────────────

  async findSetsByUserId(userId) {
    return db(SETS).where({ user_id: userId }).orderBy('created_at', 'desc');
  },

  async findSetById(id) {
    const set = await db(SETS).where({ id }).first();
    if (!set) return null;
    const records = await db(RECORDS).where({ data_map_set_id: id });
    return { ...set, records };
  },

  async createSet({ userId, name, headers, records = [] }) {
    const [set] = await db(SETS)
      .insert({ user_id: userId, name, headers: JSON.stringify(headers || []) })
      .returning('*');

    const recordRows = records.length
      ? await db(RECORDS)
          .insert(records.map((r) => ({ data_map_set_id: set.id, values: JSON.stringify(r) })))
          .returning('*')
      : [];

    return { ...set, records: recordRows };
  },

  async updateSet(id, fields) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    if (fields.headers !== undefined) allowed.headers = JSON.stringify(fields.headers);
    const [set] = await db(SETS).where({ id }).update(allowed).returning('*');

    if (fields.records !== undefined) {
      await db(RECORDS).where({ data_map_set_id: id }).delete();
      if (fields.records.length > 0) {
        await db(RECORDS).insert(
          fields.records.map((r) => ({ data_map_set_id: id, values: JSON.stringify(r) }))
        );
      }
    }

    return this.findSetById(id);
  },

  async removeSet(id) {
    await db(RECORDS).where({ data_map_set_id: id }).delete();
    return db(SETS).where({ id }).delete();
  },

  // Returns raw records for a set (used by execution service)
  async findSetRecords(setId) {
    return db(RECORDS).where({ data_map_set_id: setId });
  },

  // ── Data Map Rules ────────────────────────────────────────────────────────

  async findRulesByUserId(userId) {
    return db(RULES).where({ user_id: userId }).orderBy('created_at', 'desc');
  },

  async findRuleById(id) {
    const rule = await db(RULES).where({ id }).first();
    if (!rule) return null;
    const [lookups, targets] = await Promise.all([
      db(LOOKUPS).where({ rule_id: id }).orderBy('sort_order', 'asc'),
      db(TARGETS).where({ rule_id: id }),
    ]);
    return { ...rule, lookups, targets };
  },

  async createRule({ userId, name, extractorId, lookups = [], targets = [] }) {
    const [rule] = await db(RULES)
      .insert({ user_id: userId, name, extractor_id: extractorId })
      .returning('*');

    const lookupRows = lookups.length
      ? await db(LOOKUPS)
          .insert(
            lookups.map((l, i) => ({
              rule_id: rule.id,
              data_map_set_id: l.data_map_set_id,
              map_set_column: l.map_set_column,
              schema_field: l.schema_field,
              match_type: l.match_type || 'exact',
              match_threshold: l.match_threshold || null,
              sort_order: i,
            }))
          )
          .returning('*')
      : [];

    const targetRows = targets.length
      ? await db(TARGETS)
          .insert(
            targets.map((t) => ({
              rule_id: rule.id,
              target_type: t.target_type,
              schema_field: t.schema_field,
              data_map_set_id: t.data_map_set_id,
              map_set_column: t.map_set_column,
              mode: t.mode || 'map',
              calculation_expression: t.calculation_expression || null,
            }))
          )
          .returning('*')
      : [];

    return { ...rule, lookups: lookupRows, targets: targetRows };
  },

  async updateRule(id, fields) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    if (fields.extractor_id !== undefined) allowed.extractor_id = fields.extractor_id;

    let rule;
    if (Object.keys(allowed).length > 0) {
      const [row] = await db(RULES).where({ id }).update(allowed).returning('*');
      rule = row;
    } else {
      rule = await db(RULES).where({ id }).first();
    }

    if (fields.lookups !== undefined) {
      await db(LOOKUPS).where({ rule_id: id }).delete();
      if (fields.lookups.length > 0) {
        await db(LOOKUPS).insert(
          fields.lookups.map((l, i) => ({
            rule_id: id,
            data_map_set_id: l.data_map_set_id,
            map_set_column: l.map_set_column,
            schema_field: l.schema_field,
            match_type: l.match_type || 'exact',
            match_threshold: l.match_threshold || null,
            sort_order: i,
          }))
        );
      }
    }

    if (fields.targets !== undefined) {
      await db(TARGETS).where({ rule_id: id }).delete();
      if (fields.targets.length > 0) {
        await db(TARGETS).insert(
          fields.targets.map((t) => ({
            rule_id: id,
            target_type: t.target_type,
            schema_field: t.schema_field,
            data_map_set_id: t.data_map_set_id,
            map_set_column: t.map_set_column,
            mode: t.mode || 'map',
            calculation_expression: t.calculation_expression || null,
          }))
        );
      }
    }

    return this.findRuleById(id);
  },

  async removeRule(id) {
    await db(LOOKUPS).where({ rule_id: id }).delete();
    await db(TARGETS).where({ rule_id: id }).delete();
    return db(RULES).where({ id }).delete();
  },

  async findRuleUsage(ruleId) {
    return db(NODES)
      .join(WORKFLOWS, `${NODES}.workflow_id`, `${WORKFLOWS}.id`)
      .where(`${NODES}.node_type`, 'DATA_MAPPER')
      .whereRaw(`${NODES}.config->>'rule_id' = ?`, [ruleId])
      .select(
        `${WORKFLOWS}.id as workflow_id`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.id as node_id`,
        `${NODES}.name as node_name`
      );
  },
};
