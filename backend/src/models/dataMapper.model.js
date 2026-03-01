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

  async findSetById(id, { page = 1, pageSize = 0, filters = {} } = {}) {
    const set = await db(SETS).where({ id }).first();
    if (!set) return null;

    let query = db(RECORDS).where({ data_map_set_id: id });

    // Apply per-column filters
    const headers = typeof set.headers === 'string' ? JSON.parse(set.headers) : set.headers || [];
    for (const [col, filter] of Object.entries(filters)) {
      const hdr = headers.find((h) => (typeof h === 'object' ? h.name : h) === col);
      if (!hdr) continue;
      const dataType = typeof hdr === 'object' ? hdr.data_type : 'string';

      if (dataType === 'number') {
        if (filter.min !== undefined) query = query.whereRaw(`(values->>?)::numeric >= ?`, [col, filter.min]);
        if (filter.max !== undefined) query = query.whereRaw(`(values->>?)::numeric <= ?`, [col, filter.max]);
      } else if (dataType === 'boolean') {
        if (filter.value !== undefined) query = query.whereRaw(`values->>? = ?`, [col, String(filter.value)]);
      } else if (dataType === 'date') {
        if (filter.from) query = query.whereRaw(`values->>? >= ?`, [col, filter.from]);
        if (filter.to) query = query.whereRaw(`values->>? <= ?`, [col, filter.to]);
      } else {
        // string / currency — ILIKE text search
        if (filter.search) query = query.whereRaw(`values->>? ILIKE ?`, [col, `%${filter.search}%`]);
      }
    }

    // Count total before pagination
    const countQuery = query.clone();
    const [{ count }] = await countQuery.count('* as count');
    const total = parseInt(count, 10);

    // Pagination (pageSize=0 means return all)
    if (pageSize > 0) {
      const offset = (page - 1) * pageSize;
      query = query.limit(pageSize).offset(offset);
    }

    const records = await query;
    return { ...set, records, total, page, pageSize };
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
    // Headers are immutable after creation — only update if explicitly forced
    if (fields.headers !== undefined && fields._forceHeaders) {
      allowed.headers = JSON.stringify(fields.headers);
    }
    if (Object.keys(allowed).length === 0) return this.findSetById(id);
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

  // Bulk insert new records into an existing set
  async addRecords(setId, records) {
    if (!records.length) return [];
    return db(RECORDS)
      .insert(records.map((r) => ({ data_map_set_id: setId, values: JSON.stringify(r) })))
      .returning('*');
  },

  // Find a single record by its primary key
  async findRecordById(recordId) {
    return db(RECORDS).where({ id: recordId }).first();
  },

  // Delete a single record by its primary key
  async removeRecord(recordId) {
    return db(RECORDS).where({ id: recordId }).delete();
  },

  // Update a single record's values
  async updateRecord(recordId, values) {
    const [row] = await db(RECORDS)
      .where({ id: recordId })
      .update({ values: JSON.stringify(values) })
      .returning('*');
    return row;
  },

  // Returns raw records for a set (used by execution service)
  async findSetRecords(setId) {
    return db(RECORDS).where({ data_map_set_id: setId });
  },

  // Find which rules reference this set (via lookups or targets)
  async findSetUsage(setId) {
    const lookupRules = db(LOOKUPS)
      .where({ data_map_set_id: setId })
      .select('rule_id')
      .distinct();
    const targetRules = db(TARGETS)
      .where({ data_map_set_id: setId })
      .select('rule_id')
      .distinct();

    return db(RULES)
      .whereIn('id', lookupRules)
      .orWhereIn('id', targetRules)
      .select('id as rule_id', 'name as rule_name');
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
