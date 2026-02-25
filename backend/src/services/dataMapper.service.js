const dataMapperModel = require('../models/dataMapper.model');
const vm = require('vm');

/**
 * Simple string similarity: 1.0 = identical, 0.0 = completely different.
 * Uses normalised Levenshtein distance.
 */
function stringSimilarity(a, b) {
  const na = String(a || '').toLowerCase().trim();
  const nb = String(b || '').toLowerCase().trim();
  if (na === nb) return 1.0;
  if (na.length === 0 || nb.length === 0) return 0.0;

  const dp = Array.from({ length: na.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= nb.length; j++) dp[0][j] = j;
  for (let i = 1; i <= na.length; i++) {
    for (let j = 1; j <= nb.length; j++) {
      dp[i][j] = na[i - 1] === nb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[na.length][nb.length] / Math.max(na.length, nb.length);
}

/**
 * Get a nested field value from metadata using dot-notation path.
 */
function getField(metadata, fieldPath) {
  const parts = fieldPath.split('.');
  let val = metadata;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
}

/**
 * Evaluate a calculation_expression with schema and mapset context.
 * e.g. "schema.quantity * mapset.conversion"
 */
function evalCalculation(expression, schemaVal, mapsetVal) {
  try {
    const context = vm.createContext({ schema: schemaVal, mapset: mapsetVal, Math });
    return vm.runInContext(expression, context, { timeout: 100 });
  } catch (_) {
    return undefined;
  }
}

/**
 * Apply a data map rule to document metadata.
 * Returns enriched metadata.
 */
async function applyRule(rule, metadata) {
  if (!rule.lookups || rule.lookups.length === 0) return metadata;

  // Get all records from the first lookup's set (they all share the same set for a rule)
  // Collect distinct set IDs used in lookups
  const setIds = [...new Set(rule.lookups.map((l) => l.data_map_set_id))];

  // Build a combined records map: setId → [record.values parsed]
  const recordsBySet = {};
  for (const setId of setIds) {
    const rawRecords = await dataMapperModel.findSetRecords(setId);
    recordsBySet[setId] = rawRecords.map((r) => {
      const vals = typeof r.values === 'string' ? JSON.parse(r.values) : r.values;
      return { _id: r.id, _set_id: setId, ...vals };
    });
  }

  // Score each record against all lookups
  // All lookups must match (AND logic)
  let candidates = recordsBySet[setIds[0]] ? [...recordsBySet[setIds[0]]] : [];

  for (const lookup of rule.lookups) {
    const schemaVal = getField(metadata, lookup.schema_field);
    if (schemaVal === undefined) continue; // skip if field not present

    candidates = candidates
      .map((record) => {
        const recordVal = record[lookup.map_set_column];
        const sim = stringSimilarity(schemaVal, recordVal);

        if (lookup.match_type === 'exact') {
          return sim === 1.0 ? { record, score: 1.0 } : null;
        } else {
          const threshold = lookup.match_threshold != null ? lookup.match_threshold : 0.8;
          return sim >= threshold ? { record, score: sim } : null;
        }
      })
      .filter(Boolean);
  }

  if (candidates.length === 0) return metadata;

  // Best match: highest score, then first
  candidates.sort((a, b) => b.score - a.score);
  const bestRecord = candidates[0].record;

  // Apply targets
  const enriched = { ...metadata };
  for (const target of rule.targets || []) {
    const mapsetVal = bestRecord[target.map_set_column];

    if (target.mode === 'calculation' && target.calculation_expression) {
      const schemaVal = getField(metadata, target.schema_field);
      enriched[target.schema_field] = evalCalculation(target.calculation_expression, schemaVal, mapsetVal);
    } else {
      enriched[target.schema_field] = mapsetVal;
    }
  }

  return enriched;
}

module.exports = { applyRule };
