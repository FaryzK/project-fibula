const reconciliationModel = require('../models/reconciliation.model');
const documentExecutionModel = require('../models/documentExecution.model');
const extractorModel = require('../models/extractor.model');
const vm = require('vm');

/**
 * Simple string similarity for fuzzy matching (Levenshtein-based).
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

function getField(obj, fieldPath) {
  const parts = fieldPath.split('.');
  let val = obj;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
}

/**
 * Check whether the incoming document belongs to a pending matching set.
 *
 * Links are any-to-any (left_extractor_id/left_field ↔ right_extractor_id/right_field).
 * For each link that involves the incoming extractor:
 *   - If the other side is already in the set: MUST match, or return false.
 *   - If the other side is not in the set yet: skip (can't evaluate yet).
 * If every relevant link was skipped (other side absent), the doc can't be placed yet → return false.
 */
function docBelongsToSet(incomingExtractorId, incomingMeta, setDocs, docLinks) {
  const relevantLinks = docLinks.filter(
    (l) => l.left_extractor_id === incomingExtractorId || l.right_extractor_id === incomingExtractorId
  );
  if (relevantLinks.length === 0) return true; // no constraints = match by default

  let anyEvaluated = false;

  for (const link of relevantLinks) {
    const isOnLeft = link.left_extractor_id === incomingExtractorId;
    const incomingField = isOnLeft ? link.left_field : link.right_field;
    const otherExtractorId = isOnLeft ? link.right_extractor_id : link.left_extractor_id;
    const otherField = isOnLeft ? link.right_field : link.left_field;

    const otherDoc = setDocs.find((d) => d.extractor_id === otherExtractorId);
    if (!otherDoc) continue; // other side not in set yet — skip

    anyEvaluated = true;
    const incomingVal = getField(incomingMeta, incomingField);
    const otherVal = getField(otherDoc.metadata.header || otherDoc.metadata, otherField);

    if (incomingVal === undefined || otherVal === undefined) continue;

    if (link.match_type === 'exact') {
      if (String(incomingVal) !== String(otherVal)) return false;
    } else {
      const threshold = link.match_threshold != null ? link.match_threshold : 0.8;
      if (stringSimilarity(incomingVal, otherVal) < threshold) return false;
    }
  }

  return anyEvaluated;
}

/**
 * Evaluate a comparison formula using a context of doc metadata keyed by extractor name.
 */
function evalFormula(formula, context) {
  try {
    const ctx = vm.createContext({ ...context, Math, Number });
    return Boolean(vm.runInContext(formula, ctx, { timeout: 100 }));
  } catch (_) {
    return false;
  }
}

/**
 * Sanitize a raw name (extractor, table, or column) for use as a JS identifier in the VM.
 */
function sanitizeName(name) {
  return String(name).replace(/[^a-zA-Z0-9_$]/g, '_');
}

/**
 * Rewrite a formula string in 3 passes so it can be evaluated in a VM context
 * where all names have been sanitized.
 *
 * nameToSanitized: { 'PO Extractor': 'PO_Extractor', ... }
 * tableNameMaps:   { 'PO_Extractor': { 'PO table': 'PO_table', ... }, ... }
 * fieldNameMaps:   { 'PO_Extractor': { 'Credit Total': 'Credit_Total', ... }, ... }
 *                  (also used for column names in table contexts)
 */
function rewriteFormula(formula, nameToSanitized, tableNameMaps, fieldNameMaps) {
  // Pass 1: extractor names (longest first)
  const sortedNames = Object.keys(nameToSanitized).sort((a, b) => b.length - a.length);
  for (const orig of sortedNames) {
    formula = formula.split(orig).join(nameToSanitized[orig]);
  }
  // Pass 2: table names (longest first, scoped by sanitized extractor name)
  for (const [sanitizedExtractor, tMap] of Object.entries(tableNameMaps || {})) {
    const sortedTables = Object.keys(tMap).sort((a, b) => b.length - a.length);
    for (const origTable of sortedTables) {
      formula = formula
        .split(`${sanitizedExtractor}.${origTable}`)
        .join(`${sanitizedExtractor}.${tMap[origTable]}`);
    }
  }
  // Pass 3: field/column names (scoped by sanitized extractor name, longest first)
  for (const [sanitizedExtractor, fMap] of Object.entries(fieldNameMaps || {})) {
    const sortedFields = Object.keys(fMap).sort((a, b) => b.length - a.length);
    for (const origField of sortedFields) {
      formula = formula
        .split(`${sanitizedExtractor}.${origField}`)
        .join(`${sanitizedExtractor}.${fMap[origField]}`);
    }
  }
  // Pass 4: lone = → == (leaves ==, !=, <=, >= untouched)
  formula = formula.replace(/(?<![=!<>])=(?!=)/g, '==');
  return formula;
}

/**
 * Evaluate a formula with epsilon + user tolerance fallback.
 * Returns boolean.
 */
function evalWithTolerance(formula, context, compRule) {
  let result = evalFormula(formula, context);
  if (!result) {
    const match = formula.match(/^(.+?)\s*==\s*(.+)$/);
    if (match) {
      try {
        const ctx = vm.createContext({ ...context, Math, Number });
        const leftVal = Number(vm.runInContext(match[1].trim(), ctx, { timeout: 100 }));
        const rightVal = Number(vm.runInContext(match[2].trim(), ctx, { timeout: 100 }));
        if (!isNaN(leftVal) && !isNaN(rightVal)) {
          const diff = Math.abs(leftVal - rightVal);
          if (diff <= 1e-9) {
            result = true;
          } else if (compRule.tolerance_value != null) {
            if (compRule.tolerance_type === 'absolute') {
              result = diff <= compRule.tolerance_value;
            } else if (compRule.tolerance_type === 'percentage' && rightVal !== 0) {
              result = (diff / Math.abs(rightVal)) * 100 <= compRule.tolerance_value;
            }
          }
        }
      } catch (_) { /* leave result as false */ }
    }
  }
  return result;
}

/**
 * Build an array of row groups by BFS-joining from anchor extractor outward.
 * Each group: { [extractorId]: { [tableType]: rowObject | null } }
 * A null entry means no matching row was found in that doc (value defaults to 0 at eval time).
 */
function buildRowGroups(anchorExtractorId, setDocs, tableMatchingKeys) {
  if (!tableMatchingKeys || tableMatchingKeys.length === 0) return [];

  // Build tableRows index: `${extractorId}.${tableType}` → rows[]
  const tableRows = {};
  for (const doc of setDocs) {
    const tables = doc.metadata?.tables || {};
    for (const [tableName, rows] of Object.entries(tables)) {
      if (Array.isArray(rows)) {
        tableRows[`${doc.extractor_id}.${tableName}`] = rows;
      }
    }
  }

  // Find anchor's table type: look for a key where anchor is on either side
  const anchorKey = tableMatchingKeys.find(
    (k) => k.left_extractor_id === anchorExtractorId || k.right_extractor_id === anchorExtractorId
  );
  if (!anchorKey) return [];

  const anchorOnLeft = anchorKey.left_extractor_id === anchorExtractorId;
  const anchorTableType = anchorOnLeft ? anchorKey.left_table_type : anchorKey.right_table_type;
  const anchorKeyCol = anchorOnLeft ? anchorKey.left_column : anchorKey.right_column;
  const anchorRows = tableRows[`${anchorExtractorId}.${anchorTableType}`] || [];
  if (anchorRows.length === 0) return [];

  const groups = [];
  for (const anchorRow of anchorRows) {
    const group = { [anchorExtractorId]: { [anchorTableType]: anchorRow } };
    const matched = new Set([anchorExtractorId]);

    // BFS: keep following keys until no more new extractors can be added
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of tableMatchingKeys) {
        const leftMatched = matched.has(key.left_extractor_id);
        const rightMatched = matched.has(key.right_extractor_id);
        if (leftMatched === rightMatched) continue; // both done or neither done — skip

        if (leftMatched) {
          // Use left side's already-matched row to look up right side
          const leftRow = group[key.left_extractor_id]?.[key.left_table_type] || {};
          const keyVal = leftRow[key.left_column];
          const candidates = tableRows[`${key.right_extractor_id}.${key.right_table_type}`] || [];
          const found = keyVal != null
            ? candidates.find((r) => String(r[key.right_column]) === String(keyVal)) || null
            : null;
          if (!group[key.right_extractor_id]) group[key.right_extractor_id] = {};
          group[key.right_extractor_id][key.right_table_type] = found;
          matched.add(key.right_extractor_id);
          changed = true;
        } else {
          // Use right side's already-matched row to look up left side
          const rightRow = group[key.right_extractor_id]?.[key.right_table_type] || {};
          const keyVal = rightRow[key.right_column];
          const candidates = tableRows[`${key.left_extractor_id}.${key.left_table_type}`] || [];
          const found = keyVal != null
            ? candidates.find((r) => String(r[key.left_column]) === String(keyVal)) || null
            : null;
          if (!group[key.left_extractor_id]) group[key.left_extractor_id] = {};
          group[key.left_extractor_id][key.left_table_type] = found;
          matched.add(key.left_extractor_id);
          changed = true;
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Extract which columns of each (sanitizedExtractor.sanitizedTable) are referenced
 * in the sanitized formula. Used to build zero-fallback rows for missing docs.
 * Returns: { 'ExtName.TableName': ['Col1', 'Col2'] }
 */
function extractColRefs(sanitizedFormula) {
  const refs = {};
  const regex = /(\w+)\.(\w+)\.(\w+)/g;
  let m;
  while ((m = regex.exec(sanitizedFormula)) !== null) {
    const key = `${m[1]}.${m[2]}`;
    if (!refs[key]) refs[key] = [];
    if (!refs[key].includes(m[3])) refs[key].push(m[3]);
  }
  return refs;
}

/**
 * Evaluate a table-level comparison rule against the matched row groups.
 * Returns { passed: boolean }
 */
function runTableComparison(compRule, anchorExtractorId, setDocs, extractors, tableMatchingKeys) {
  const rowGroups = buildRowGroups(anchorExtractorId, setDocs, tableMatchingKeys);
  if (rowGroups.length === 0) return { passed: true }; // nothing to compare

  // Build nameToSanitized, tableNameMaps, fieldNameMaps for the row context.
  // tableNameMaps is built from tableMatchingKeys so that even empty tables get their
  // names sanitized (empty arrays would be skipped if we relied on row data alone).
  const nameToSanitized = {};
  const tableNameMaps = {};  // sanitizedExtractor → { 'Original Table': 'Original_Table' }
  const colNameMaps = {};    // 'sanitizedExtractor.sanitizedTable' → { 'Original Col': 'Original_Col' }

  // Step A: extractor names from setDocs
  for (const doc of setDocs) {
    const extractor = extractors.find((e) => e.id === doc.extractor_id);
    if (!extractor) continue;
    nameToSanitized[extractor.name] = sanitizeName(extractor.name);
  }

  // Step B: table names from tableMatchingKeys (handles empty tables correctly)
  for (const key of (tableMatchingKeys || [])) {
    for (const [extId, tableType] of [
      [key.left_extractor_id, key.left_table_type],
      [key.right_extractor_id, key.right_table_type],
    ]) {
      const extractor = extractors.find((e) => e.id === extId);
      if (!extractor) continue;
      const sanitizedExt = sanitizeName(extractor.name);
      const sanitizedTable = sanitizeName(tableType);
      if (tableType !== sanitizedTable) {
        if (!tableNameMaps[sanitizedExt]) tableNameMaps[sanitizedExt] = {};
        tableNameMaps[sanitizedExt][tableType] = sanitizedTable;
      }
    }
  }

  // Step C: column names from actual rows (only non-empty tables have sample rows)
  for (const doc of setDocs) {
    const extractor = extractors.find((e) => e.id === doc.extractor_id);
    if (!extractor) continue;
    const sanitizedExt = sanitizeName(extractor.name);
    const tables = doc.metadata?.tables || {};
    for (const [tableName, rows] of Object.entries(tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const sanitizedTable = sanitizeName(tableName);
      const mapKey = `${sanitizedExt}.${sanitizedTable}`;
      if (!colNameMaps[mapKey]) colNameMaps[mapKey] = {};
      for (const colName of Object.keys(rows[0])) {
        const sanitizedCol = sanitizeName(colName);
        if (colName !== sanitizedCol) colNameMaps[mapKey][colName] = sanitizedCol;
      }
    }
  }

  // Rewrite formula once (shared across all row groups)
  const rewrittenFormula = rewriteFormula(compRule.formula, nameToSanitized, tableNameMaps, colNameMaps);
  const colRefs = extractColRefs(rewrittenFormula);

  for (const group of rowGroups) {
    // Build the per-row VM context
    const context = {};
    for (const [extractorId, tableMap] of Object.entries(group)) {
      const extractor = extractors.find((e) => e.id === extractorId);
      if (!extractor) continue;
      const sanitizedExt = sanitizeName(extractor.name);
      if (!context[sanitizedExt]) context[sanitizedExt] = {};

      for (const [tableType, row] of Object.entries(tableMap)) {
        const sanitizedTable = sanitizeName(tableType);
        if (row === null) {
          // Missing row — fill with 0 for all columns referenced in the formula
          const zeros = {};
          for (const col of colRefs[`${sanitizedExt}.${sanitizedTable}`] || []) {
            zeros[col] = 0;
          }
          context[sanitizedExt][sanitizedTable] = zeros;
        } else {
          // Sanitize column names
          const sanitizedRow = {};
          for (const [col, val] of Object.entries(row)) {
            sanitizedRow[sanitizeName(col)] = val;
          }
          context[sanitizedExt][sanitizedTable] = sanitizedRow;
        }
      }
    }

    const rowPassed = evalWithTolerance(rewrittenFormula, context, compRule);
    if (!rowPassed) return { passed: false };
  }

  return { passed: true };
}

/**
 * Run a single comparison_rule against the set of docs.
 * Returns { passed: boolean }
 */
async function runSingleComparison(compRule, setDocs, extractors, tableMatchingKeys, anchorExtractorId) {
  if (!compRule.formula) return { passed: true };

  if (compRule.level === 'table') {
    return runTableComparison(compRule, anchorExtractorId, setDocs, extractors, tableMatchingKeys || []);
  }

  // --- Header-level ---
  // Build context: sanitize both extractor names AND header field names.
  const context = {};
  const nameToSanitized = {};
  const fieldNameMaps = {}; // sanitizedExtractorName → { 'Original Field': 'Original_Field' }
  for (const doc of setDocs) {
    const docExec = await documentExecutionModel.findById(doc.document_execution_id);
    const meta = typeof docExec?.metadata === 'object' ? docExec.metadata : JSON.parse(docExec?.metadata || '{}');
    const extractor = extractors.find((e) => e.id === doc.extractor_id);
    if (extractor) {
      const sanitizedName = sanitizeName(extractor.name);
      nameToSanitized[extractor.name] = sanitizedName;
      const header = meta.header || meta;
      const sanitizedHeader = {};
      const fieldMap = {};
      for (const [key, val] of Object.entries(header)) {
        const sanitizedKey = sanitizeName(key);
        sanitizedHeader[sanitizedKey] = val;
        if (key !== sanitizedKey) fieldMap[key] = sanitizedKey;
      }
      context[sanitizedName] = sanitizedHeader;
      if (Object.keys(fieldMap).length > 0) fieldNameMaps[sanitizedName] = fieldMap;
    }
  }

  const formula = rewriteFormula(compRule.formula, nameToSanitized, {}, fieldNameMaps);
  return { passed: evalWithTolerance(formula, context, compRule) };
}

/**
 * Run all comparison_rules for a variation against a matching set.
 * Upserts comparison_results as 'auto' (passed) or 'pending' (failed).
 * Skips rules already marked 'force' (user-approved).
 */
async function runAndRecordComparisons(matchingSetId, rule, variation, setDocs, extractors) {
  if (!variation.comparison_rules || variation.comparison_rules.length === 0) return;
  for (const cr of variation.comparison_rules) {
    // Don't overwrite a force-reconciled result
    const existing = await reconciliationModel.upsertComparisonResult({
      matchingSetId,
      comparisonRuleId: cr.id,
      status: 'pending', // temporary; will be overwritten below
    });
    if (existing.status === 'force') continue;

    const { passed } = await runSingleComparison(
      cr,
      setDocs,
      extractors,
      variation.table_matching_keys || [],
      rule.anchor_extractor_id,
    );
    await reconciliationModel.upsertComparisonResult({
      matchingSetId,
      comparisonRuleId: cr.id,
      status: passed ? 'auto' : 'pending',
    });
  }
}

/**
 * After a doc is added to a set, scan held docs of still-missing extractor types and
 * retroactively add any that match. Continues until no more docs can be added.
 * Returns the final setDocs (plain rows, no metadata) for completeness checks.
 */
async function backfillHeldDocsToSet(setId, rule, variation, userId) {
  const expectedIds = [rule.anchor_extractor_id, ...rule.target_extractors.map((t) => t.extractor_id)];
  let changed = true;
  while (changed) {
    changed = false;
    const currentSetDocs = await reconciliationModel.findSetDocsWithMetadata(setId);
    const presentIds = new Set(currentSetDocs.map((d) => d.extractor_id));
    const missingIds = expectedIds.filter((id) => !presentIds.has(id));
    for (const missingId of missingIds) {
      const heldDocs = await reconciliationModel.findHeldDocsByExtractor(userId, missingId);
      for (const held of heldDocs) {
        const meta = typeof held.doc_metadata === 'object' ? held.doc_metadata : JSON.parse(held.doc_metadata || '{}');
        const matches = docBelongsToSet(missingId, meta.header || meta, currentSetDocs, variation.doc_matching_links);
        if (matches) {
          await reconciliationModel.addDocToSet({
            matchingSetId: setId,
            documentExecutionId: held.document_execution_id,
            extractorId: missingId,
          });
          changed = true;
          break; // re-fetch setDocs and retry
        }
      }
      if (changed) break;
    }
  }
}

/**
 * After all docs are present, run comparisons and check for auto-reconcile.
 * Returns { fullyReconciled, setDocs } so the caller can decide on send-out.
 */
async function finaliseSet(setId, rule, variation, allExtractors) {
  const setDocs = await reconciliationModel.findSetDocs(setId);
  const presentIds = new Set(setDocs.map((d) => d.extractor_id));
  const expectedIds = [rule.anchor_extractor_id, ...rule.target_extractors.map((t) => t.extractor_id)];
  if (!expectedIds.every((id) => presentIds.has(id))) return { fullyReconciled: false, setDocs };

  const setDocsWithMeta = await reconciliationModel.findSetDocsWithMetadata(setId);
  await runAndRecordComparisons(setId, rule, variation, setDocsWithMeta, allExtractors);

  const fullyReconciled = await reconciliationModel.isVariationFullyReconciled(setId, variation.id);
  if (fullyReconciled) {
    await reconciliationModel.updateMatchingSetStatus(setId, 'reconciled');
    // Note: held doc status is NOT updated here — "matching set reconciled" means comparisons passed,
    // not that the doc was sent out. Status is updated only at the actual release points below.
  }
  return { fullyReconciled, setDocs };
}

/**
 * Process a document arriving at a RECONCILIATION node.
 *
 * Returns:
 *   { type: 'hold' }
 *   { type: 'continue', outputMetadata, outputPort, setDocExecIds: [{docExecutionId, outputPort}] }
 */
async function processDocument({ docExecutionId, metadata, workflowId, nodeId, userId, slotId, slotLabel, extractorId }) {
  // 1. Record held doc with source info
  await reconciliationModel.upsertHeldDoc({
    userId,
    documentExecutionId: docExecutionId,
    extractorId,
    workflowId,
    nodeId,
    slotId,
    slotLabel,
  });
  // Persist enriched metadata (header + tables) so comparison display can read actual field values
  await documentExecutionModel.updateStatus(docExecutionId, { metadata });

  // 2. Find all applicable rules for this extractor
  const ruleStubs = await reconciliationModel.findRulesForExtractor(userId, extractorId);
  if (ruleStubs.length === 0) return { type: 'hold' };

  let shouldContinue = false;
  const setDocExecIds = [];

  for (const ruleStub of ruleStubs) {
    const rule = await reconciliationModel.findById(ruleStub.id);
    if (!rule) continue;

    const isAnchor = extractorId === rule.anchor_extractor_id;
    const isTarget = rule.target_extractors.some((t) => t.extractor_id === extractorId);

    // Build extractor lookup (id → real name) for comparison formula context
    const allExtractorIds = [rule.anchor_extractor_id, ...rule.target_extractors.map((t) => t.extractor_id)];
    const allExtractors = await Promise.all(
      allExtractorIds.map(async (eid) => {
        const ex = await extractorModel.findById(eid);
        return { id: eid, name: ex?.name || eid };
      })
    );

    for (const variation of rule.variations) {
      if (isAnchor) {
        // Create a matching set for this anchor × variation if one doesn't already exist
        const existingSets = await reconciliationModel.findMatchingSetsByAnchor(docExecutionId);
        const existingForVariation = existingSets.find((s) => s.variation_id === variation.id);
        let setId = existingForVariation?.id;
        if (!setId) {
          const newSet = await reconciliationModel.createMatchingSet({
            ruleId: rule.id,
            variationId: variation.id,
            anchorDocExecId: docExecutionId,
          });
          setId = newSet.id;
          await reconciliationModel.addDocToSet({
            matchingSetId: setId,
            documentExecutionId: docExecutionId,
            extractorId,
          });
          // Retroactively pull in held docs of missing types
          await backfillHeldDocsToSet(setId, rule, variation, userId);
        }

        const { fullyReconciled } = await finaliseSet(setId, rule, variation, allExtractors);
        // Only the anchor doc itself is released — target docs are handled by their own anchor rules
        if (fullyReconciled && rule.auto_send_out) {
          const anchorHeld = await reconciliationModel.findHeldDocByDocExecId(docExecutionId);
          if (anchorHeld) await reconciliationModel.updateHeldDocStatus(anchorHeld.id, 'reconciled');
          shouldContinue = true;
        }
      }

      if (isTarget) {
        // Find pending sets in this variation where this doc belongs
        const pendingSets = await reconciliationModel.findPendingMatchingSetsByVariation(variation.id);
        for (const set of pendingSets) {
          const matches = docBelongsToSet(
            extractorId,
            metadata.header || metadata,
            set.setDocs,
            variation.doc_matching_links
          );
          if (!matches) continue;

          await reconciliationModel.addDocToSet({
            matchingSetId: set.id,
            documentExecutionId: docExecutionId,
            extractorId,
          });

          // Retroactively pull in held docs of still-missing types
          await backfillHeldDocsToSet(set.id, rule, variation, userId);

          // Run comparisons and update matching set status.
          // If auto_send_out, release only the anchor doc — target docs are handled by their own rules.
          const { fullyReconciled, setDocs: finalDocs } = await finaliseSet(set.id, rule, variation, allExtractors);
          if (fullyReconciled && rule.auto_send_out) {
            const anchorDoc = finalDocs.find((d) => d.extractor_id === rule.anchor_extractor_id);
            if (anchorDoc && anchorDoc.document_execution_id !== docExecutionId) {
              const hd = await reconciliationModel.findHeldDocByDocExecId(anchorDoc.document_execution_id);
              if (hd) await reconciliationModel.updateHeldDocStatus(hd.id, 'reconciled');
              setDocExecIds.push({ docExecutionId: anchorDoc.document_execution_id, outputPort: hd?.slot_id || slotId });
            }
          }
        }
      }
    }
  }

  if (shouldContinue) {
    return {
      type: 'continue',
      outputMetadata: { ...metadata, _reconciled: true },
      outputPort: slotId,
      setDocExecIds,
    };
  }

  // Arriving doc stays held, but some already-held anchor docs may now be releasable.
  return { type: 'hold', setDocExecIds };
}

module.exports = { processDocument, runAndRecordComparisons, runSingleComparison };
