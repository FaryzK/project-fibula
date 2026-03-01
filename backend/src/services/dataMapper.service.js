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
 * Evaluate a target expression.
 * - Simple column reference (e.g. "VendorCode") → direct lookup in matched record
 * - Formula (e.g. "schema * conversion") → VM evaluation with schema + all set columns
 *
 * `schema` keyword = current value of the target's schema field in the document.
 * Bare names = columns from the matched data map set record.
 */
function evalTarget(expression, schemaVal, matchedRecord) {
  const trimmed = (expression || '').trim();
  if (!trimmed) return undefined;
  // Direct column reference (handles names with spaces too)
  if (trimmed in matchedRecord) return matchedRecord[trimmed];
  // Expression evaluation
  try {
    const context = vm.createContext({ schema: schemaVal, ...matchedRecord, Math });
    return vm.runInContext(trimmed, context, { timeout: 100 });
  } catch (_) {
    return undefined;
  }
}

/**
 * Score an array of map set records against all lookups.
 * schemaResolver(fieldPath) returns the schema value for a given lookup field.
 * Returns sorted { record, score } pairs (best first), or [] if no lookup could be evaluated.
 */
function scoreRecords(records, lookups, schemaResolver) {
  let candidates = records.map((record) => ({ record, score: 1.0 }));
  let anyEvaluated = false;

  for (const lookup of lookups) {
    const schemaVal = schemaResolver(lookup.schema_field);
    if (schemaVal === undefined) continue;
    anyEvaluated = true;
    candidates = candidates
      .map(({ record }) => {
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

  if (!anyEvaluated) return [];
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Apply a data map rule to document metadata.
 * Returns enriched metadata.
 */
async function applyRule(rule, metadata) {
  if (!rule.lookups || rule.lookups.length === 0) return metadata;

  const header = typeof metadata.header === 'string' ? JSON.parse(metadata.header) : (metadata.header || {});

  function resolveField(fieldPath) {
    const direct = getField(metadata, fieldPath);
    if (direct !== undefined) return direct;
    const fromHeader = header[fieldPath];
    if (fromHeader !== undefined) return fromHeader;
    return undefined;
  }

  // Use rule-level set
  const setId = rule.data_map_set_id;
  if (!setId) return metadata;

  const rawRecords = await dataMapperModel.findSetRecords(setId);
  const allRecords = rawRecords.map((r) => {
    const vals = typeof r.values === 'string' ? JSON.parse(r.values) : r.values;
    return { _id: r.id, _set_id: setId, ...vals };
  });

  // Separate targets: dot in schema_field → table column, else header
  const headerTargets = (rule.targets || []).filter((t) => !t.schema_field.includes('.'));
  const tableTargets = (rule.targets || []).filter((t) => t.schema_field.includes('.'));

  const enrichedHeader = { ...header };
  const enriched = { ...metadata, header: enrichedHeader };

  // ── Header block ──────────────────────────────────────────────────────────
  if (headerTargets.length > 0) {
    const candidates = scoreRecords(allRecords, rule.lookups, resolveField);
    if (candidates.length > 0) {
      const bestRecord = candidates[0].record;
      for (const target of headerTargets) {
        const field = target.schema_field;
        const value = evalTarget(target.expression, resolveField(field), bestRecord);
        if (field in enrichedHeader) {
          enrichedHeader[field] = value;
        } else {
          enriched[field] = value;
        }
      }
    }
  }

  // ── Table block ───────────────────────────────────────────────────────────
  if (tableTargets.length > 0) {
    // Group targets by table name (parsed from "TableName.column")
    const tableGroups = {};
    for (const t of tableTargets) {
      const dotIdx = t.schema_field.indexOf('.');
      const tblName = dotIdx !== -1 ? t.schema_field.slice(0, dotIdx) : t.schema_field;
      const colName = dotIdx !== -1 ? t.schema_field.slice(dotIdx + 1) : t.schema_field;
      if (!tableGroups[tblName]) tableGroups[tblName] = [];
      tableGroups[tblName].push({ ...t, _colName: colName });
    }

    const enrichedTables = { ...(metadata.tables || {}) };

    for (const [tableName, tgts] of Object.entries(tableGroups)) {
      const rows = Array.isArray(enrichedTables[tableName]) ? enrichedTables[tableName] : [];
      if (rows.length === 0) continue;

      const newRows = [];
      for (const row of rows) {
        // Row-level resolver: table columns take priority, then fall back to header
        function resolveRowField(fieldPath) {
          const di = fieldPath.indexOf('.');
          if (di !== -1 && fieldPath.slice(0, di) === tableName) {
            return row[fieldPath.slice(di + 1)];
          }
          return header[fieldPath] !== undefined ? header[fieldPath] : getField(metadata, fieldPath);
        }

        const candidates = scoreRecords(allRecords, rule.lookups, resolveRowField);
        if (candidates.length === 0) {
          newRows.push(row);
          continue;
        }

        const bestRecord = candidates[0].record;
        const newRow = { ...row };
        for (const tg of tgts) {
          newRow[tg._colName] = evalTarget(tg.expression, row[tg._colName], bestRecord);
        }
        newRows.push(newRow);
      }
      enrichedTables[tableName] = newRows;
    }

    enriched.tables = enrichedTables;
  }

  return enriched;
}

module.exports = { applyRule };
