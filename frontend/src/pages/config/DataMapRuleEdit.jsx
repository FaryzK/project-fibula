import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dataMapperService from '../../services/dataMapperService';
import extractorService from '../../services/extractorService';

const MATCH_TYPES = ['exact', 'fuzzy'];
const OPERATORS = ['+', '-', '*', '/', '(', ')'];

const selectCls = 'border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-full';

function DataMapRuleEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [extractorId, setExtractorId] = useState('');
  const [dataMapSetId, setDataMapSetId] = useState('');
  const [extractors, setExtractors] = useState([]);
  const [sets, setSets] = useState([]);
  const [schemaFields, setSchemaFields] = useState([]); // [{name, data_type}]
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
          setDataMapSetId(rule.data_map_set_id || '');
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

  // Fetch full extractor schema whenever extractorId changes
  useEffect(() => {
    if (!extractorId) { setSchemaFields([]); return; }
    extractorService.getOne(extractorId).then(({ extractor }) => {
      const fields = (extractor.header_fields || []).map((f) => ({
        name: f.field_name,
        data_type: f.data_type || 'string',
      }));
      for (const tt of extractor.table_types || []) {
        for (const col of tt.columns || []) {
          fields.push({
            name: `${tt.type_name}.${col.column_name}`,
            data_type: col.data_type || 'string',
          });
        }
      }
      setSchemaFields(fields);
    }).catch(() => setSchemaFields([]));
  }, [extractorId]);

  // Parse a set's typed headers from the already-loaded sets list
  function getSetHeaders(setId) {
    const s = sets.find((x) => x.id === setId);
    if (!s) return [];
    try {
      const raw = typeof s.headers === 'string' ? JSON.parse(s.headers) : (s.headers || []);
      return raw.map((h) => typeof h === 'object' ? h : { name: h, data_type: 'string' });
    } catch { return []; }
  }

  const setHeaders = getSetHeaders(dataMapSetId);

  function addLookup() {
    setLookups((prev) => [...prev, { map_set_column: '', schema_field: '', match_type: 'exact', match_threshold: 0.8 }]);
  }

  function addTarget() {
    setTargets((prev) => [...prev, { schema_field: '', expression: '' }]);
  }

  function appendToExpression(i, token) {
    setTargets((prev) => prev.map((x, j) => {
      if (j !== i) return x;
      const expr = x.expression || '';
      const sep = expr && !expr.endsWith(' ') ? ' ' : '';
      return { ...x, expression: expr + sep + token };
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name, extractor_id: extractorId, data_map_set_id: dataMapSetId || null, lookups, targets };
      if (isNew) {
        await dataMapperService.createRule(payload);
        navigate('/app?tab=data-mapper');
      } else {
        await dataMapperService.updateRule(id, payload);
        navigate('/app?tab=data-mapper');
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
      navigate('/app?tab=data-mapper');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/app?tab=data-mapper')} className="text-sm text-indigo-600 hover:underline mb-6 block">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Map Set</label>
              <select
                value={dataMapSetId}
                onChange={(e) => setDataMapSetId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select data map set…</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Lookups */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lookup Criteria</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Match a schema field against a set column to find the right row (up to 7)</p>
              </div>
              {lookups.length < 7 && (
                <button type="button" onClick={addLookup} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add lookup</button>
              )}
            </div>
            {/* Column headers */}
            {lookups.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-1 px-1">
                {['Set column', 'Schema field', 'Match type', ''].map((h) => (
                  <span key={h} className="text-xs font-medium text-gray-400 dark:text-gray-500">{h}</span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {lookups.map((lk, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3 space-y-2">
                  {/* Main row */}
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <select
                      value={lk.map_set_column}
                      onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, map_set_column: e.target.value } : x))}
                      className={selectCls}
                      disabled={setHeaders.length === 0}
                    >
                      <option value="">Column…</option>
                      {setHeaders.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
                    </select>
                    <select
                      value={lk.schema_field}
                      onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, schema_field: e.target.value } : x))}
                      className={selectCls}
                      disabled={schemaFields.length === 0}
                    >
                      <option value="">Field…</option>
                      {schemaFields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                    </select>
                    <select
                      value={lk.match_type}
                      onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, match_type: e.target.value } : x))}
                      className={selectCls}
                    >
                      {MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setLookups((prev) => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 text-sm px-1"
                    >×</button>
                  </div>
                  {/* Fuzzy threshold sub-row */}
                  {lk.match_type === 'fuzzy' && (
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-24">Fuzzy threshold</span>
                      <input
                        type="range"
                        min="0" max="1" step="0.05"
                        value={lk.match_threshold ?? 0.8}
                        onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, match_threshold: parseFloat(e.target.value) } : x))}
                        className="flex-1 accent-indigo-600 h-1.5"
                      />
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 w-10 text-right shrink-0">
                        {Math.round((lk.match_threshold ?? 0.8) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
              {lookups.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No lookups yet.</p>}
            </div>
          </div>

          {/* Targets */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Map Targets</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">For each matched row, populate a schema field with a value from the set</p>
              </div>
              <button type="button" onClick={addTarget} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add target</button>
            </div>
            <div className="space-y-2">
              {targets.map((tg, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3 space-y-2">
                  {/* Schema field selector + delete */}
                  <div className="flex items-center gap-2">
                    <select
                      value={tg.schema_field}
                      onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, schema_field: e.target.value } : x))}
                      className={selectCls + ' flex-1'}
                      disabled={schemaFields.length === 0}
                    >
                      <option value="">Schema field…</option>
                      {schemaFields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setTargets((prev) => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 text-sm px-1 shrink-0"
                    >×</button>
                  </div>

                  {/* Expression builder */}
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Value</label>
                    <textarea
                      value={tg.expression || ''}
                      onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, expression: e.target.value } : x))}
                      placeholder="Click a set column chip or build an expression"
                      rows={1}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {/* Set column chips */}
                    {setHeaders.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-start">
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-20 shrink-0 pt-0.5">Set columns</span>
                        <div className="flex flex-wrap gap-1">
                          {setHeaders.map((h) => (
                            <button
                              key={h.name}
                              type="button"
                              onClick={() => appendToExpression(i, h.name)}
                              className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
                              title={`Set column: ${h.name} (${h.data_type})`}
                            >
                              {h.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Schema variable + operators */}
                    <div className="flex flex-wrap gap-1 items-start">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-20 shrink-0 pt-0.5">Variables</span>
                      <button
                        type="button"
                        onClick={() => appendToExpression(i, 'schema')}
                        className="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/70 transition-colors"
                        title={`Current value of: ${tg.schema_field || '(select schema field)'}`}
                      >
                        schema{tg.schema_field ? ` (${tg.schema_field})` : ''}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-20 shrink-0">Operators</span>
                      {OPERATORS.map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => appendToExpression(i, op)}
                          className="px-2 py-0.5 text-xs font-mono bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>
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
