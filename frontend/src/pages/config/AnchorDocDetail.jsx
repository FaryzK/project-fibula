import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import reconciliationService from '../../services/reconciliationService';
import useExtractorStore from '../../stores/useExtractorStore';

/**
 * Parse a comparison formula and return { fieldRef → resolvedValue } for header-level formulas.
 * Uses known extractor names to identify field references in free-text formulas.
 * For table formulas (3-part refs like "Extractor.Table.Column"), returns null — too complex.
 */
function resolveFormulaValues(formula, extractorNames, extractorNameToDoc) {
  const values = {};
  for (const name of extractorNames) {
    // Match "ExtractorName.SomeField" — field is everything up to the next operator/paren/end
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\.([^+\\-*/=()<>!&|\\s][^+\\-*/=()<>!&|]*)`, 'g');
    let m;
    while ((m = regex.exec(formula)) !== null) {
      const fieldRef = `${name}.${m[1].trim()}`;
      const fieldName = m[1].trim();
      // If field itself contains a dot it's a table ref (Extractor.Table.Column) — skip
      if (fieldName.includes('.')) continue;
      const doc = extractorNameToDoc[name];
      if (!doc) { values[fieldRef] = '—'; continue; }
      const header = typeof doc.metadata === 'object'
        ? (doc.metadata.header ?? doc.metadata)
        : JSON.parse(doc.metadata || '{}').header || {};
      const val = header[fieldName];
      values[fieldRef] = val !== undefined && val !== null ? String(val) : '—';
    }
  }
  return Object.keys(values).length > 0 ? values : null;
}

const STATUS_STYLES = {
  held:       'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  open:       'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  reconciled: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  rejected:   'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  auto:       'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  force:      'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  pending:    'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
};

const STATUS_LABELS = {
  held:       'Held',
  open:       'Open',
  reconciled: 'Fully Reconciled',
  rejected:   'Rejected',
  auto:       'Auto',
  force:      'Force',
  pending:    'Pending',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function AnchorDocDetail() {
  const { ruleId, anchorDocExecId } = useParams();
  const navigate = useNavigate();
  const extractors = useExtractorStore((s) => s.extractors);
  const extractorMap = Object.fromEntries(extractors.map((e) => [e.id, e.name]));

  const [rule, setRule] = useState(null);
  const [anchorDocs, setAnchorDocs] = useState([]);
  const [anchorDoc, setAnchorDoc] = useState(null);
  const [variationIdx, setVariationIdx] = useState(0);
  const [setsByVariation, setSetsByVariation] = useState({}); // variationId → { set, docs, comparisons }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [{ rule: r }, anchors] = await Promise.all([
          reconciliationService.getOne(ruleId),
          reconciliationService.listAnchorDocs(ruleId),
        ]);
        setRule(r);
        setAnchorDocs(anchors);
        const found = anchors.find((a) => a.anchor_document_execution_id === anchorDocExecId);
        setAnchorDoc(found || null);

        // Load sets + comparisons per variation
        const byVar = {};
        for (const variation of r.variations || []) {
          const anchorSet = found?.sets?.find((s) => s.variation_id === variation.id);
          if (!anchorSet) {
            byVar[variation.id] = { set: null, docs: [], comparisons: [] };
            continue;
          }
          const [setDetail, comparisons] = await Promise.all([
            reconciliationService.getMatchingSet(ruleId, anchorSet.id),
            reconciliationService.listComparisonResults(ruleId, anchorSet.id),
          ]);
          byVar[variation.id] = { set: anchorSet, docs: setDetail?.docs || [], comparisons };
        }
        setSetsByVariation(byVar);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [ruleId, anchorDocExecId]);

  async function handleForceReconcile(setId, compId) {
    try {
      const updatedResults = await reconciliationService.forceReconcileComparison(ruleId, setId, compId);
      // Refresh comparisons for the affected variation
      const variation = rule.variations[variationIdx];
      setSetsByVariation((prev) => ({
        ...prev,
        [variation.id]: { ...prev[variation.id], comparisons: updatedResults },
      }));
      // Refresh anchor status
      const anchors = await reconciliationService.listAnchorDocs(ruleId);
      setAnchorDocs(anchors);
      const found = anchors.find((a) => a.anchor_document_execution_id === anchorDocExecId);
      setAnchorDoc(found || null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRejectDoc(heldDocId) {
    if (!window.confirm('Reject this document? It will be removed from all matching sets.')) return;
    try {
      await reconciliationService.rejectDoc(heldDocId);
      // Reload page data
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSendOut() {
    setSending(true);
    try {
      await reconciliationService.sendOutAnchor(ruleId, anchorDocExecId);
      navigate(`/app`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function anchorStatus() {
    if (!anchorDoc) return 'held';
    if (anchorDoc.sets?.some((s) => s.status === 'reconciled')) return 'reconciled';
    return 'open';
  }

  function isVariationReconciled(variationId) {
    const data = setsByVariation[variationId];
    if (!data || !data.comparisons || data.comparisons.length === 0) return false;
    return data.comparisons.every((c) => c.status === 'auto' || c.status === 'force');
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;
  if (!rule) return <div className="p-8 text-gray-400 text-sm">Rule not found.</div>;

  const variations = rule.variations || [];
  const currentVariation = variations[variationIdx];

  // Build extractor-name → doc map for the current variation's set
  const currentDocs = currentVariation ? (setsByVariation[currentVariation.id]?.docs || []) : [];
  const extractorNameToDoc = Object.fromEntries(
    currentDocs.map((doc) => [extractorMap[doc.extractor_id] || doc.extractor_id, doc])
  );
  const extractorNames = Object.keys(extractorNameToDoc);
  const currentData = currentVariation ? setsByVariation[currentVariation.id] : null;
  const overallStatus = anchorStatus();
  const isFullyReconciled = overallStatus === 'reconciled';
  const canSendOut = isFullyReconciled && !rule.auto_send_out;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{rule.name}</p>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {anchorDoc?.file_name || anchorDocExecId}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={overallStatus} />
          {canSendOut && (
            <button
              onClick={handleSendOut}
              disabled={sending}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {sending ? 'Sending…' : 'Send Out'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-4">{error}</p>
      )}

      {/* Variation tabs */}
      {variations.length > 0 && (
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-0">
          {variations.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setVariationIdx(i)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                variationIdx === i
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Variation {i + 1}
              {isVariationReconciled(v.id) && (
                <span className="ml-1.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1 rounded">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Per-variation content */}
      {currentData ? (
        <div className="space-y-6">
          {/* Fully reconciled banner */}
          {isVariationReconciled(currentVariation?.id) && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg px-4 py-3 text-sm text-green-700 dark:text-green-400">
              This variation is fully reconciled.
              {isFullyReconciled && rule.auto_send_out && (
                <span className="ml-1">Anchor will be sent out automatically.</span>
              )}
            </div>
          )}

          {/* Documents in set */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Documents in set</h2>
            {currentData.docs.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No documents in this matching set yet.</p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr className="text-xs text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-2 text-left font-medium">Document</th>
                      <th className="px-4 py-2 text-left font-medium">Extractor</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {currentData.docs.map((doc) => {
                      const isAnchor = doc.document_execution_id === anchorDocExecId;
                      return (
                        <tr key={doc.id} className="bg-white dark:bg-gray-800">
                          <td className="px-4 py-2.5 text-gray-900 dark:text-white">
                            {doc.file_name || doc.document_execution_id}
                            {isAnchor && (
                              <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">(anchor)</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                            {doc.extractor_id}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status="held" />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {!isAnchor && (
                              <button
                                onClick={() => {
                                  // Find held doc id — use document_execution_id to reject
                                  handleRejectDoc(doc.document_execution_id);
                                }}
                                className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition"
                              >
                                Reject
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Comparisons */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comparisons</h2>
            {(() => {
              // Use actual results if available; otherwise fall back to the variation's defined rules shown as "waiting"
              const definedRules = currentVariation?.comparison_rules || [];
              const hasResults = currentData.comparisons.length > 0;
              if (!hasResults && definedRules.length === 0) {
                return (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No comparison rules defined for this variation.</p>
                );
              }
              const rows = hasResults
                ? currentData.comparisons
                : definedRules.map((cr) => ({ ...cr, comparison_rule_id: cr.id, status: 'pending', _notEvaluated: true }));
              return (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {!hasResults && (
                    <p className="px-4 py-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
                      Waiting for all documents to arrive before comparisons are evaluated.
                    </p>
                  )}
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr className="text-xs text-gray-500 dark:text-gray-400">
                        <th className="px-4 py-2 text-left font-medium">Formula</th>
                        <th className="px-4 py-2 text-left font-medium">Level</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {rows.map((comp) => {
                        const resolvedValues = comp.level === 'header' && !comp._notEvaluated
                          ? resolveFormulaValues(comp.formula, extractorNames, extractorNameToDoc)
                          : null;
                        return (
                        <tr key={comp.id || comp.comparison_rule_id} className="bg-white dark:bg-gray-800">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200">
                            <div>{comp.formula}</div>
                            {comp.tolerance_value != null && (
                              <span className="text-gray-400 dark:text-gray-500">
                                (±{comp.tolerance_value}{comp.tolerance_type === 'percentage' ? '%' : ''})
                              </span>
                            )}
                            {resolvedValues && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-sans">
                                {Object.entries(resolvedValues).map(([ref, val]) => (
                                  <span key={ref} className="text-gray-400 dark:text-gray-500">
                                    <span className="text-gray-500 dark:text-gray-400">{ref}:</span>{' '}
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">{val}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            {comp.level === 'table' && (
                              <div className="mt-0.5 text-gray-400 dark:text-gray-500 font-sans">
                                Row-level — evaluated per matched item pair
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 capitalize text-xs">
                            {comp.level}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={comp.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {comp.status === 'pending' && !comp._notEvaluated && currentData.set && (
                              <button
                                onClick={() => handleForceReconcile(currentData.set.id, comp.comparison_rule_id)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline transition"
                              >
                                Force reconcile
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          No matching set found for this variation yet.
        </p>
      )}
    </div>
  );
}
