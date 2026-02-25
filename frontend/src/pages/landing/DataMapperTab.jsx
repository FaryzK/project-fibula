import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useDataMapperStore from '../../stores/useDataMapperStore';

function DataMapperTab() {
  const [view, setView] = useState('sets'); // 'sets' | 'rules'
  const { sets, rules, loading, loadSets, loadRules } = useDataMapperStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadSets();
    loadRules();
  }, [loadSets, loadRules]);

  return (
    <div className="max-w-3xl">
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
        <>
          {sets.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No data map sets yet. Create one to define lookup tables.
            </p>
          ) : (
            <ul className="space-y-2">
              {sets.map((s) => (
                <li
                  key={s.id}
                  onClick={() => navigate(`/app/data-map-sets/${s.id}`)}
                  className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {Array.isArray(s.headers) ? s.headers.join(', ') : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Edit →</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {rules.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No data map rules yet. Create one to define enrichment logic.
            </p>
          ) : (
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r.id}
                  onClick={() => navigate(`/app/data-map-rules/${r.id}`)}
                  className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Edit →</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default DataMapperTab;
