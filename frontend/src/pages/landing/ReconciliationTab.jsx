import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useReconciliationStore from '../../stores/useReconciliationStore';
import reconciliationService from '../../services/reconciliationService';

const STATUS_STYLES = {
  held:       'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  reconciled: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  rejected:   'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  open:       'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  sent_out:   'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
};

const STATUS_LABELS = {
  held:       'Held',
  reconciled: 'Fully Reconciled',
  rejected:   'Rejected',
  open:       'Open',
  sent_out:   'Sent Out',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function MatchingSetsPill({ sets, docExecId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!sets || sets.length === 0) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">None</span>;
  }

  const preview = sets.slice(0, 2);
  const rest = sets.slice(2);

  return (
    <div className="flex items-center gap-1 flex-wrap" ref={ref}>
      {preview.map((s) => (
        <span key={s.id} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
          {s.rule_name}
        </span>
      ))}
      {rest.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            +{rest.length} more
          </button>
          {open && (
            <div className="absolute z-20 left-0 top-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[160px]">
              {rest.map((s) => (
                <p key={s.id} className="text-xs text-gray-700 dark:text-gray-300 py-0.5">
                  {s.rule_name}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReconciliationTab() {
  const [tab, setTab] = useState('anchor'); // 'anchor' | 'documents'
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [anchorDocs, setAnchorDocs] = useState([]);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [heldDocs, setHeldDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const { rules, loading: rulesLoading, loadRules } = useReconciliationStore();
  const navigate = useNavigate();

  useEffect(() => { loadRules(); }, [loadRules]);

  // Auto-select first rule when rules load
  useEffect(() => {
    if (rules.length > 0 && !selectedRuleId) setSelectedRuleId(rules[0].id);
  }, [rules, selectedRuleId]);

  // Load anchor docs when rule selected
  useEffect(() => {
    if (!selectedRuleId) { setAnchorDocs([]); return; }
    setAnchorLoading(true);
    reconciliationService.listAnchorDocs(selectedRuleId)
      .then((data) => setAnchorDocs(data))
      .catch(() => setAnchorDocs([]))
      .finally(() => setAnchorLoading(false));
  }, [selectedRuleId]);

  // Load held docs when Documents tab selected
  useEffect(() => {
    if (tab !== 'documents') return;
    setDocsLoading(true);
    reconciliationService.listHeldDocs()
      .then((data) => setHeldDocs(data))
      .catch(() => setHeldDocs([]))
      .finally(() => setDocsLoading(false));
  }, [tab]);

  // Derive anchor status from its matching sets
  function anchorStatus(doc) {
    if (!doc.sets || doc.sets.length === 0) return doc.held_status || 'held';
    if (doc.sets.some((s) => s.status === 'reconciled')) return 'reconciled';
    return 'open';
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('anchor')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === 'anchor'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Anchor Documents
          </button>
          <button
            onClick={() => setTab('documents')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === 'documents'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Documents
          </button>
        </div>
        <button
          onClick={() => navigate('/app/reconciliation-rules/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + New Rule
        </button>
      </div>

      {/* ── Anchor Documents tab ── */}
      {tab === 'anchor' && (
        <div>
          {/* Rule selector */}
          <div className="mb-4">
            <select
              value={selectedRuleId}
              onChange={(e) => setSelectedRuleId(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select a rule —</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {rules.length === 0 && !rulesLoading && (
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                No reconciliation rules yet.{' '}
                <button
                  onClick={() => navigate('/app/reconciliation-rules/new')}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Create one →
                </button>
              </p>
            )}
          </div>

          {anchorLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : anchorDocs.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {selectedRuleId
                ? 'No anchor documents for this rule yet. Documents arrive via workflow.'
                : 'Select a rule to see its anchor documents.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {anchorDocs.map((doc) => {
                const status = anchorStatus(doc);
                return (
                  <li
                    key={doc.anchor_document_execution_id}
                    onClick={() => navigate(`/app/reconciliation-rules/${selectedRuleId}/anchor/${doc.anchor_document_execution_id}`)}
                    className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {doc.file_name || doc.anchor_document_execution_id}
                    </p>
                    <StatusBadge status={status} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── Documents tab ── */}
      {tab === 'documents' && (
        <div>
          {docsLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : heldDocs.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No documents in reconciliation yet. Documents arrive via workflow.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400 text-left border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-4 font-medium">Document</th>
                    <th className="pb-2 pr-4 font-medium">Extractor</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Source</th>
                    <th className="pb-2 font-medium">Matching Sets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {heldDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="py-2 pr-4 text-gray-900 dark:text-white font-medium">
                        {doc.file_name || '—'}
                      </td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">
                        {doc.extractor_name || '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 text-xs">
                        <div>{doc.workflow_name || '—'}</div>
                        {doc.slot_label && (
                          <div className="text-gray-400 dark:text-gray-500">{doc.slot_label}</div>
                        )}
                      </td>
                      <td className="py-2">
                        <MatchingSetsPill sets={doc.matching_sets} docExecId={doc.document_execution_id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ReconciliationTab;
