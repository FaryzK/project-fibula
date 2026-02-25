import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dataMapperService from '../../services/dataMapperService';
import extractorService from '../../services/extractorService';

const MATCH_TYPES = ['exact', 'fuzzy'];
const TARGET_TYPES = ['header', 'table_column'];
const TARGET_MODES = ['map', 'calculation'];

function DataMapRuleEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [extractorId, setExtractorId] = useState('');
  const [extractors, setExtractors] = useState([]);
  const [sets, setSets] = useState([]);
  const [lookups, setLookups] = useState([]);
  const [targets, setTargets] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [exts, setList] = await Promise.all([
          extractorService.list(),
          dataMapperService.listSets(),
        ]);
        setExtractors(exts);
        setSets(setList);

        if (!isNew) {
          const { rule, usage: u } = await dataMapperService.getRule(id);
          setName(rule.name);
          setExtractorId(rule.extractor_id || '');
          setLookups(rule.lookups || []);
          setTargets(rule.targets || []);
          setUsage(u);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  function addLookup() {
    setLookups((prev) => [...prev, { data_map_set_id: '', map_set_column: '', schema_field: '', match_type: 'exact', match_threshold: 0.8 }]);
  }

  function addTarget() {
    setTargets((prev) => [...prev, { target_type: 'header', schema_field: '', map_set_column: '', mode: 'map', calculation_expression: '' }]);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name, extractor_id: extractorId, lookups, targets };
      if (isNew) {
        await dataMapperService.createRule(payload);
        navigate('/app?tab=dataMapper');
      } else {
        await dataMapperService.updateRule(id, payload);
        navigate('/app?tab=dataMapper');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await dataMapperService.removeRule(id);
      navigate('/app?tab=dataMapper');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/app?tab=dataMapper')} className="text-sm text-indigo-600 hover:underline mb-6 block">
          ← Back to Data Mapper
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Data Map Rule' : 'Edit Data Map Rule'}
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rule name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Vendor Code Lookup"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Extractor schema</label>
              <select
                value={extractorId}
                onChange={(e) => setExtractorId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select extractor…</option>
                {extractors.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Lookups */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lookup Criteria (up to 7)</h2>
              {lookups.length < 7 && (
                <button type="button" onClick={addLookup} className="text-xs text-indigo-600 hover:underline">+ Add lookup</button>
              )}
            </div>
            <div className="space-y-3">
              {lookups.map((lk, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-center bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <select
                    value={lk.data_map_set_id}
                    onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, data_map_set_id: e.target.value } : x))}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Set…</option>
                    {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input
                    value={lk.map_set_column}
                    onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, map_set_column: e.target.value } : x))}
                    placeholder="Set column"
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <input
                    value={lk.schema_field}
                    onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, schema_field: e.target.value } : x))}
                    placeholder="Schema field"
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <select
                    value={lk.match_type}
                    onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, match_type: e.target.value } : x))}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setLookups((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm justify-self-center">×</button>
                </div>
              ))}
              {lookups.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No lookups yet.</p>}
            </div>
          </div>

          {/* Targets */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Map Targets</h2>
              <button type="button" onClick={addTarget} className="text-xs text-indigo-600 hover:underline">+ Add target</button>
            </div>
            <div className="space-y-3">
              {targets.map((tg, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-center bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <select
                    value={tg.target_type}
                    onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, target_type: e.target.value } : x))}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    value={tg.schema_field}
                    onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, schema_field: e.target.value } : x))}
                    placeholder="Schema field"
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <input
                    value={tg.map_set_column}
                    onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, map_set_column: e.target.value } : x))}
                    placeholder="Set column"
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <select
                    value={tg.mode}
                    onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, mode: e.target.value } : x))}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {TARGET_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setTargets((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm justify-self-center">×</button>
                </div>
              ))}
              {targets.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No targets yet.</p>}
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

export default DataMapRuleEdit;
