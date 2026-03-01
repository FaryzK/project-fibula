import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useDataMapperStore from '../../stores/useDataMapperStore';
import dataMapperService from '../../services/dataMapperService';

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function DataMapperTab() {
  const [view, setView] = useState('sets'); // 'sets' | 'rules'
  const { sets, rules, loading, loadSets, loadRules, removeSet, removeRule } = useDataMapperStore();
  const navigate = useNavigate();

  // Usage dialog state
  const [usageDialog, setUsageDialog] = useState(null); // { type: 'set'|'rule', id, name, items, loading }
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'set'|'rule', id, name }

  useEffect(() => {
    loadSets();
    loadRules();
  }, [loadSets, loadRules]);

  // ── Set usage dialog ───────────────────────────────────────────────────────
  const openSetUsage = async (setId, setName) => {
    setUsageDialog({ type: 'set', id: setId, name: setName, items: [], loading: true });
    try {
      const items = await dataMapperService.getSetUsage(setId);
      setUsageDialog({ type: 'set', id: setId, name: setName, items, loading: false });
    } catch {
      setUsageDialog({ type: 'set', id: setId, name: setName, items: [], loading: false });
    }
  };

  // ── Rule usage dialog ──────────────────────────────────────────────────────
  const openRuleUsage = async (ruleId, ruleName) => {
    setUsageDialog({ type: 'rule', id: ruleId, name: ruleName, items: [], loading: true });
    try {
      const items = await dataMapperService.getRuleUsage(ruleId);
      setUsageDialog({ type: 'rule', id: ruleId, name: ruleName, items, loading: false });
    } catch {
      setUsageDialog({ type: 'rule', id: ruleId, name: ruleName, items: [], loading: false });
    }
  };

  // ── Delete handlers ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'set') {
        await removeSet(confirmDelete.id);
      } else {
        await removeRule(confirmDelete.id);
      }
    } catch {
      // ignore — store handles errors
    }
    setConfirmDelete(null);
  };

  const handleDownload = (s) => {
    const safeName = (s.name || 'data-map-set').replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
    dataMapperService.downloadSet(s.id, safeName);
  };

  // ── Shared table styles ────────────────────────────────────────────────────
  const thCls = 'text-left text-xs font-medium text-gray-500 dark:text-gray-400 py-2 px-3';
  const tdCls = 'py-2.5 px-3 text-sm text-gray-700 dark:text-gray-300';
  const actionBtnCls = 'p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setView('sets')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              view === 'sets'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Data Map Sets
          </button>
          <button
            onClick={() => setView('rules')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              view === 'rules'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Rules
          </button>
        </div>
        <button
          onClick={() =>
            navigate(view === 'sets' ? '/app/data-map-sets/new' : '/app/data-map-rules/new')
          }
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + New {view === 'sets' ? 'Data Map Set' : 'Rule'}
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : view === 'sets' ? (
        /* ── Sets Table ──────────────────────────────────────────────────── */
        sets.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            No data map sets yet. Create one to define lookup tables.
          </p>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className={thCls}>Name</th>
                  <th className={`${thCls} text-right`}>Rows</th>
                  <th className={`${thCls} text-right`}>Columns</th>
                  <th className={`${thCls} text-right`}>Rules</th>
                  <th className={thCls}>Updated by</th>
                  <th className={thCls}>Updated</th>
                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {sets.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className={tdCls}>
                      <button
                        onClick={() => navigate(`/app/data-map-sets/${s.id}`)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>{s.row_count ?? 0}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{s.column_count ?? 0}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>
                      {(s.rule_count ?? 0) > 0 ? (
                        <button
                          onClick={() => openSetUsage(s.id, s.name)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {s.rule_count}
                        </button>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-xs`}>{s.updated_by_name || '—'}</td>
                    <td className={`${tdCls} text-xs`}>{formatDate(s.updated_at)}</td>
                    <td className={`${tdCls} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/app/data-map-sets/${s.id}`)} className={actionBtnCls} title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDownload(s)} className={actionBtnCls} title="Download CSV">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        <div className="relative group">
                          <button
                            onClick={() => (s.rule_count ?? 0) === 0 && setConfirmDelete({ type: 'set', id: s.id, name: s.name })}
                            className={`${actionBtnCls} ${(s.rule_count ?? 0) > 0 ? 'opacity-40 cursor-not-allowed' : 'hover:text-red-600 dark:hover:text-red-400'}`}
                            disabled={(s.rule_count ?? 0) > 0}
                            title={(s.rule_count ?? 0) > 0 ? `Referenced by ${s.rule_count} rule(s)` : 'Delete'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                          {(s.rule_count ?? 0) > 0 && (
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-10">
                              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                Referenced by {s.rule_count} rule(s)
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* ── Rules Table ─────────────────────────────────────────────────── */
        rules.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            No data map rules yet. Create one to define enrichment logic.
          </p>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className={thCls}>Name</th>
                  <th className={`${thCls} text-right`}>Nodes</th>
                  <th className={thCls}>Updated by</th>
                  <th className={thCls}>Updated</th>
                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className={tdCls}>
                      <button
                        onClick={() => navigate(`/app/data-map-rules/${r.id}`)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>
                      {(r.node_count ?? 0) > 0 ? (
                        <button
                          onClick={() => openRuleUsage(r.id, r.name)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {r.node_count}
                        </button>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-xs`}>{r.updated_by_name || '—'}</td>
                    <td className={`${tdCls} text-xs`}>{formatDate(r.updated_at)}</td>
                    <td className={`${tdCls} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/app/data-map-rules/${r.id}`)} className={actionBtnCls} title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <div className="relative group">
                          <button
                            onClick={() => (r.node_count ?? 0) === 0 && setConfirmDelete({ type: 'rule', id: r.id, name: r.name })}
                            className={`${actionBtnCls} ${(r.node_count ?? 0) > 0 ? 'opacity-40 cursor-not-allowed' : 'hover:text-red-600 dark:hover:text-red-400'}`}
                            disabled={(r.node_count ?? 0) > 0}
                            title={(r.node_count ?? 0) > 0 ? `Used by ${r.node_count} node(s)` : 'Delete'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                          {(r.node_count ?? 0) > 0 && (
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-10">
                              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                Used by {r.node_count} node(s)
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Usage Dialog ──────────────────────────────────────────────────── */}
      {usageDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUsageDialog(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {usageDialog.type === 'set'
                  ? `Rules using "${usageDialog.name}"`
                  : `Nodes using "${usageDialog.name}"`}
              </h3>
              <button onClick={() => setUsageDialog(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {usageDialog.loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : usageDialog.items.length === 0 ? (
              <p className="text-sm text-gray-400">No references found.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {usageDialog.type === 'set'
                  ? usageDialog.items.map((u) => (
                      <li key={u.rule_id}>
                        <button
                          onClick={() => { setUsageDialog(null); navigate(`/app/data-map-rules/${u.rule_id}`); }}
                          className="w-full text-left px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                        >
                          {u.rule_name}
                        </button>
                      </li>
                    ))
                  : usageDialog.items.map((u) => (
                      <li key={u.node_id}>
                        <button
                          onClick={() => { setUsageDialog(null); navigate(`/app/workflow/${u.workflow_id}?node=${u.node_id}`); }}
                          className="w-full text-left px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                        >
                          {u.workflow_name} → {u.node_name}
                        </button>
                      </li>
                    ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm Delete Dialog ─────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full mx-4 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Delete {confirmDelete.type === 'set' ? 'Data Map Set' : 'Rule'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataMapperTab;
