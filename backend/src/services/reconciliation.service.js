const reconciliationModel = require('../models/reconciliation.model');
const documentExecutionModel = require('../models/documentExecution.model');
const vm = require('vm');

/**
 * Simple string similarity for fuzzy matching (same as dataMapper.service).
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
 * Check if two metadata objects match according to doc_matching_links for a given target extractor.
 */
function docMatchesAnchor(anchorMeta, targetMeta, docLinks, targetExtractorId) {
  const relevantLinks = docLinks.filter((l) => l.target_extractor_id === targetExtractorId);
  if (relevantLinks.length === 0) return true; // no links = match by default

  for (const link of relevantLinks) {
    const anchorVal = getField(anchorMeta, link.anchor_field);
    const targetVal = getField(targetMeta, link.target_field);
    if (anchorVal === undefined || targetVal === undefined) continue;

    if (link.match_type === 'exact') {
      if (String(anchorVal) !== String(targetVal)) return false;
    } else {
      const threshold = link.match_threshold != null ? link.match_threshold : 0.8;
      if (stringSimilarity(anchorVal, targetVal) < threshold) return false;
    }
  }
  return true;
}

/**
 * Evaluate a comparison formula using a context of doc metadata keyed by extractor name.
 * formula example: "Invoice.grand_total == PO.grand_total"
 * context: { PO: { grand_total: 100, ... }, Invoice: { grand_total: 100, ... } }
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
 * Run comparison rules against the set of docs.
 * Returns { passed: boolean }
 */
async function runComparison(rule, variation, setDocs, extractors) {
  if (!variation.comparison_rules || variation.comparison_rules.length === 0) return { passed: true };

  // Build context: extractor_name → metadata header
  const context = {};
  for (const doc of setDocs) {
    const docExec = await documentExecutionModel.findById(doc.document_execution_id);
    const meta = JSON.parse(docExec?.metadata || '{}');
    const extractor = extractors.find((e) => e.id === doc.extractor_id);
    if (extractor) context[extractor.name] = meta.header || meta;
  }

  for (const cr of variation.comparison_rules) {
    if (cr.level !== 'header') continue; // skip table-level for MVP

    let result = evalFormula(cr.formula, context);

    // Apply tolerance if formula failed with a near-match
    if (!result && cr.tolerance_value != null) {
      // Try to extract the two sides of a = comparison with tolerance
      const match = cr.formula.match(/^(.+?)\s*==?\s*(.+)$/);
      if (match) {
        try {
          const ctx = vm.createContext({ ...context, Math, Number });
          const leftVal = Number(vm.runInContext(match[1].trim(), ctx, { timeout: 100 }));
          const rightVal = Number(vm.runInContext(match[2].trim(), ctx, { timeout: 100 }));
          const diff = Math.abs(leftVal - rightVal);
          if (cr.tolerance_type === 'absolute') {
            result = diff <= cr.tolerance_value;
          } else if (cr.tolerance_type === 'percentage' && rightVal !== 0) {
            result = (diff / Math.abs(rightVal)) * 100 <= cr.tolerance_value;
          }
        } catch (_) {
          // leave result as false
        }
      }
    }

    if (!result) return { passed: false };
  }

  return { passed: true };
}

/**
 * Process a document arriving at a RECONCILIATION node.
 * Returns { type: 'hold' } or { type: 'continue', outputMetadata, outputPort, setDocExecIds }
 */
async function processDocument({ ruleId, docExecutionId, metadata, workflowId, nodeId }) {
  const rule = await reconciliationModel.findById(ruleId);
  if (!rule) throw new Error(`Reconciliation rule ${ruleId} not found`);

  const extractorId = metadata._extractor_id;
  const isAnchor = extractorId === rule.anchor_extractor_id;
  const isTarget = rule.target_extractors.some((t) => t.extractor_id === extractorId);

  if (!isAnchor && !isTarget) {
    // Unknown extractor — pass through
    return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default', setDocExecIds: [] };
  }

  if (isAnchor) {
    // Create a new matching set for this anchor document
    const matchingSet = await reconciliationModel.createMatchingSet({ ruleId, anchorDocExecId: docExecutionId });
    await reconciliationModel.addDocToSet({
      matchingSetId: matchingSet.id,
      documentExecutionId: docExecutionId,
      extractorId,
    });
    // Hold anchor until targets arrive
    return { type: 'hold' };
  }

  // Target document: find a pending matching set where anchor matches this doc
  const pendingSets = await reconciliationModel.findPendingMatchingSets(ruleId);

  let foundSet = null;
  for (const variation of rule.variations) {
    for (const set of pendingSets) {
      const matches = docMatchesAnchor(
        set.anchorMetadata,
        metadata,
        variation.doc_matching_links,
        extractorId
      );
      if (matches) {
        foundSet = set;
        break;
      }
    }
    if (foundSet) break;
  }

  if (!foundSet) {
    // No matching anchor found yet — hold until anchor arrives
    return { type: 'hold' };
  }

  // Add this doc to the found set
  await reconciliationModel.addDocToSet({
    matchingSetId: foundSet.id,
    documentExecutionId: docExecutionId,
    extractorId,
  });

  // Check if all expected doc types are present
  const setDocs = await reconciliationModel.findSetDocs(foundSet.id);
  const presentExtractorIds = new Set(setDocs.map((d) => d.extractor_id));
  const expectedExtractorIds = [
    rule.anchor_extractor_id,
    ...rule.target_extractors.map((t) => t.extractor_id),
  ];
  const allPresent = expectedExtractorIds.every((id) => presentExtractorIds.has(id));

  if (!allPresent) {
    return { type: 'hold' };
  }

  // All docs present — run comparison using first variation that passes
  // Build extractor lookup: id → { name }
  const allExtractors = [
    { id: rule.anchor_extractor_id, name: 'Anchor' },
    ...rule.target_extractors.map((t) => ({ id: t.extractor_id, name: t.extractor_id })),
  ];

  let passed = false;
  for (const variation of rule.variations) {
    const compResult = await runComparison(rule, variation, setDocs, allExtractors);
    if (compResult.passed) {
      passed = true;
      break;
    }
  }

  if (!passed) {
    // Hold for human review
    return { type: 'hold' };
  }

  // Reconciled — update set status and advance all docs
  await reconciliationModel.updateMatchingSetStatus(foundSet.id, 'reconciled');

  const otherDocExecIds = setDocs
    .filter((d) => d.document_execution_id !== docExecutionId)
    .map((d) => d.document_execution_id);

  return {
    type: 'continue',
    outputMetadata: { ...metadata, _reconciled: true },
    outputPort: 'default',
    setDocExecIds: otherDocExecIds,
  };
}

module.exports = { processDocument };
