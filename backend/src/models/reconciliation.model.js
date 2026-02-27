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
const HELD_DOCS = 'reconciliation_held_documents';
const COMPARISON_RESULTS = 'reconciliation_comparison_results';

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
      db(VARIATIONS).where({ rule_id: id }),
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

  async create({ userId, name, anchorExtractorId, autoSendOut = false, targetExtractors = [], variations = [] }) {
    const [rule] = await db(RULES)
      .insert({ user_id: userId, name, anchor_extractor_id: anchorExtractorId, auto_send_out: autoSendOut })
      .returning('*');

    if (targetExtractors.length > 0) {
      await db(TARGET_EXTRACTORS).insert(
        targetExtractors.map((t) => ({ rule_id: rule.id, extractor_id: t.extractor_id }))
      );
    }

    for (const v of variations) {
      const [variation] = await db(VARIATIONS)
        .insert({ rule_id: rule.id })
        .returning('*');

      if (v.doc_matching_links && v.doc_matching_links.length > 0) {
        await db(DOC_LINKS).insert(
          v.doc_matching_links.map((l) => ({
            variation_id: variation.id,
            left_extractor_id: l.left_extractor_id || null,
            left_field: l.left_field || null,
            right_extractor_id: l.right_extractor_id || null,
            right_field: l.right_field || null,
            match_type: l.match_type || 'exact',
            match_threshold: l.match_threshold || null,
          }))
        );
      }

      if (v.table_matching_keys && v.table_matching_keys.length > 0) {
        await db(TABLE_KEYS).insert(
          v.table_matching_keys.map((k) => ({
            variation_id: variation.id,
            left_extractor_id: k.left_extractor_id || null,
            left_table_type: k.left_table_type || null,
            left_column: k.left_column || null,
            right_extractor_id: k.right_extractor_id || null,
            right_table_type: k.right_table_type || null,
            right_column: k.right_column || null,
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
    if (fields.auto_send_out !== undefined) allowed.auto_send_out = fields.auto_send_out;

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
          .insert({ rule_id: id })
          .returning('*');

        if (v.doc_matching_links && v.doc_matching_links.length > 0) {
          await db(DOC_LINKS).insert(
            v.doc_matching_links.map((l) => ({
              variation_id: variation.id,
              left_extractor_id: l.left_extractor_id || null,
              left_field: l.left_field || null,
              right_extractor_id: l.right_extractor_id || null,
              right_field: l.right_field || null,
              match_type: l.match_type || 'exact',
              match_threshold: l.match_threshold || null,
            }))
          );
        }

        if (v.table_matching_keys && v.table_matching_keys.length > 0) {
          await db(TABLE_KEYS).insert(
            v.table_matching_keys.map((k) => ({
              variation_id: variation.id,
              left_extractor_id: k.left_extractor_id || null,
              left_table_type: k.left_table_type || null,
              left_column: k.left_column || null,
              right_extractor_id: k.right_extractor_id || null,
              right_table_type: k.right_table_type || null,
              right_column: k.right_column || null,
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

  /** List all matching sets across all rules owned by the user (for the landing tab). */
  async findAllMatchingSets(userId, { status } = {}) {
    const query = db(MATCHING_SETS)
      .join(RULES, `${MATCHING_SETS}.rule_id`, `${RULES}.id`)
      .where(`${RULES}.user_id`, userId)
      .select(
        `${MATCHING_SETS}.*`,
        `${RULES}.name as rule_name`
      )
      .orderBy(`${MATCHING_SETS}.created_at`, 'desc');
    if (status) query.where(`${MATCHING_SETS}.status`, status);
    return query;
  },

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

  async createMatchingSet({ ruleId, variationId, anchorDocExecId }) {
    const [row] = await db(MATCHING_SETS)
      .insert({
        rule_id: ruleId,
        variation_id: variationId || null,
        anchor_document_execution_id: anchorDocExecId,
        status: 'pending',
      })
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

  // Like findSetDocs but includes document_executions.metadata for each doc (used in matching logic).
  async findSetDocsWithMetadata(matchingSetId) {
    const rows = await db(SET_DOCS)
      .join(DOC_EXECUTIONS, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .where(`${SET_DOCS}.matching_set_id`, matchingSetId)
      .select(`${SET_DOCS}.extractor_id`, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.metadata`);
    return rows.map((r) => ({
      extractor_id: r.extractor_id,
      document_execution_id: r.document_execution_id,
      metadata: typeof r.metadata === 'object' ? r.metadata : JSON.parse(r.metadata || '{}'),
    }));
  },

  async updateMatchingSetStatus(setId, status) {
    const [row] = await db(MATCHING_SETS).where({ id: setId }).update({ status }).returning('*');
    return row;
  },

  // Find all pending matching sets for a rule.
  // Returns each set with setDocs: [{ extractor_id, metadata }] for all docs currently in the set.
  async findPendingMatchingSets(ruleId) {
    const sets = await db(MATCHING_SETS)
      .where({ rule_id: ruleId, status: 'pending' })
      .orderBy('created_at', 'asc');
    const result = [];
    for (const set of sets) {
      const rows = await db(SET_DOCS)
        .join(DOC_EXECUTIONS, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
        .where(`${SET_DOCS}.matching_set_id`, set.id)
        .select(`${SET_DOCS}.extractor_id`, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.metadata`);
      const setDocs = rows.map((r) => ({
        extractor_id: r.extractor_id,
        document_execution_id: r.document_execution_id,
        metadata: typeof r.metadata === 'object' ? r.metadata : JSON.parse(r.metadata || '{}'),
      }));
      result.push({ ...set, setDocs });
    }
    return result;
  },

  // Find pending matching sets for a specific variation.
  async findPendingMatchingSetsByVariation(variationId) {
    const sets = await db(MATCHING_SETS)
      .where({ variation_id: variationId, status: 'pending' })
      .orderBy('created_at', 'asc');
    if (sets.length === 0) return [];
    const result = [];
    for (const set of sets) {
      const rows = await db(SET_DOCS)
        .join(DOC_EXECUTIONS, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
        .where(`${SET_DOCS}.matching_set_id`, set.id)
        .select(`${SET_DOCS}.extractor_id`, `${SET_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.metadata`);
      const setDocs = rows.map((r) => ({
        extractor_id: r.extractor_id,
        document_execution_id: r.document_execution_id,
        metadata: typeof r.metadata === 'object' ? r.metadata : JSON.parse(r.metadata || '{}'),
      }));
      result.push({ ...set, setDocs });
    }
    return result;
  },

  // All matching sets for an anchor document execution.
  async findMatchingSetsByAnchor(anchorDocExecId) {
    return db(MATCHING_SETS).where({ anchor_document_execution_id: anchorDocExecId });
  },

  // Rules where the given extractor is the anchor OR a target, for a specific user.
  async findRulesForExtractor(userId, extractorId) {
    const anchorRules = await db(RULES).where({ user_id: userId, anchor_extractor_id: extractorId });
    const targetRows = await db(TARGET_EXTRACTORS).where({ extractor_id: extractorId });
    const targetRuleIds = targetRows.map((r) => r.rule_id);
    const targetRules = targetRuleIds.length
      ? await db(RULES).where({ user_id: userId }).whereIn('id', targetRuleIds)
      : [];
    // De-duplicate: extractor could be both anchor and target in edge cases
    const anchorIds = new Set(anchorRules.map((r) => r.id));
    const merged = [...anchorRules, ...targetRules.filter((r) => !anchorIds.has(r.id))];
    return merged;
  },

  // ── Held Documents ────────────────────────────────────────────────────────

  async upsertHeldDoc({ userId, documentExecutionId, extractorId, workflowId, nodeId, slotId, slotLabel }) {
    const existing = await db(HELD_DOCS).where({ document_execution_id: documentExecutionId }).first();
    if (existing) return existing;
    const [row] = await db(HELD_DOCS)
      .insert({
        user_id: userId,
        document_execution_id: documentExecutionId,
        extractor_id: extractorId,
        workflow_id: workflowId || null,
        node_id: nodeId || null,
        slot_id: slotId || null,
        slot_label: slotLabel || null,
        held_at: new Date(),
      })
      .returning('*');
    return row;
  },

  async findHeldDocByDocExecId(documentExecutionId) {
    return db(HELD_DOCS).where({ document_execution_id: documentExecutionId }).first();
  },

  async updateHeldDocStatus(id, status) {
    const [row] = await db(HELD_DOCS).where({ id }).update({ status }).returning('*');
    return row;
  },

  async findHeldDocs(userId) {
    return db(HELD_DOCS)
      .join(DOC_EXECUTIONS, `${HELD_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .join(DOCUMENTS, `${DOC_EXECUTIONS}.document_id`, `${DOCUMENTS}.id`)
      .leftJoin(WORKFLOWS, `${HELD_DOCS}.workflow_id`, `${WORKFLOWS}.id`)
      .join('extractors', `${HELD_DOCS}.extractor_id`, 'extractors.id')
      .where(`${HELD_DOCS}.user_id`, userId)
      .select(
        `${HELD_DOCS}.*`,
        `${DOCUMENTS}.file_name`,
        `${WORKFLOWS}.name as workflow_name`,
        'extractors.name as extractor_name',
      )
      .orderBy(`${HELD_DOCS}.held_at`, 'desc');
  },

  // Find non-rejected held docs for a specific extractor, with their metadata from document_executions.
  async findHeldDocsByExtractor(userId, extractorId) {
    return db(HELD_DOCS)
      .join(DOC_EXECUTIONS, `${HELD_DOCS}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .where({ [`${HELD_DOCS}.user_id`]: userId, [`${HELD_DOCS}.extractor_id`]: extractorId })
      .whereNot(`${HELD_DOCS}.status`, 'rejected')
      .select(`${HELD_DOCS}.*`, `${DOC_EXECUTIONS}.metadata as doc_metadata`);
  },

  async findHeldDocMatchingSets(documentExecutionId) {
    return db(SET_DOCS)
      .join(MATCHING_SETS, `${SET_DOCS}.matching_set_id`, `${MATCHING_SETS}.id`)
      .join(RULES, `${MATCHING_SETS}.rule_id`, `${RULES}.id`)
      .where(`${SET_DOCS}.document_execution_id`, documentExecutionId)
      .select(
        `${MATCHING_SETS}.id`,
        `${MATCHING_SETS}.status`,
        `${MATCHING_SETS}.variation_id`,
        `${RULES}.name as rule_name`,
      );
  },

  async findAnchorDocs(userId, ruleId) {
    const rows = await db(MATCHING_SETS)
      .where(`${MATCHING_SETS}.rule_id`, ruleId)
      .join(DOC_EXECUTIONS, `${MATCHING_SETS}.anchor_document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .join(DOCUMENTS, `${DOC_EXECUTIONS}.document_id`, `${DOCUMENTS}.id`)
      .leftJoin(HELD_DOCS, `${HELD_DOCS}.document_execution_id`, `${MATCHING_SETS}.anchor_document_execution_id`)
      .select(
        `${MATCHING_SETS}.anchor_document_execution_id`,
        `${HELD_DOCS}.id as held_doc_id`,
        `${HELD_DOCS}.status as held_status`,
        `${HELD_DOCS}.slot_id`,
        `${HELD_DOCS}.slot_label`,
        `${DOCUMENTS}.file_name`,
        `${MATCHING_SETS}.id as set_id`,
        `${MATCHING_SETS}.status as set_status`,
        `${MATCHING_SETS}.variation_id`,
      )
      .orderBy(`${HELD_DOCS}.held_at`, 'desc');

    // Group by anchor_document_execution_id
    const grouped = {};
    for (const row of rows) {
      const key = row.anchor_document_execution_id;
      if (!grouped[key]) {
        grouped[key] = {
          anchor_document_execution_id: key,
          held_doc_id: row.held_doc_id,
          held_status: row.held_status,
          file_name: row.file_name,
          sets: [],
        };
      }
      grouped[key].sets.push({
        id: row.set_id,
        status: row.set_status,
        variation_id: row.variation_id,
      });
    }
    return Object.values(grouped);
  },

  // ── Comparison Results ────────────────────────────────────────────────────

  async upsertComparisonResult({ matchingSetId, comparisonRuleId, status, note }) {
    const existing = await db(COMPARISON_RESULTS)
      .where({ matching_set_id: matchingSetId, comparison_rule_id: comparisonRuleId })
      .first();
    const resolved_at = status !== 'pending' ? new Date() : null;
    if (existing) {
      const [row] = await db(COMPARISON_RESULTS)
        .where({ id: existing.id })
        .update({ status, note: note || null, resolved_at })
        .returning('*');
      return row;
    }
    const [row] = await db(COMPARISON_RESULTS)
      .insert({ matching_set_id: matchingSetId, comparison_rule_id: comparisonRuleId, status, note: note || null, resolved_at })
      .returning('*');
    return row;
  },

  async findComparisonResults(matchingSetId) {
    return db(COMPARISON_RESULTS)
      .join(COMPARISON_RULES, `${COMPARISON_RESULTS}.comparison_rule_id`, `${COMPARISON_RULES}.id`)
      .where(`${COMPARISON_RESULTS}.matching_set_id`, matchingSetId)
      .select(
        `${COMPARISON_RESULTS}.*`,
        `${COMPARISON_RULES}.formula`,
        `${COMPARISON_RULES}.level`,
        `${COMPARISON_RULES}.tolerance_type`,
        `${COMPARISON_RULES}.tolerance_value`,
      );
  },

  async isVariationFullyReconciled(matchingSetId, variationId) {
    const compRules = await db(COMPARISON_RULES).where({ variation_id: variationId });
    if (compRules.length === 0) return true; // no comparisons = trivially reconciled
    const results = await db(COMPARISON_RESULTS).where({ matching_set_id: matchingSetId });
    return compRules.every((cr) => {
      const res = results.find((r) => r.comparison_rule_id === cr.id);
      return res && (res.status === 'auto' || res.status === 'force');
    });
  },
};
