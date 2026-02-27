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

  // Header and tables may be objects or JSON strings
  const header = typeof metadata.header === 'string' ? JSON.parse(metadata.header) : (metadata.header || {});

  // Resolve a schema field: try direct path first, then inside header
  function resolveField(fieldPath) {
    const direct = getField(metadata, fieldPath);
    if (direct !== undefined) return direct;
    // Schema field names from the extractor (e.g. "Vendor Name") live under header
    const fromHeader = header[fieldPath];
    if (fromHeader !== undefined) return fromHeader;
    return undefined;
  }

  // Collect distinct set IDs used in lookups
  const setIds = [...new Set(rule.lookups.map((l) => l.data_map_set_id))];

  // Build records map: setId → parsed records
  const recordsBySet = {};
  for (const setId of setIds) {
    const rawRecords = await dataMapperModel.findSetRecords(setId);
    recordsBySet[setId] = rawRecords.map((r) => {
      const vals = typeof r.values === 'string' ? JSON.parse(r.values) : r.values;
      return { _id: r.id, _set_id: setId, ...vals };
    });
  }

  // Score each record against all lookups (AND logic)
  let candidates = recordsBySet[setIds[0]] ? [...recordsBySet[setIds[0]]] : [];

  for (const lookup of rule.lookups) {
    const schemaVal = resolveField(lookup.schema_field);
    if (schemaVal === undefined) continue;

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

  candidates.sort((a, b) => b.score - a.score);
  const bestRecord = candidates[0].record;

  // Apply targets — write into header if the field exists there, else top-level
  const enrichedHeader = { ...header };
  const enriched = { ...metadata, header: enrichedHeader };

  for (const target of rule.targets || []) {
    const mapsetVal = bestRecord[target.map_set_column];
    const field = target.schema_field;

    let value;
    if (target.mode === 'calculation' && target.calculation_expression) {
      const schemaVal = resolveField(field);
      value = evalCalculation(target.calculation_expression, schemaVal, mapsetVal);
    } else {
      value = mapsetVal;
    }

    // Write to header if the field lives there, otherwise top-level
    if (field in enrichedHeader) {
      enrichedHeader[field] = value;
    } else {
      enriched[field] = value;
    }
  }

  return enriched;
}

module.exports = { applyRule };
