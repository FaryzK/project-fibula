import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import reconciliationService from '../../services/reconciliationService';

const STATUS_STYLES = {
  pending:          'bg-yellow-100 text-yellow-700 border-yellow-300',
  reconciled:       'bg-green-100 text-green-700 border-green-300',
  force_reconciled: 'bg-blue-100 text-blue-700 border-blue-300',
  rejected:         'bg-red-100 text-red-700 border-red-300',
};

function MatchingSetDetail() {
  const { ruleId, setId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await reconciliationService.getMatchingSet(ruleId, setId);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [ruleId, setId]);

  async function handleForceReconcile() {
    if (!window.confirm('Force-reconcile this set? Documents will continue downstream.')) return;
    setActing(true);
    try {
      const updated = await reconciliationService.forceReconcile(ruleId, setId);
      setData((prev) => ({ ...prev, set: updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!window.confirm('Reject this matching set? Documents will be marked rejected.')) return;
    setActing(true);
    try {
      const updated = await reconciliationService.reject(ruleId, setId);
      setData((prev) => ({ ...prev, set: updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;
  if (error) return <div className="p-8 text-red-500 text-sm">{error}</div>;

  const { set, docs } = data;
  const isPending = set.status === 'pending';
  const statusStyle = STATUS_STYLES[set.status] || 'bg-gray-100 text-gray-600 border-gray-300';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate(`/app/reconciliation-rules/${ruleId}`)}
          className="text-sm text-indigo-600 hover:underline mb-6 block"
        >
          ← Back to Reconciliation Rule
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Matching Set</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{set.id}</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${statusStyle}`}>
            {set.status.replace('_', ' ')}
          </span>
        </div>

        {/* Meta */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Created: {new Date(set.created_at).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Anchor exec: <span className="font-mono">{set.anchor_document_execution_id}</span>
          </p>
        </div>

        {/* Documents */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Documents in set ({docs.length})
          </h2>
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400">No documents.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-300">
                      exec: {doc.document_execution_id}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      extractor: {doc.extractor_id}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-3">
            <button
              onClick={handleForceReconcile}
              disabled={acting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              Force Reconcile
            </button>
            <button
              onClick={handleReject}
              disabled={acting}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-200 transition disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}

        {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
      </div>
    </div>
  );
}

export default MatchingSetDetail;
