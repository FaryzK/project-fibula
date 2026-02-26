import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import reconciliationService from '../../services/reconciliationService';
import extractorService from '../../services/extractorService';

const MATCH_TYPES = ['exact', 'fuzzy'];
const COMPARISON_LEVELS = ['header', 'table'];
const TOLERANCE_TYPES = ['absolute', 'percentage'];
const FORMULA_OPERATORS = ['+', '-', '*', '/', '=', '(', ')'];

const selectCls = 'border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-full';

function parseSchema(extractor) {
  return {
    headerFields: (extractor.header_fields || []).map((f) => f.field_name),
    tableTypes: (extractor.table_types || []).map((tt) => ({
      type_name: tt.type_name,
      columns: (tt.columns || []).map((c) => c.column_name),
    })),
  };
}

function ReconciliationRuleEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [autoSendOut, setAutoSendOut] = useState(false);
  const [anchorExtractorId, setAnchorExtractorId] = useState('');
  const [targetExtractors, setTargetExtractors] = useState([]);
  const [variations, setVariations] = useState([]);
  const [extractors, setExtractors] = useState([]);
  const [usage, setUsage] = useState([]);
  const [matchingSets, setMatchingSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [anchorSchema, setAnchorSchema] = useState(null);
  const [targetSchemas, setTargetSchemas] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const exts = await extractorService.list();
        setExtractors(exts);
        if (!isNew) {
          const { rule, usage: u } = await reconciliationService.getOne(id);
          setName(rule.name);
          setAutoSendOut(rule.auto_send_out || false);
          setAnchorExtractorId(rule.anchor_extractor_id || '');
          setTargetExtractors(rule.target_extractors || []);
          setVariations(rule.variations || []);
          setUsage(u);
          const sets = await reconciliationService.listMatchingSets(id);
          setMatchingSets(sets);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  // Fetch anchor schema when anchor extractor changes
  useEffect(() => {
    if (!anchorExtractorId) { setAnchorSchema(null); return; }
    extractorService.getOne(anchorExtractorId)
      .then(({ extractor }) => setAnchorSchema(parseSchema(extractor)))
      .catch(() => setAnchorSchema(null));
  }, [anchorExtractorId]);

  // Fetch target schemas when target extractors change
  useEffect(() => {
    const ids = targetExtractors.map((te) => te.extractor_id).filter(Boolean);
    if (ids.length === 0) { setTargetSchemas({}); return; }
    Promise.all(ids.map((eid) =>
      extractorService.getOne(eid).then(({ extractor }) => [eid, parseSchema(extractor)])
    )).then((entries) => setTargetSchemas(Object.fromEntries(entries)))
      .catch(() => {});
  }, [targetExtractors]);

  const getExtractorName = (extId) => extractors.find((e) => e.id === extId)?.name || '';

  // ── Variation mutation helpers ──────────────────────────────────────────────

  function addVariation() {
    setVariations((prev) => [
      ...prev,
      { doc_matching_links: [], table_matching_keys: [], comparison_rules: [] },
    ]);
  }

  // All extractors available for picking (anchor + all targets)
  function getAllExtractors() {
    const all = [];
    if (anchorExtractorId) all.push({ id: anchorExtractorId, name: getExtractorName(anchorExtractorId) });
    targetExtractors.forEach((te) => {
      if (te.extractor_id) all.push({ id: te.extractor_id, name: getExtractorName(te.extractor_id) });
    });
    return all;
  }

  function getSchemaForExtractor(extId) {
    if (extId === anchorExtractorId) return anchorSchema;
    return targetSchemas[extId] || null;
  }

  // Doc matching links
  function addDocLink(varIdx) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        doc_matching_links: [...v.doc_matching_links, { left_extractor_id: '', left_field: '', right_extractor_id: '', right_field: '', match_type: 'exact', match_threshold: 0.8 }],
      }
    ));
  }

  function updateDocLink(varIdx, linkIdx, patch) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        doc_matching_links: v.doc_matching_links.map((l, li) => li !== linkIdx ? l : { ...l, ...patch }),
      }
    ));
  }

  function removeDocLink(varIdx, linkIdx) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : { ...v, doc_matching_links: v.doc_matching_links.filter((_, li) => li !== linkIdx) }
    ));
  }

  // Table matching keys
  function addTableMatchingKey(varIdx) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        table_matching_keys: [
          ...(v.table_matching_keys || []),
          { left_extractor_id: '', left_table_type: '', left_column: '', right_extractor_id: '', right_table_type: '', right_column: '' },
        ],
      }
    ));
  }

  function updateTableKey(varIdx, keyIdx, patch) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        table_matching_keys: (v.table_matching_keys || []).map((k, ki) => ki !== keyIdx ? k : { ...k, ...patch }),
      }
    ));
  }

  function removeTableKey(varIdx, keyIdx) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : { ...v, table_matching_keys: (v.table_matching_keys || []).filter((_, ki) => ki !== keyIdx) }
    ));
  }

  // Comparison rules
  function addComparisonRule(varIdx) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        comparison_rules: [...v.comparison_rules, { level: 'header', formula: '', tolerance_type: 'absolute', tolerance_value: 0 }],
      }
    ));
  }

  function updateComparison(varIdx, compIdx, patch) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        comparison_rules: v.comparison_rules.map((c, ci) => ci !== compIdx ? c : { ...c, ...patch }),
      }
    ));
  }

  function removeComparison(varIdx, compIdx) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : { ...v, comparison_rules: v.comparison_rules.filter((_, ci) => ci !== compIdx) }
    ));
  }

  function appendToFormula(varIdx, compIdx, token) {
    setVariations((prev) => prev.map((v, vi) =>
      vi !== varIdx ? v : {
        ...v,
        comparison_rules: v.comparison_rules.map((c, ci) => {
          if (ci !== compIdx) return c;
          const formula = c.formula || '';
          const sep = formula && !formula.endsWith(' ') ? ' ' : '';
          return { ...c, formula: formula + sep + token };
        }),
      }
    ));
  }

  // Build field chips for formula builder
  function getFormulaChips(level) {
    const chips = [];
    const anchorName = getExtractorName(anchorExtractorId);
    if (anchorSchema) {
      if (level === 'header') {
        anchorSchema.headerFields.forEach((f) => chips.push({ label: `${anchorName}.${f}`, type: 'anchor' }));
      } else {
        anchorSchema.tableTypes.forEach((tt) =>
          tt.columns.forEach((col) => chips.push({ label: `${anchorName}.${tt.type_name}.${col}`, type: 'anchor' }))
        );
      }
    }
    targetExtractors.forEach((te) => {
      const name = getExtractorName(te.extractor_id);
      const schema = targetSchemas[te.extractor_id];
      if (!schema) return;
      if (level === 'header') {
        schema.headerFields.forEach((f) => chips.push({ label: `${name}.${f}`, type: 'target' }));
      } else {
        schema.tableTypes.forEach((tt) =>
          tt.columns.forEach((col) => chips.push({ label: `${name}.${tt.type_name}.${col}`, type: 'target' }))
        );
      }
    });
    return chips;
  }

  // ── Save / Delete ───────────────────────────────────────────────────────────

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim() || !anchorExtractorId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name, auto_send_out: autoSendOut, anchor_extractor_id: anchorExtractorId, target_extractors: targetExtractors, variations };
      if (isNew) {
        await reconciliationService.create(payload);
        navigate('/app?tab=reconciliation');
      } else {
        await reconciliationService.update(id, payload);
        navigate('/app?tab=reconciliation');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this reconciliation rule?')) return;
    try {
      await reconciliationService.remove(id);
      navigate('/app?tab=reconciliation');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/app?tab=reconciliation')} className="text-sm text-indigo-600 hover:underline mb-6 block">
          ← Back to Reconciliation
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Reconciliation Rule' : 'Edit Reconciliation Rule'}
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rule name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. PO vs Invoice"
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto send out when fully reconciled</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">If enabled, the anchor document is sent out automatically once any variation is fully reconciled.</p>
              </div>
              <button
                type="button"
                onClick={() => setAutoSendOut((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSendOut ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSendOut ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anchor extractor</label>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">The primary document — the source of truth that other documents are reconciled against</p>
              <select
                value={anchorExtractorId}
                onChange={(e) => setAnchorExtractorId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select extractor…</option>
                {extractors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target extractors</label>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Other document types that must be gathered alongside the anchor to form a complete matching set</p>
              <div className="space-y-2">
                {targetExtractors.map((te, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={te.extractor_id}
                      onChange={(e) => setTargetExtractors((prev) => prev.map((x, j) => j === i ? { ...x, extractor_id: e.target.value } : x))}
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select extractor…</option>
                      {extractors.filter((e) => e.id !== anchorExtractorId).map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setTargetExtractors((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setTargetExtractors((prev) => [...prev, { extractor_id: '' }])} className="text-xs text-indigo-600 hover:underline">
                  + Add target extractor
                </button>
              </div>
            </div>
          </div>

          {/* Variations */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Variations</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">All variations run in parallel. The anchor is fully reconciled when any one variation has all comparisons resolved.</p>
              </div>
              <button type="button" onClick={addVariation} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add variation</button>
            </div>

            <div className="space-y-4">
              {variations.map((v, vi) => (
                <div key={vi} className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Variation {vi + 1}</span>
                    <button type="button" onClick={() => setVariations((prev) => prev.filter((_, i) => i !== vi))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>

                  {/* ── Step A: Document Matching ── */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">A — Document Matching</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">Pair header fields between any two document types to identify which belong together</span>
                      </div>
                      <button type="button" onClick={() => addDocLink(vi)} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add link</button>
                    </div>
                    {(v.doc_matching_links || []).length > 0 && (
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-1">
                        {['Left extractor', 'Left field', 'Right extractor', 'Right field', 'Match type', ''].map((h) => (
                          <span key={h} className="text-xs font-medium text-gray-400 dark:text-gray-500">{h}</span>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {(v.doc_matching_links || []).map((lk, li) => {
                        const allExts = getAllExtractors();
                        const leftSchema = getSchemaForExtractor(lk.left_extractor_id);
                        const rightSchema = getSchemaForExtractor(lk.right_extractor_id);
                        return (
                          <div key={li} className="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3 space-y-2">
                            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                              {/* Left extractor */}
                              <select
                                value={lk.left_extractor_id}
                                onChange={(e) => updateDocLink(vi, li, { left_extractor_id: e.target.value, left_field: '' })}
                                className={selectCls}
                              >
                                <option value="">Left…</option>
                                {allExts.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                              </select>
                              {/* Left field */}
                              <select
                                value={lk.left_field}
                                onChange={(e) => updateDocLink(vi, li, { left_field: e.target.value })}
                                className={selectCls}
                                disabled={!leftSchema}
                              >
                                <option value="">Field…</option>
                                {(leftSchema?.headerFields || []).map((f) => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                              {/* Right extractor */}
                              <select
                                value={lk.right_extractor_id}
                                onChange={(e) => updateDocLink(vi, li, { right_extractor_id: e.target.value, right_field: '' })}
                                className={selectCls}
                              >
                                <option value="">Right…</option>
                                {allExts.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                              </select>
                              {/* Right field */}
                              <select
                                value={lk.right_field}
                                onChange={(e) => updateDocLink(vi, li, { right_field: e.target.value })}
                                className={selectCls}
                                disabled={!rightSchema}
                              >
                                <option value="">Field…</option>
                                {(rightSchema?.headerFields || []).map((f) => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                              {/* Match type */}
                              <select
                                value={lk.match_type}
                                onChange={(e) => updateDocLink(vi, li, { match_type: e.target.value })}
                                className={selectCls}
                              >
                                {MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <button type="button" onClick={() => removeDocLink(vi, li)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
                            </div>
                            {/* Fuzzy threshold sub-row */}
                            {lk.match_type === 'fuzzy' && (
                              <div className="flex items-center gap-2 px-1 pt-1">
                                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-24">Fuzzy threshold</span>
                                <input
                                  type="range" min="0" max="1" step="0.05"
                                  value={lk.match_threshold ?? 0.8}
                                  onChange={(e) => updateDocLink(vi, li, { match_threshold: parseFloat(e.target.value) })}
                                  className="flex-1 accent-indigo-600 h-1.5"
                                />
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 w-10 text-right shrink-0">
                                  {Math.round((lk.match_threshold ?? 0.8) * 100)}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(v.doc_matching_links || []).length === 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">No document links yet. e.g. link PO.poNumber ↔ Invoice.orderRef, then Invoice.invoiceNum ↔ CreditNote.refInvoice</p>
                      )}
                    </div>
                  </div>

                  {/* ── Step B: Table Matching Keys ── */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">B — Table Matching</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">Link row identifiers to align line items across documents before comparing</span>
                      </div>
                      <button type="button" onClick={() => addTableMatchingKey(vi)} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add key</button>
                    </div>
                    {(v.table_matching_keys || []).length > 0 && (
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-1">
                        {['Left extractor', 'Left table', 'Left column', 'Right extractor', 'Right table', 'Right column', ''].map((h) => (
                          <span key={h} className="text-xs font-medium text-gray-400 dark:text-gray-500">{h}</span>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {(v.table_matching_keys || []).map((tk, ki) => {
                        const allExts = getAllExtractors();
                        const leftSchema = getSchemaForExtractor(tk.left_extractor_id);
                        const leftTableCols = (leftSchema?.tableTypes.find((tt) => tt.type_name === tk.left_table_type)?.columns || []);
                        const rightSchema = getSchemaForExtractor(tk.right_extractor_id);
                        const rightTableCols = (rightSchema?.tableTypes.find((tt) => tt.type_name === tk.right_table_type)?.columns || []);
                        return (
                          <div key={ki} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3">
                            {/* Left extractor */}
                            <select
                              value={tk.left_extractor_id}
                              onChange={(e) => updateTableKey(vi, ki, { left_extractor_id: e.target.value, left_table_type: '', left_column: '' })}
                              className={selectCls}
                            >
                              <option value="">Left…</option>
                              {allExts.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                            </select>
                            {/* Left table type */}
                            <select
                              value={tk.left_table_type}
                              onChange={(e) => updateTableKey(vi, ki, { left_table_type: e.target.value, left_column: '' })}
                              className={selectCls}
                              disabled={!leftSchema || (leftSchema.tableTypes || []).length === 0}
                            >
                              <option value="">Table…</option>
                              {(leftSchema?.tableTypes || []).map((tt) => (
                                <option key={tt.type_name} value={tt.type_name}>{tt.type_name}</option>
                              ))}
                            </select>
                            {/* Left column */}
                            <select
                              value={tk.left_column}
                              onChange={(e) => updateTableKey(vi, ki, { left_column: e.target.value })}
                              className={selectCls}
                              disabled={leftTableCols.length === 0}
                            >
                              <option value="">Column…</option>
                              {leftTableCols.map((col) => <option key={col} value={col}>{col}</option>)}
                            </select>
                            {/* Right extractor */}
                            <select
                              value={tk.right_extractor_id}
                              onChange={(e) => updateTableKey(vi, ki, { right_extractor_id: e.target.value, right_table_type: '', right_column: '' })}
                              className={selectCls}
                            >
                              <option value="">Right…</option>
                              {allExts.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                            </select>
                            {/* Right table type */}
                            <select
                              value={tk.right_table_type}
                              onChange={(e) => updateTableKey(vi, ki, { right_table_type: e.target.value, right_column: '' })}
                              className={selectCls}
                              disabled={!rightSchema || (rightSchema.tableTypes || []).length === 0}
                            >
                              <option value="">Table…</option>
                              {(rightSchema?.tableTypes || []).map((tt) => (
                                <option key={tt.type_name} value={tt.type_name}>{tt.type_name}</option>
                              ))}
                            </select>
                            {/* Right column */}
                            <select
                              value={tk.right_column}
                              onChange={(e) => updateTableKey(vi, ki, { right_column: e.target.value })}
                              className={selectCls}
                              disabled={rightTableCols.length === 0}
                            >
                              <option value="">Column…</option>
                              {rightTableCols.map((col) => <option key={col} value={col}>{col}</option>)}
                            </select>
                            <button type="button" onClick={() => removeTableKey(vi, ki)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
                          </div>
                        );
                      })}
                      {(v.table_matching_keys || []).length === 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">No table keys yet. Add keys if this rule compares line items.</p>
                      )}
                    </div>
                  </div>

                  {/* ── Step C: Comparison Rules ── */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">C — Comparison Logic</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">Formulas that must hold true for the matching set to reconcile</span>
                      </div>
                      <button type="button" onClick={() => addComparisonRule(vi)} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add rule</button>
                    </div>
                    <div className="space-y-2">
                      {(v.comparison_rules || []).map((cr, ci) => {
                        const chips = getFormulaChips(cr.level);
                        return (
                          <div key={ci} className="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3 space-y-2">
                            {/* Control row: level | tolerance type | tolerance value | × */}
                            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                              <select
                                value={cr.level}
                                onChange={(e) => updateComparison(vi, ci, { level: e.target.value })}
                                className={selectCls}
                              >
                                {COMPARISON_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                              </select>
                              <select
                                value={cr.tolerance_type || 'absolute'}
                                onChange={(e) => updateComparison(vi, ci, { tolerance_type: e.target.value })}
                                className={selectCls}
                              >
                                <option value="absolute">Tolerance: absolute</option>
                                <option value="percentage">Tolerance: %</option>
                              </select>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cr.tolerance_value ?? 0}
                                onChange={(e) => updateComparison(vi, ci, { tolerance_value: parseFloat(e.target.value) || 0 })}
                                className={selectCls}
                                placeholder="0"
                              />
                              <button type="button" onClick={() => removeComparison(vi, ci)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
                            </div>
                            {/* Formula textarea */}
                            <textarea
                              value={cr.formula}
                              onChange={(e) => updateComparison(vi, ci, { formula: e.target.value })}
                              placeholder={
                                cr.level === 'header'
                                  ? 'e.g. Invoice.grandTotal = PO.grandTotal'
                                  : 'e.g. Invoice.LineItems.unitPrice = PO.LineItems.unitPrice'
                              }
                              rows={2}
                              className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            {/* Operator buttons */}
                            <div className="flex flex-wrap gap-1 items-center">
                              <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0">Operators</span>
                              {FORMULA_OPERATORS.map((op) => (
                                <button
                                  key={op}
                                  type="button"
                                  onClick={() => appendToFormula(vi, ci, op)}
                                  className="px-2 py-0.5 text-xs font-mono bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                                >
                                  {op}
                                </button>
                              ))}
                            </div>
                            {/* Field chips */}
                            {chips.length > 0 && (
                              <div className="flex flex-wrap gap-1 items-start">
                                <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0 pt-0.5">Fields</span>
                                <div className="flex flex-wrap gap-1">
                                  {chips.map((chip) => (
                                    <button
                                      key={chip.label}
                                      type="button"
                                      onClick={() => appendToFormula(vi, ci, chip.label)}
                                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                                        chip.type === 'anchor'
                                          ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/70'
                                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70'
                                      }`}
                                    >
                                      {chip.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(v.comparison_rules || []).length === 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">No comparison rules yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {variations.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No variations yet.</p>}
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            {!isNew && (
              <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-200 transition">
                Delete
              </button>
            )}
          </div>
        </form>

        {/* Matching Sets */}
        {!isNew && matchingSets.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Matching Sets ({matchingSets.length})</h2>
            <ul className="space-y-2">
              {matchingSets.map((ms) => (
                <li key={ms.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                  <div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      ms.status === 'reconciled' ? 'bg-green-100 text-green-700 border-green-300' :
                      ms.status === 'force_reconciled' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                      ms.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-300' :
                      'bg-amber-100 text-amber-700 border-amber-300'
                    }`}>{ms.status}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                      {new Date(ms.created_at).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/app/reconciliation-rules/${id}/matching-sets/${ms.id}`)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View →
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isNew && usage.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Used in workflows</h2>
            <ul className="space-y-1">
              {usage.map((u) => (
                <li key={u.node_id} className="text-xs">
                  <button onClick={() => navigate(`/app/workflow/${u.workflow_id}?node=${u.node_id}`)} className="text-indigo-600 hover:underline">
                    {u.workflow_name} → {u.node_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReconciliationRuleEdit;
