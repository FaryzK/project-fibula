import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import reconciliationService from '../../services/reconciliationService';
import extractorService from '../../services/extractorService';

function ReconciliationRuleEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [anchorExtractorId, setAnchorExtractorId] = useState('');
  const [targetExtractors, setTargetExtractors] = useState([]);
  const [variations, setVariations] = useState([]);
  const [extractors, setExtractors] = useState([]);
  const [usage, setUsage] = useState([]);
  const [matchingSets, setMatchingSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const exts = await extractorService.list();
        setExtractors(exts);
        if (!isNew) {
          const { rule, usage: u } = await reconciliationService.getOne(id);
          setName(rule.name);
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

  function addVariation() {
    setVariations((prev) => [
      ...prev,
      {
        variation_order: prev.length + 1,
        doc_matching_links: [],
        table_matching_keys: [],
        comparison_rules: [],
      },
    ]);
  }

  function addDocLink(varIdx) {
    setVariations((prev) =>
      prev.map((v, i) =>
        i === varIdx
          ? {
              ...v,
              doc_matching_links: [
                ...v.doc_matching_links,
                { anchor_field: '', target_extractor_id: '', target_field: '', match_type: 'exact', match_threshold: 0.8 },
              ],
            }
          : v
      )
    );
  }

  function addComparisonRule(varIdx) {
    setVariations((prev) =>
      prev.map((v, i) =>
        i === varIdx
          ? {
              ...v,
              comparison_rules: [
                ...v.comparison_rules,
                { level: 'header', formula: '', tolerance_type: 'absolute', tolerance_value: 0 },
              ],
            }
          : v
      )
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim() || !anchorExtractorId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        anchor_extractor_id: anchorExtractorId,
        target_extractors: targetExtractors,
        variations,
      };
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

  const getExtractorName = (extId) => extractors.find((e) => e.id === extId)?.name || extId;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anchor extractor</label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target extractors</label>
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
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Variations (Waterfall Logic)</h2>
              <button type="button" onClick={addVariation} className="text-xs text-indigo-600 hover:underline">+ Add variation</button>
            </div>
            <div className="space-y-4">
              {variations.map((v, vi) => (
                <div key={vi} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Variation {vi + 1}</span>
                    <button type="button" onClick={() => setVariations((prev) => prev.filter((_, i) => i !== vi))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>

                  {/* Doc Matching Links */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Document matching links</span>
                      <button type="button" onClick={() => addDocLink(vi)} className="text-xs text-indigo-600 hover:underline">+ Add link</button>
                    </div>
                    <div className="space-y-2">
                      {(v.doc_matching_links || []).map((lk, li) => (
                        <div key={li} className="grid grid-cols-5 gap-1 items-center">
                          <input
                            value={lk.anchor_field}
                            onChange={(e) => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, doc_matching_links: vx.doc_matching_links.map((l, li2) => li2 !== li ? l : { ...l, anchor_field: e.target.value }) }))}
                            placeholder="Anchor field"
                            className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <select
                            value={lk.target_extractor_id}
                            onChange={(e) => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, doc_matching_links: vx.doc_matching_links.map((l, li2) => li2 !== li ? l : { ...l, target_extractor_id: e.target.value }) }))}
                            className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">Target extractor…</option>
                            {targetExtractors.map((te) => <option key={te.extractor_id} value={te.extractor_id}>{getExtractorName(te.extractor_id)}</option>)}
                          </select>
                          <input
                            value={lk.target_field}
                            onChange={(e) => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, doc_matching_links: vx.doc_matching_links.map((l, li2) => li2 !== li ? l : { ...l, target_field: e.target.value }) }))}
                            placeholder="Target field"
                            className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <select
                            value={lk.match_type}
                            onChange={(e) => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, doc_matching_links: vx.doc_matching_links.map((l, li2) => li2 !== li ? l : { ...l, match_type: e.target.value }) }))}
                            className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="exact">exact</option>
                            <option value="fuzzy">fuzzy</option>
                          </select>
                          <button type="button" onClick={() => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, doc_matching_links: vx.doc_matching_links.filter((_, li2) => li2 !== li) }))} className="text-red-400 hover:text-red-600 text-sm justify-self-center">×</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Comparison Rules */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Comparison rules</span>
                      <button type="button" onClick={() => addComparisonRule(vi)} className="text-xs text-indigo-600 hover:underline">+ Add rule</button>
                    </div>
                    <div className="space-y-2">
                      {(v.comparison_rules || []).map((cr, ci) => (
                        <div key={ci} className="grid grid-cols-4 gap-1 items-center">
                          <input
                            value={cr.formula}
                            onChange={(e) => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, comparison_rules: vx.comparison_rules.map((c, ci2) => ci2 !== ci ? c : { ...c, formula: e.target.value }) }))}
                            placeholder="Formula e.g. Invoice.total == PO.total"
                            className="col-span-2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <select
                            value={cr.tolerance_type || 'absolute'}
                            onChange={(e) => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, comparison_rules: vx.comparison_rules.map((c, ci2) => ci2 !== ci ? c : { ...c, tolerance_type: e.target.value }) }))}
                            className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="absolute">absolute</option>
                            <option value="percentage">%</option>
                          </select>
                          <button type="button" onClick={() => setVariations((prev) => prev.map((vx, vi2) => vi2 !== vi ? vx : { ...vx, comparison_rules: vx.comparison_rules.filter((_, ci2) => ci2 !== ci) }))} className="text-red-400 hover:text-red-600 text-sm justify-self-center">×</button>
                        </div>
                      ))}
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
