import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dataMapperService from '../../services/dataMapperService';
import extractorService from '../../services/extractorService';

const MATCH_TYPES = ['exact', 'fuzzy'];
const TARGET_TYPES = ['header', 'table_column'];
const TARGET_MODES = ['map', 'calculation'];
const OPERATORS = ['+', '-', '*', '/', '(', ')'];

const selectCls = 'border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-full';

function DataMapRuleEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [extractorId, setExtractorId] = useState('');
  const [extractors, setExtractors] = useState([]);
  const [sets, setSets] = useState([]);
  const [schemaFields, setSchemaFields] = useState([]); // flat list: header field names + "TableType.column_name"
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

  // Fetch full extractor schema whenever extractorId changes
  useEffect(() => {
    if (!extractorId) { setSchemaFields([]); return; }
    extractorService.getOne(extractorId).then(({ extractor }) => {
      const fields = (extractor.header_fields || []).map((f) => f.field_name);
      for (const tt of extractor.table_types || []) {
        for (const col of tt.columns || []) fields.push(`${tt.type_name}.${col.column_name}`);
      }
      setSchemaFields(fields);
    }).catch(() => setSchemaFields([]));
  }, [extractorId]);

  // Parse a set's headers from the already-loaded sets list
  function getSetHeaders(setId) {
    const set = sets.find((s) => s.id === setId);
    if (!set) return [];
    try { return typeof set.headers === 'string' ? JSON.parse(set.headers) : (set.headers || []); }
    catch { return []; }
  }

  function addLookup() {
    setLookups((prev) => [...prev, { data_map_set_id: '', map_set_column: '', schema_field: '', match_type: 'exact', match_threshold: 0.8 }]);
  }

  function addTarget() {
    setTargets((prev) => [...prev, { target_type: 'header', schema_field: '', data_map_set_id: '', map_set_column: '', mode: 'map', calculation_expression: '' }]);
  }

  function appendToExpression(i, token) {
    setTargets((prev) => prev.map((x, j) => {
      if (j !== i) return x;
      const expr = x.calculation_expression || '';
      const sep = expr && !expr.endsWith(' ') ? ' ' : '';
      return { ...x, calculation_expression: expr + sep + token };
    }));
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
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 mb-1 px-1">
                {['Set', 'Set column', 'Schema field', 'Match type', ''].map((h) => (
                  <span key={h} className="text-xs font-medium text-gray-400 dark:text-gray-500">{h}</span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {lookups.map((lk, i) => {
                const setHeaders = getSetHeaders(lk.data_map_set_id);
                return (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3 space-y-2">
                    {/* Main row */}
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                      <select
                        value={lk.data_map_set_id}
                        onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, data_map_set_id: e.target.value, map_set_column: '' } : x))}
                        className={selectCls}
                      >
                        <option value="">Set…</option>
                        {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select
                        value={lk.map_set_column}
                        onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, map_set_column: e.target.value } : x))}
                        className={selectCls}
                        disabled={setHeaders.length === 0}
                      >
                        <option value="">Column…</option>
                        {setHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select
                        value={lk.schema_field}
                        onChange={(e) => setLookups((prev) => prev.map((x, j) => j === i ? { ...x, schema_field: e.target.value } : x))}
                        className={selectCls}
                        disabled={schemaFields.length === 0}
                      >
                        <option value="">Field…</option>
                        {schemaFields.map((f) => <option key={f} value={f}>{f}</option>)}
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
                    {/* Fuzzy threshold sub-row — separate from grid so it doesn't affect alignment */}
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
                );
              })}
              {lookups.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No lookups yet.</p>}
            </div>
          </div>

          {/* Targets */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Map Targets</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">For each matched row, write a set column value into a schema field</p>
              </div>
              <button type="button" onClick={addTarget} className="text-xs text-indigo-600 hover:underline shrink-0">+ Add target</button>
            </div>
            {/* Column headers */}
            {targets.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2 mb-1 px-1">
                {['Type', 'Schema field', 'Set', 'Set column', 'Mode', ''].map((h) => (
                  <span key={h} className="text-xs font-medium text-gray-400 dark:text-gray-500">{h}</span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {targets.map((tg, i) => {
                const tgSetHeaders = getSetHeaders(tg.data_map_set_id);
                return (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3 space-y-2">
                    {/* Main row */}
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                      <select
                        value={tg.target_type}
                        onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, target_type: e.target.value } : x))}
                        className={selectCls}
                      >
                        {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select
                        value={tg.schema_field}
                        onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, schema_field: e.target.value } : x))}
                        className={selectCls}
                        disabled={schemaFields.length === 0}
                      >
                        <option value="">Field…</option>
                        {schemaFields.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select
                        value={tg.data_map_set_id}
                        onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, data_map_set_id: e.target.value, map_set_column: '' } : x))}
                        className={selectCls}
                      >
                        <option value="">Set…</option>
                        {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select
                        value={tg.map_set_column}
                        onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, map_set_column: e.target.value } : x))}
                        className={selectCls}
                        disabled={tgSetHeaders.length === 0}
                      >
                        <option value="">Column…</option>
                        {tgSetHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select
                        value={tg.mode}
                        onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, mode: e.target.value } : x))}
                        className={selectCls}
                      >
                        {TARGET_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setTargets((prev) => prev.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-sm px-1"
                      >×</button>
                    </div>

                    {/* Calculation expression builder */}
                    {tg.mode === 'calculation' && (
                      <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <textarea
                          value={tg.calculation_expression}
                          onChange={(e) => setTargets((prev) => prev.map((x, j) => j === i ? { ...x, calculation_expression: e.target.value } : x))}
                          placeholder="e.g. totalAmount * exchangeRate / quantity"
                          rows={2}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {/* Operators */}
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0">Operators</span>
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
                        {/* Schema field chips */}
                        {schemaFields.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-start">
                            <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0 pt-0.5">Schema</span>
                            <div className="flex flex-wrap gap-1">
                              {schemaFields.map((f) => (
                                <button
                                  key={f}
                                  type="button"
                                  onClick={() => appendToExpression(i, f)}
                                  className="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/70 transition-colors"
                                >
                                  {f}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Set column chips */}
                        {tgSetHeaders.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-start">
                            <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0 pt-0.5">Set cols</span>
                            <div className="flex flex-wrap gap-1">
                              {tgSetHeaders.map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => appendToExpression(i, h)}
                                  className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
                                >
                                  {h}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
