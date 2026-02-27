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

/**
 * Parse table references from a formula: "ExtractorName.TableName.ColumnName"
 * Returns [{ extractorName, tableName, colName, ref }]
 */
function parseTableRefs(formula, extractorNames) {
  const refs = [];
  for (const name of extractorNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Capture everything after "ExtractorName." up to an operator or end-of-string.
    // Table and column names can contain spaces, so \w+ is too narrow — use [^+\-*/=()<>!]+
    // Then split at the last dot: left = tableName, right = columnName.
    const regex = new RegExp(`${escaped}\\.([^+\\-*/=()<>!]+?)(?=[+\\-*/=()<>!]|$)`, 'g');
    let m;
    while ((m = regex.exec(formula)) !== null) {
      const fullRef = m[1].trim();
      const lastDot = fullRef.lastIndexOf('.');
      if (lastDot === -1) continue; // header ref (no second dot) — skip
      const tableName = fullRef.slice(0, lastDot).trim();
      const colName = fullRef.slice(lastDot + 1).trim();
      if (!tableName || !colName) continue;
      refs.push({ extractorName: name, tableName, colName, ref: `${name}.${tableName}.${colName}` });
    }
  }
  return refs;
}

// Returns the array of row objects for a given table name from metadata.
// metadata.tables is { tableName: [{ col: val, ... }, ...] }
function getTableData(metadata, tableName) {
  const meta = typeof metadata === 'object' ? metadata : JSON.parse(metadata || '{}');
  const tables = meta.tables || {};
  if (Array.isArray(tables)) return null; // unexpected format
  const rows = tables[tableName];
  return Array.isArray(rows) ? rows : null;
}

// row is a plain object { colName: value }
function getRowValue(row, colName) {
  if (!row) return '—';
  const val = row[colName];
  return val !== undefined && val !== null ? String(val) : '—';
}

/**
 * Build matched row data for a table-level comparison — supports 2+ extractors.
 * Returns { colKeys, colHeaders, rows } or null if data unavailable.
 *
 * Row joining strategy: g0 is the anchor. For each other group, look for a
 * table_matching_key from g0 to that group; if none, zip by row index.
 */
function buildMatchedRows(formula, extractorNames, extractorNameToDoc, tableMatchingKeys, extractorMap) {
  const refs = parseTableRefs(formula, extractorNames);
  if (refs.length === 0) return null;

  // Group refs by extractor+table
  const tableGroupMap = {};
  for (const r of refs) {
    const key = `${r.extractorName}.${r.tableName}`;
    if (!tableGroupMap[key]) tableGroupMap[key] = { extractorName: r.extractorName, tableName: r.tableName, cols: [] };
    if (!tableGroupMap[key].cols.includes(r.colName)) tableGroupMap[key].cols.push(r.colName);
  }
  const groups = Object.values(tableGroupMap);

  // Build name → id map from extractorMap (id→name)
  const nameToId = Object.fromEntries(Object.entries(extractorMap).map(([id, name]) => [name, id]));

  // Load rows for ALL groups; null means the table isn't available yet
  const groupRows = groups.map((g) => {
    const doc = extractorNameToDoc[g.extractorName];
    return doc ? getTableData(doc.metadata, g.tableName) : null;
  });
  if (groupRows.some((r) => !r)) return null;

  const g0 = groups[0];
  const g0Id = nameToId[g0.extractorName];
  const anchorRows = groupRows[0];

  // Try to find a match key between g0 and g1 to show as a "key" column
  let keyColLabel = null;
  let keyColG0 = null;
  if (groups.length >= 2) {
    const g1Id = nameToId[groups[1].extractorName];
    const mk = (tableMatchingKeys || []).find((tk) =>
      (tk.left_extractor_id === g0Id && tk.left_table_type === g0.tableName && tk.right_extractor_id === g1Id && tk.right_table_type === groups[1].tableName) ||
      (tk.left_extractor_id === g1Id && tk.left_table_type === groups[1].tableName && tk.right_extractor_id === g0Id && tk.right_table_type === g0.tableName)
    );
    if (mk) {
      keyColG0 = mk.left_extractor_id === g0Id ? mk.left_column : mk.right_column;
      keyColLabel = `${keyColG0} (key)`;
    }
  }

  // Build column keys/headers from ALL groups
  const colKeys = keyColLabel ? [keyColG0] : ['_row'];
  const colHeaders = keyColLabel ? [keyColLabel] : ['Row'];
  for (const g of groups) {
    for (const col of g.cols) {
      colKeys.push(`${g.extractorName}.${g.tableName}.${col}`);
      colHeaders.push(`${g.extractorName}.${col}`);
    }
  }

  const maxLen = Math.max(...groupRows.map((r) => r.length));
  const matchedRows = [];

  for (let i = 0; i < maxLen; i++) {
    const anchorRow = anchorRows[i] || null;
    const entry = keyColG0 && anchorRow
      ? { [keyColG0]: getRowValue(anchorRow, keyColG0) }
      : { _row: String(i + 1) };

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const gId = nameToId[g.extractorName];
      const gRows = groupRows[gi];
      let rowForGroup;

      if (gi === 0) {
        rowForGroup = anchorRow;
      } else {
        // Find a matching key from g0 to this group
        const linkKey = (tableMatchingKeys || []).find((tk) =>
          (tk.left_extractor_id === g0Id && tk.left_table_type === g0.tableName && tk.right_extractor_id === gId && tk.right_table_type === g.tableName) ||
          (tk.left_extractor_id === gId && tk.left_table_type === g.tableName && tk.right_extractor_id === g0Id && tk.right_table_type === g0.tableName)
        );
        if (linkKey && anchorRow) {
          const g0Col = linkKey.left_extractor_id === g0Id ? linkKey.left_column : linkKey.right_column;
          const gCol = linkKey.left_extractor_id === g0Id ? linkKey.right_column : linkKey.left_column;
          const keyVal = getRowValue(anchorRow, g0Col);
          rowForGroup = gRows.find((r) => getRowValue(r, gCol) === keyVal) || null;
        } else {
          rowForGroup = gRows[i] || null; // zip by index as fallback
        }
      }

      for (const col of g.cols) {
        entry[`${g.extractorName}.${g.tableName}.${col}`] = rowForGroup ? getRowValue(rowForGroup, col) : '—';
      }
    }

    matchedRows.push(entry);
  }

  return { colKeys, colHeaders, rows: matchedRows };
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
  const loadExtractors = useExtractorStore((s) => s.loadExtractors);
  const extractorMap = Object.fromEntries(extractors.map((e) => [e.id, e.name]));

  const [rule, setRule] = useState(null);
  const [anchorDocs, setAnchorDocs] = useState([]);
  const [anchorDoc, setAnchorDoc] = useState(null);
  const [variationIdx, setVariationIdx] = useState(0);
  const [setsByVariation, setSetsByVariation] = useState({}); // variationId → { set, docs, comparisons }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // Ensure extractors are loaded so we can resolve IDs → names
  useEffect(() => {
    if (extractors.length === 0) loadExtractors();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleRerunComparisons(setId, variationId) {
    try {
      const updatedResults = await reconciliationService.rerunComparisons(ruleId, setId);
      setSetsByVariation((prev) => ({
        ...prev,
        [variationId]: { ...prev[variationId], comparisons: updatedResults },
      }));
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
                            {extractorMap[doc.extractor_id] || doc.extractor_id}
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

          {/* Comparisons — one card per comparison rule */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Comparisons</h2>
              {currentData.set && currentData.comparisons.some((c) => c.status === 'pending') && (
                <button
                  onClick={() => handleRerunComparisons(currentData.set.id, currentVariation.id)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline transition"
                >
                  Re-evaluate
                </button>
              )}
            </div>
            {(() => {
              const definedRules = currentVariation?.comparison_rules || [];
              const hasResults = currentData.comparisons.length > 0;
              if (!hasResults && definedRules.length === 0) {
                return <p className="text-xs text-gray-400 dark:text-gray-500">No comparison rules defined for this variation.</p>;
              }
              const compRows = hasResults
                ? currentData.comparisons
                : definedRules.map((cr) => ({ ...cr, comparison_rule_id: cr.id, status: 'pending', _notEvaluated: true }));
              return (
                <div className="space-y-4">
                  {!hasResults && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2">
                      Waiting for all documents to arrive before comparisons are evaluated.
                    </p>
                  )}
                  {compRows.map((comp) => {
                    const resolvedValues = comp.level === 'header' && !comp._notEvaluated
                      ? resolveFormulaValues(comp.formula, extractorNames, extractorNameToDoc)
                      : null;
                    const matchedRowData = comp.level === 'table' && !comp._notEvaluated
                      ? buildMatchedRows(comp.formula, extractorNames, extractorNameToDoc, currentVariation?.table_matching_keys, extractorMap)
                      : null;
                    return (
                      <div key={comp.id || comp.comparison_rule_id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        {/* Card header — formula + badges + action */}
                        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                          <div className="flex-1 min-w-0">
                            <code className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">{comp.formula}</code>
                            {comp.tolerance_value != null && (
                              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                                (±{comp.tolerance_value}{comp.tolerance_type === 'percentage' ? '%' : ''})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{comp.level}</span>
                            <StatusBadge status={comp.status} />
                            {comp.status === 'pending' && !comp._notEvaluated && currentData.set && (
                              <button
                                onClick={() => handleForceReconcile(currentData.set.id, comp.comparison_rule_id)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline transition"
                              >
                                Force reconcile
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Header-level: field → value table */}
                        {comp.level === 'header' && resolvedValues && (
                          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 dark:text-gray-500">
                                  <th className="text-left font-medium pb-1.5 pr-6 w-1/2">Field</th>
                                  <th className="text-left font-medium pb-1.5">Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {Object.entries(resolvedValues).map(([ref, val]) => (
                                  <tr key={ref}>
                                    <td className="py-1.5 pr-6 text-gray-500 dark:text-gray-400 font-mono">{ref}</td>
                                    <td className="py-1.5 text-gray-800 dark:text-gray-200 font-medium">{val}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {comp.level === 'header' && !resolvedValues && !comp._notEvaluated && (
                          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                            No field values could be resolved from document metadata.
                          </div>
                        )}

                        {/* Table-level: matched row table */}
                        {comp.level === 'table' && matchedRowData && matchedRowData.rows.length > 0 && (
                          <div className="border-t border-gray-100 dark:border-gray-700 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-700/30">
                                <tr>
                                  {matchedRowData.colHeaders.map((h, i) => (
                                    <th key={i} className="px-4 py-2 text-left font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {matchedRowData.rows.map((row, ri) => (
                                  <tr key={ri} className="bg-white dark:bg-gray-800">
                                    {matchedRowData.colKeys.map((k, ki) => (
                                      <td key={ki} className="px-4 py-2 text-gray-700 dark:text-gray-300">{row[k] ?? '—'}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {comp.level === 'table' && !matchedRowData && !comp._notEvaluated && (
                          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                            No row data available — ensure all documents are present in the set.
                          </div>
                        )}
                        {comp._notEvaluated && (
                          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                            Not yet evaluated — waiting for all documents to arrive.
                          </div>
                        )}
                      </div>
                    );
                  })}
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
