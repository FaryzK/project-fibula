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
    return db(SETS + ' as s')
      .where('s.user_id', userId)
      .leftJoin('users as u', 's.updated_by', 'u.id')
      .select(
        's.*',
        db.raw(`(SELECT COUNT(*) FROM ${RECORDS} WHERE data_map_set_id = s.id)::int AS row_count`),
        db.raw(`jsonb_array_length(s.headers)::int AS column_count`),
        db.raw(`(SELECT COUNT(*)::int FROM ${RULES} WHERE data_map_set_id = s.id) AS rule_count`),
        db.raw(`CONCAT(u.first_name, ' ', u.last_name) AS updated_by_name`)
      )
      .orderBy('s.created_at', 'desc');
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
      .insert({ user_id: userId, name, headers: JSON.stringify(headers || []), updated_at: db.fn.now(), updated_by: userId })
      .returning('*');

    const recordRows = records.length
      ? await db(RECORDS)
          .insert(records.map((r) => ({ data_map_set_id: set.id, values: JSON.stringify(r) })))
          .returning('*')
      : [];

    return { ...set, records: recordRows };
  },

  async updateSet(id, fields, userId) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    // Headers are immutable after creation — only update if explicitly forced
    if (fields.headers !== undefined && fields._forceHeaders) {
      allowed.headers = JSON.stringify(fields.headers);
    }
    if (Object.keys(allowed).length === 0) return this.findSetById(id);
    allowed.updated_at = db.fn.now();
    if (userId) allowed.updated_by = userId;
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

  // Touch set's updated_at/updated_by (called after record mutations)
  async touchSet(setId, userId) {
    return db(SETS).where({ id: setId }).update({ updated_at: db.fn.now(), updated_by: userId });
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
    return db(RULES)
      .where({ data_map_set_id: setId })
      .select('id as rule_id', 'name as rule_name');
  },

  // ── Data Map Rules ────────────────────────────────────────────────────────

  async findRulesByUserId(userId) {
    return db(RULES + ' as r')
      .where('r.user_id', userId)
      .leftJoin('users as u', 'r.updated_by', 'u.id')
      .select(
        'r.*',
        db.raw(`(SELECT COUNT(*)::int FROM ${NODES} WHERE node_type = 'DATA_MAPPER' AND config->>'rule_id' = r.id::text) AS node_count`),
        db.raw(`CONCAT(u.first_name, ' ', u.last_name) AS updated_by_name`)
      )
      .orderBy('r.created_at', 'desc');
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

  async createRule({ userId, name, extractorId, dataMapSetId, lookups = [], targets = [] }) {
    const [rule] = await db(RULES)
      .insert({
        user_id: userId,
        name,
        extractor_id: extractorId,
        data_map_set_id: dataMapSetId || null,
        updated_at: db.fn.now(),
        updated_by: userId,
      })
      .returning('*');

    const lookupRows = lookups.length
      ? await db(LOOKUPS)
          .insert(
            lookups.map((l, i) => ({
              rule_id: rule.id,
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
              schema_field: t.schema_field,
              expression: t.expression ? JSON.stringify(t.expression) : null,
            }))
          )
          .returning('*')
      : [];

    return { ...rule, lookups: lookupRows, targets: targetRows };
  },

  async updateRule(id, fields, userId) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    if (fields.extractor_id !== undefined) allowed.extractor_id = fields.extractor_id;
    if (fields.data_map_set_id !== undefined) allowed.data_map_set_id = fields.data_map_set_id;
    allowed.updated_at = db.fn.now();
    if (userId) allowed.updated_by = userId;

    let rule;
    const [row] = await db(RULES).where({ id }).update(allowed).returning('*');
    rule = row;

    if (fields.lookups !== undefined) {
      await db(LOOKUPS).where({ rule_id: id }).delete();
      if (fields.lookups.length > 0) {
        await db(LOOKUPS).insert(
          fields.lookups.map((l, i) => ({
            rule_id: id,
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
            schema_field: t.schema_field,
            expression: t.expression ? JSON.stringify(t.expression) : null,
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
