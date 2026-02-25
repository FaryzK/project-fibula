import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useReconciliationStore from '../../stores/useReconciliationStore';

function ReconciliationTab() {
  const { rules, loading, loadRules } = useReconciliationStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reconciliation Rules</h2>
        <button
          onClick={() => navigate('/app/reconciliation-rules/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + New Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          No reconciliation rules yet. Create one to define multi-document matching and comparison logic.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              onClick={() => navigate(`/app/reconciliation-rules/${rule.id}`)}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</p>
                {rule.target_extractors && rule.target_extractors.length > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {rule.target_extractors.length + 1} document type(s)
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">Edit →</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ReconciliationTab;
