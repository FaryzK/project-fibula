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
 * Run a single comparison_rule against the set of docs.
 * Returns { passed: boolean }
 */
async function runSingleComparison(compRule, setDocs, extractors) {
  if (!compRule.formula) return { passed: true };

  // Build context: sanitize both extractor names AND header field names (both can have spaces).
  // Spaces/special chars → underscores so everything is a valid JS identifier in the VM.
  const context = {};
  const nameToSanitized = {};
  const fieldNameMaps = {}; // sanitizedExtractorName → { 'Original Field': 'Original_Field' }
  for (const doc of setDocs) {
    const docExec = await documentExecutionModel.findById(doc.document_execution_id);
    const meta = typeof docExec?.metadata === 'object' ? docExec.metadata : JSON.parse(docExec?.metadata || '{}');
    const extractor = extractors.find((e) => e.id === doc.extractor_id);
    if (extractor) {
      const sanitizedName = extractor.name.replace(/[^a-zA-Z0-9_$]/g, '_');
      nameToSanitized[extractor.name] = sanitizedName;
      const header = meta.header || meta;
      const sanitizedHeader = {};
      const fieldMap = {};
      for (const [key, val] of Object.entries(header)) {
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_$]/g, '_');
        sanitizedHeader[sanitizedKey] = val;
        if (key !== sanitizedKey) fieldMap[key] = sanitizedKey;
      }
      context[sanitizedName] = sanitizedHeader;
      if (Object.keys(fieldMap).length > 0) fieldNameMaps[sanitizedName] = fieldMap;
    }
  }

  if (compRule.level !== 'header') return { passed: true }; // skip table-level for MVP

  // Rewrite formula in three passes:
  //   1. Replace extractor names (longest first to avoid partial matches)
  //   2. Replace field names that had spaces (e.g. "Credit Total" → "Credit_Total")
  //   3. Normalise lone = to == (leaves ==, !=, <=, >= untouched)
  let formula = compRule.formula;
  const sortedNames = Object.keys(nameToSanitized).sort((a, b) => b.length - a.length);
  for (const origName of sortedNames) {
    formula = formula.split(origName).join(nameToSanitized[origName]);
  }
  for (const [sanitizedExtractor, fieldMap] of Object.entries(fieldNameMaps)) {
    const sortedFields = Object.keys(fieldMap).sort((a, b) => b.length - a.length);
    for (const origField of sortedFields) {
      formula = formula.split(`${sanitizedExtractor}.${origField}`).join(`${sanitizedExtractor}.${fieldMap[origField]}`);
    }
  }
  // (?<![=!<>])=(?!=) matches a lone = only; leaves ==, !=, <=, >= untouched.
  formula = formula.replace(/(?<![=!<>])=(?!=)/g, '==');

  let result = evalFormula(formula, context);

  // Floating-point fallback: when == returns false but both sides are numeric,
  // check with a tiny epsilon first (handles cases like 934.2 - 59.4 = 874.8000000000001),
  // then apply user-defined tolerance if set.
  if (!result) {
    const match = formula.match(/^(.+?)\s*==\s*(.+)$/);
    if (match) {
      try {
        const ctx = vm.createContext({ ...context, Math, Number });
        const leftVal = Number(vm.runInContext(match[1].trim(), ctx, { timeout: 100 }));
        const rightVal = Number(vm.runInContext(match[2].trim(), ctx, { timeout: 100 }));
        if (!isNaN(leftVal) && !isNaN(rightVal)) {
          const diff = Math.abs(leftVal - rightVal);
          // Built-in epsilon for floating-point rounding errors (e.g. 934.2 - 59.4 ≠ 874.8 in float64)
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

  return { passed: result };
}

/**
 * Run all comparison_rules for a variation against a matching set.
 * Upserts comparison_results as 'auto' (passed) or 'pending' (failed).
 * Skips rules already marked 'force' (user-approved).
 */
async function runAndRecordComparisons(matchingSetId, variation, setDocs, extractors) {
  if (!variation.comparison_rules || variation.comparison_rules.length === 0) return;
  for (const cr of variation.comparison_rules) {
    // Don't overwrite a force-reconciled result
    const existing = await reconciliationModel.upsertComparisonResult({
      matchingSetId,
      comparisonRuleId: cr.id,
      status: 'pending', // temporary; will be overwritten below
    });
    if (existing.status === 'force') continue;

    const { passed } = await runSingleComparison(cr, setDocs, extractors);
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
  await runAndRecordComparisons(setId, variation, setDocsWithMeta, allExtractors);

  const fullyReconciled = await reconciliationModel.isVariationFullyReconciled(setId, variation.id);
  if (fullyReconciled) {
    await reconciliationModel.updateMatchingSetStatus(setId, 'reconciled');
    const anchorHeld = await reconciliationModel.findHeldDocByDocExecId(setDocs.find(
      (d) => d.extractor_id === rule.anchor_extractor_id
    )?.document_execution_id);
    if (anchorHeld) await reconciliationModel.updateHeldDocStatus(anchorHeld.id, 'reconciled');
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

        const { fullyReconciled, setDocs: finalDocs } = await finaliseSet(setId, rule, variation, allExtractors);
        if (fullyReconciled && rule.auto_send_out) {
          for (const doc of finalDocs) {
            if (doc.document_execution_id === docExecutionId) continue;
            const hd = await reconciliationModel.findHeldDocByDocExecId(doc.document_execution_id);
            setDocExecIds.push({ docExecutionId: doc.document_execution_id, outputPort: hd?.slot_id || slotId });
          }
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

          const { fullyReconciled, setDocs: finalDocs } = await finaliseSet(set.id, rule, variation, allExtractors);
          if (fullyReconciled && rule.auto_send_out) {
            for (const doc of finalDocs) {
              if (doc.document_execution_id === docExecutionId) continue;
              const hd = await reconciliationModel.findHeldDocByDocExecId(doc.document_execution_id);
              setDocExecIds.push({ docExecutionId: doc.document_execution_id, outputPort: hd?.slot_id || slotId });
            }
            shouldContinue = true;
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

  return { type: 'hold' };
}

module.exports = { processDocument, runAndRecordComparisons, runSingleComparison };
