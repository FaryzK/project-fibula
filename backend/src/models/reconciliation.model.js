const { db } = require('../config/db');

const RULES = 'reconciliation_rules';
const TARGET_EXTRACTORS = 'reconciliation_target_extractors';
const VARIATIONS = 'reconciliation_variations';
const DOC_LINKS = 'reconciliation_doc_matching_links';
const TABLE_KEYS = 'reconciliation_table_matching_keys';
const COMPARISON_RULES = 'reconciliation_comparison_rules';
const MATCHING_SETS = 'reconciliation_matching_sets';
const SET_DOCS = 'reconciliation_matching_set_docs';
const NODES = 'nodes';
const WORKFLOWS = 'workflows';
const DOC_EXECUTIONS = 'document_executions';
const DOCUMENTS = 'documents';

module.exports = {
  async findByUserId(userId) {
    const rules = await db(RULES).where({ user_id: userId }).orderBy('created_at', 'desc');
    if (rules.length === 0) return [];
    const ids = rules.map((r) => r.id);
    const targets = await db(TARGET_EXTRACTORS).whereIn('rule_id', ids);
    return rules.map((r) => ({ ...r, target_extractors: targets.filter((t) => t.rule_id === r.id) }));
  },

  async findById(id) {
    const rule = await db(RULES).where({ id }).first();
    if (!rule) return null;

    const [targetExtractors, variations] = await Promise.all([
      db(TARGET_EXTRACTORS).where({ rule_id: id }),
      db(VARIATIONS).where({ rule_id: id }).orderBy('variation_order', 'asc'),
    ]);

    const variationIds = variations.map((v) => v.id);
    let docLinks = [], tableKeys = [], comparisonRules = [];
    if (variationIds.length > 0) {
      [docLinks, tableKeys, comparisonRules] = await Promise.all([
        db(DOC_LINKS).whereIn('variation_id', variationIds),
        db(TABLE_KEYS).whereIn('variation_id', variationIds),
        db(COMPARISON_RULES).whereIn('variation_id', variationIds),
      ]);
    }

    const fullVariations = variations.map((v) => ({
      ...v,
      doc_matching_links: docLinks.filter((d) => d.variation_id === v.id),
      table_matching_keys: tableKeys.filter((t) => t.variation_id === v.id),
      comparison_rules: comparisonRules.filter((c) => c.variation_id === v.id),
    }));

    return { ...rule, target_extractors: targetExtractors, variations: fullVariations };
  },

  async create({ userId, name, anchorExtractorId, targetExtractors = [], variations = [] }) {
    const [rule] = await db(RULES)
      .insert({ user_id: userId, name, anchor_extractor_id: anchorExtractorId })
      .returning('*');

    if (targetExtractors.length > 0) {
      await db(TARGET_EXTRACTORS).insert(
        targetExtractors.map((t) => ({ rule_id: rule.id, extractor_id: t.extractor_id }))
      );
    }

    for (const v of variations) {
      const [variation] = await db(VARIATIONS)
        .insert({ rule_id: rule.id, variation_order: v.variation_order || 1 })
        .returning('*');

      if (v.doc_matching_links && v.doc_matching_links.length > 0) {
        await db(DOC_LINKS).insert(
          v.doc_matching_links.map((l) => ({
            variation_id: variation.id,
            anchor_field: l.anchor_field,
            target_extractor_id: l.target_extractor_id,
            target_field: l.target_field,
            match_type: l.match_type || 'exact',
            match_threshold: l.match_threshold || null,
          }))
        );
      }

      if (v.table_matching_keys && v.table_matching_keys.length > 0) {
        await db(TABLE_KEYS).insert(
          v.table_matching_keys.map((k) => ({
            variation_id: variation.id,
            anchor_table_type_id: k.anchor_table_type_id,
            target_extractor_id: k.target_extractor_id,
            target_table_type_id: k.target_table_type_id,
            anchor_column: k.anchor_column,
            target_column: k.target_column,
          }))
        );
      }

      if (v.comparison_rules && v.comparison_rules.length > 0) {
        await db(COMPARISON_RULES).insert(
          v.comparison_rules.map((c) => ({
            variation_id: variation.id,
            level: c.level,
            formula: c.formula,
            tolerance_type: c.tolerance_type || null,
            tolerance_value: c.tolerance_value || null,
          }))
        );
      }
    }

    return this.findById(rule.id);
  },

  async update(id, fields) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    if (fields.anchor_extractor_id !== undefined) allowed.anchor_extractor_id = fields.anchor_extractor_id;

    let rule;
    if (Object.keys(allowed).length > 0) {
      const [row] = await db(RULES).where({ id }).update(allowed).returning('*');
      rule = row;
    } else {
      rule = await db(RULES).where({ id }).first();
    }

    if (fields.target_extractors !== undefined) {
      await db(TARGET_EXTRACTORS).where({ rule_id: id }).delete();
      if (fields.target_extractors.length > 0) {
        await db(TARGET_EXTRACTORS).insert(
          fields.target_extractors.map((t) => ({ rule_id: id, extractor_id: t.extractor_id }))
        );
      }
    }

    if (fields.variations !== undefined) {
      const existingVars = await db(VARIATIONS).where({ rule_id: id }).select('id');
      const varIds = existingVars.map((v) => v.id);
      if (varIds.length > 0) {
        await db(DOC_LINKS).whereIn('variation_id', varIds).delete();
        await db(TABLE_KEYS).whereIn('variation_id', varIds).delete();
        await db(COMPARISON_RULES).whereIn('variation_id', varIds).delete();
      }
      await db(VARIATIONS).where({ rule_id: id }).delete();

      for (const v of fields.variations) {
        const [variation] = await db(VARIATIONS)
          .insert({ rule_id: id, variation_order: v.variation_order || 1 })
          .returning('*');

        if (v.doc_matching_links && v.doc_matching_links.length > 0) {
          await db(DOC_LINKS).insert(
            v.doc_matching_links.map((l) => ({
              variation_id: variation.id,
              anchor_field: l.anchor_field,
              target_extractor_id: l.target_extractor_id,
              target_field: l.target_field,
              match_type: l.match_type || 'exact',
              match_threshold: l.match_threshold || null,
            }))
          );
        }

        if (v.comparison_rules && v.comparison_rules.length > 0) {
          await db(COMPARISON_RULES).insert(
            v.comparison_rules.map((c) => ({
              variation_id: variation.id,
              level: c.level,
              formula: c.formula,
              tolerance_type: c.tolerance_type || null,
              tolerance_value: c.tolerance_value || null,
            }))
          );
        }
      }
    }

    return this.findById(id);
  },

  async remove(id) {
    const variations = await db(VARIATIONS).where({ rule_id: id }).select('id');
    const varIds = variations.map((v) => v.id);
    if (varIds.length > 0) {
      await db(DOC_LINKS).whereIn('variation_id', varIds).delete();
      await db(TABLE_KEYS).whereIn('variation_id', varIds).delete();
      await db(COMPARISON_RULES).whereIn('variation_id', varIds).delete();
    }
    await db(VARIATIONS).where({ rule_id: id }).delete();
    await db(TARGET_EXTRACTORS).where({ rule_id: id }).delete();

    // Clean up matching sets
    const sets = await db(MATCHING_SETS).where({ rule_id: id }).select('id');
    const setIds = sets.map((s) => s.id);
    if (setIds.length > 0) await db(SET_DOCS).whereIn('matching_set_id', setIds).delete();
    await db(MATCHING_SETS).where({ rule_id: id }).delete();

    return db(RULES).where({ id }).delete();
  },

  async findUsage(ruleId) {
    return db(NODES)
      .join(WORKFLOWS, `${NODES}.workflow_id`, `${WORKFLOWS}.id`)
      .where(`${NODES}.node_type`, 'RECONCILIATION')
      .whereRaw(`${NODES}.config->>'reconciliation_rule_id' = ?`, [ruleId])
      .select(
        `${WORKFLOWS}.id as workflow_id`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.id as node_id`,
        `${NODES}.name as node_name`
      );
  },

  // ── Matching Sets ─────────────────────────────────────────────────────────

  async findMatchingSets(ruleId, { status } = {}) {
    const query = db(MATCHING_SETS).where({ rule_id: ruleId });
    if (status) query.where({ status });
    return query.orderBy('created_at', 'desc');
  },

  async findMatchingSetById(setId) {
    const set = await db(MATCHING_SETS).where({ id: setId }).first();
    if (!set) return null;
    const docs = await db(SET_DOCS)
      .join(DOC_EXECUTIONS, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .join(DOCUMENTS, `${DOC_EXECUTIONS}.document_id`, `${DOCUMENTS}.id`)
      .where(`${SET_DOCS}.matching_set_id`, setId)
      .select(
        `${SET_DOCS}.id`,
        `${SET_DOCS}.matching_set_id`,
        `${SET_DOCS}.document_execution_id`,
        `${SET_DOCS}.extractor_id`,
        `${DOCUMENTS}.file_name`,
        `${DOCUMENTS}.file_url`,
        `${DOC_EXECUTIONS}.metadata`
      );
    return { ...set, docs };
  },

  async createMatchingSet({ ruleId, anchorDocExecId }) {
    const [row] = await db(MATCHING_SETS)
      .insert({ rule_id: ruleId, anchor_document_execution_id: anchorDocExecId, status: 'pending' })
      .returning('*');
    return row;
  },

  async addDocToSet({ matchingSetId, documentExecutionId, extractorId }) {
    // Upsert: avoid duplicates
    const existing = await db(SET_DOCS)
      .where({ matching_set_id: matchingSetId, document_execution_id: documentExecutionId })
      .first();
    if (existing) return existing;
    const [row] = await db(SET_DOCS)
      .insert({ matching_set_id: matchingSetId, document_execution_id: documentExecutionId, extractor_id: extractorId })
      .returning('*');
    return row;
  },

  async findSetDocs(matchingSetId) {
    return db(SET_DOCS).where({ matching_set_id: matchingSetId });
  },

  async updateMatchingSetStatus(setId, status) {
    const [row] = await db(MATCHING_SETS).where({ id: setId }).update({ status }).returning('*');
    return row;
  },

  // Find a pending matching set for a rule where the anchor metadata matches the incoming doc
  // Returns set + anchor metadata for comparison
  async findPendingMatchingSets(ruleId) {
    const sets = await db(MATCHING_SETS)
      .where({ rule_id: ruleId, status: 'pending' })
      .orderBy('created_at', 'asc');
    const result = [];
    for (const set of sets) {
      const anchorExec = await db(DOC_EXECUTIONS)
        .where({ id: set.anchor_document_execution_id })
        .first();
      result.push({ ...set, anchorMetadata: anchorExec ? JSON.parse(anchorExec.metadata || '{}') : {} });
    }
    return result;
  },
};
