import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useReconciliationStore from '../../stores/useReconciliationStore';
import reconciliationService from '../../services/reconciliationService';

const STATUS_FILTERS = ['all', 'pending', 'reconciled', 'force_reconciled', 'rejected'];

const STATUS_STYLES = {
  pending:          'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  reconciled:       'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  force_reconciled: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  rejected:         'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
};

const STATUS_LABELS = {
  pending:          'Pending',
  reconciled:       'Reconciled',
  force_reconciled: 'Force reconciled',
  rejected:         'Rejected',
};

function ReconciliationTab() {
  const [view, setView] = useState('sets'); // 'sets' | 'rules'
  const [statusFilter, setStatusFilter] = useState('pending');
  const [matchingSets, setMatchingSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(true);

  const { rules, loading: rulesLoading, loadRules } = useReconciliationStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    if (view !== 'sets') return;
    setSetsLoading(true);
    reconciliationService
      .listAllMatchingSets(statusFilter === 'all' ? undefined : statusFilter)
      .then((data) => setMatchingSets(data))
      .catch(() => setMatchingSets([]))
      .finally(() => setSetsLoading(false));
  }, [view, statusFilter]);

  return (
    <div className="max-w-3xl">
      {/* Header */}
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
            Matching Sets
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
        {view === 'rules' && (
          <button
            onClick={() => navigate('/app/reconciliation-rules/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
          >
            + New Rule
          </button>
        )}
      </div>

      {/* ── Matching Sets view ── */}
      {view === 'sets' && (
        <>
          {/* Status filter pills */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-500'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {setsLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : matchingSets.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {statusFilter === 'pending'
                ? 'No matching sets pending review.'
                : `No ${statusFilter === 'all' ? '' : STATUS_LABELS[statusFilter]?.toLowerCase() + ' '}matching sets.`}
            </p>
          ) : (
            <ul className="space-y-2">
              {matchingSets.map((set) => (
                <li
                  key={set.id}
                  onClick={() =>
                    navigate(`/app/reconciliation-rules/${set.rule_id}/matching-sets/${set.id}`)
                  }
                  className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {set.rule_name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(set.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                      STATUS_STYLES[set.status] || 'bg-gray-100 text-gray-600 border-gray-300'
                    }`}
                  >
                    {STATUS_LABELS[set.status] || set.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Rules view ── */}
      {view === 'rules' && (
        <>
          {rulesLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : rules.length === 0 ? (
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
        </>
      )}
    </div>
  );
}

export default ReconciliationTab;
