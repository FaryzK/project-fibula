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
  const [tab, setTab] = useState('anchor'); // 'anchor' | 'held' | 'pool' | 'unrouted'
  const [selectedRule, setSelectedRule] = useState(null); // null = rule list, rule obj = anchor docs
  const [anchorDocs, setAnchorDocs] = useState([]);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [heldDocs, setHeldDocs] = useState([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [poolDocs, setPoolDocs] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [unroutedDocs, setUnroutedDocs] = useState([]);
  const [unroutedLoading, setUnroutedLoading] = useState(false);

  const { rules, loading: rulesLoading, loadRules } = useReconciliationStore();
  const navigate = useNavigate();

  useEffect(() => { loadRules(); }, [loadRules]);

  // Load anchor docs when a rule is selected
  useEffect(() => {
    if (!selectedRule) { setAnchorDocs([]); return; }
    setAnchorLoading(true);
    reconciliationService.listAnchorDocs(selectedRule.id)
      .then((data) => setAnchorDocs(data))
      .catch(() => setAnchorDocs([]))
      .finally(() => setAnchorLoading(false));
  }, [selectedRule]);

  // Load held-only docs when Held Documents tab selected
  useEffect(() => {
    if (tab !== 'held') return;
    setHeldLoading(true);
    reconciliationService.listHeldDocs('held')
      .then((data) => setHeldDocs(data))
      .catch(() => setHeldDocs([]))
      .finally(() => setHeldLoading(false));
  }, [tab]);

  // Load all docs when Data Pool tab selected
  useEffect(() => {
    if (tab !== 'pool') return;
    setPoolLoading(true);
    reconciliationService.listHeldDocs()
      .then((data) => setPoolDocs(data))
      .catch(() => setPoolDocs([]))
      .finally(() => setPoolLoading(false));
  }, [tab]);

  // Load unrouted docs when Unrouted tab selected
  useEffect(() => {
    if (tab !== 'unrouted') return;
    setUnroutedLoading(true);
    reconciliationService.listUnroutedDocs()
      .then((data) => setUnroutedDocs(data))
      .catch(() => setUnroutedDocs([]))
      .finally(() => setUnroutedLoading(false));
  }, [tab]);

  function handleDeletePoolDoc(docId) {
    reconciliationService.deleteDoc(docId)
      .then(() => setPoolDocs((prev) => prev.filter((d) => d.id !== docId)))
      .catch(() => {});
  }

  function handleDeleteHeldDoc(docId) {
    reconciliationService.deleteDoc(docId)
      .then(() => setHeldDocs((prev) => prev.filter((d) => d.id !== docId)))
      .catch(() => {});
  }

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
            onClick={() => { setTab('anchor'); setSelectedRule(null); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === 'anchor'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Rules
          </button>
          <button
            onClick={() => setTab('held')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === 'held'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Held Documents
          </button>
          <button
            onClick={() => setTab('pool')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === 'pool'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Data Pool
          </button>
          <button
            onClick={() => setTab('unrouted')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              tab === 'unrouted'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Unrouted
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
          {!selectedRule ? (
            /* Rule list */
            <div>
              {rulesLoading ? (
                <div className="text-gray-400 text-sm">Loading…</div>
              ) : rules.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No reconciliation rules yet.{' '}
                  <button onClick={() => navigate('/app/reconciliation-rules/new')} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    Create one →
                  </button>
                </p>
              ) : (
                <ul className="space-y-2">
                  {rules.map((r) => (
                    <li
                      key={r.id}
                      onClick={() => setSelectedRule(r)}
                      className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/app/reconciliation-rules/${r.id}`); }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded transition"
                        title="Edit rule"
                      >
                        ✎
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            /* Anchor docs for selected rule */
            <div>
              <button
                onClick={() => setSelectedRule(null)}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
              >
                ← {selectedRule.name}
              </button>
              {anchorLoading ? (
                <div className="text-gray-400 text-sm">Loading…</div>
              ) : anchorDocs.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  No anchor documents yet. Documents arrive via workflow.
                </p>
              ) : (
                <ul className="space-y-2">
                  {anchorDocs.map((doc) => {
                    const status = anchorStatus(doc);
                    return (
                      <li
                        key={doc.anchor_document_execution_id}
                        onClick={() => navigate(`/app/reconciliation-rules/${selectedRule.id}/anchor/${doc.anchor_document_execution_id}`)}
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
        </div>
      )}

      {/* ── Held Documents tab ── */}
      {tab === 'held' && (
        <div>
          {heldLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : heldDocs.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No documents currently held in reconciliation.
            </p>
          ) : (
            <DocsTable docs={heldDocs} showStatus={false} navigate={navigate} onDelete={handleDeleteHeldDoc} />
          )}
        </div>
      )}

      {/* ── Data Pool tab ── */}
      {tab === 'pool' && (
        <div>
          {poolLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : poolDocs.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No documents in reconciliation yet. Documents arrive via workflow.
            </p>
          ) : (
            <DocsTable docs={poolDocs} showStatus navigate={navigate} onDelete={handleDeletePoolDoc} />
          )}
        </div>
      )}

      {/* ── Unrouted tab ── */}
      {tab === 'unrouted' && (
        <div>
          {unroutedLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : unroutedDocs.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No unrouted documents. Documents appear here when a node's output port has no connected edge.
            </p>
          ) : (
            <UnroutedTable docs={unroutedDocs} navigate={navigate} />
          )}
        </div>
      )}
    </div>
  );
}

function DocSourceLink({ doc, navigate }) {
  const nodeName = doc.node_name || 'Deleted node';
  const workflowName = doc.workflow_name || '—';

  if (!doc.workflow_id) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        <div>{workflowName}</div>
        <div className="text-gray-400 dark:text-gray-500">{nodeName}</div>
      </div>
    );
  }

  const href = `/app/workflow/${doc.workflow_id}${doc.node_id ? `?node=${doc.node_id}` : ''}`;
  return (
    <div className="text-xs">
      <button
        onClick={() => navigate(href)}
        className="text-indigo-600 dark:text-indigo-400 hover:underline text-left"
      >
        {workflowName}
      </button>
      <div className="text-gray-400 dark:text-gray-500">{nodeName}</div>
    </div>
  );
}

function DocsTable({ docs, showStatus, navigate, onDelete }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 text-left border-b border-gray-200 dark:border-gray-700">
            <th className="pb-2 pr-4 font-medium">Document</th>
            <th className="pb-2 pr-4 font-medium">Extractor / Slot</th>
            {showStatus && <th className="pb-2 pr-4 font-medium">Status</th>}
            <th className="pb-2 pr-4 font-medium">Source</th>
            <th className="pb-2 pr-4 font-medium">Matching Sets</th>
            {onDelete && <th className="pb-2 font-medium" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {docs.map((doc) => (
            <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
              <td className="py-2 pr-4 text-gray-900 dark:text-white font-medium">
                {doc.file_name || '—'}
              </td>
              <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 text-xs">
                <div>{doc.extractor_name || '—'}</div>
                {doc.slot_label && (
                  <div className="text-gray-400 dark:text-gray-500">{doc.slot_label}</div>
                )}
              </td>
              {showStatus && (
                <td className="py-2 pr-4">
                  <StatusBadge status={doc.status} />
                </td>
              )}
              <td className="py-2 pr-4">
                <DocSourceLink doc={doc} navigate={navigate} />
              </td>
              <td className="py-2 pr-4">
                <MatchingSetsPill sets={doc.matching_sets} docExecId={doc.document_execution_id} />
              </td>
              {onDelete && (
                <td className="py-2 pl-2">
                  <button
                    onClick={() => onDelete(doc.id)}
                    className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition"
                    title="Remove from pool"
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function unroutedDisplayName(doc) {
  try {
    const meta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {});
    // Legacy: old records stored _branch_index in metadata instead of the file name
    const legacyIdx = meta._branch_index;
    if (legacyIdx == null || !doc.file_name) return doc.file_name || '—';
    const lastDot = doc.file_name.lastIndexOf('.');
    if (lastDot === -1) return `${doc.file_name}(${legacyIdx})`;
    return `${doc.file_name.slice(0, lastDot)}(${legacyIdx})${doc.file_name.slice(lastDot)}`;
  } catch (_) {
    return doc.file_name || '—';
  }
}

function UnroutedTable({ docs, navigate }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 text-left border-b border-gray-200 dark:border-gray-700">
            <th className="pb-2 pr-4 font-medium">Document</th>
            <th className="pb-2 pr-4 font-medium">Stopped At</th>
            <th className="pb-2 pr-4 font-medium">Port</th>
            <th className="pb-2 pr-4 font-medium">Workflow</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {docs.map((doc) => (
            <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
              <td className="py-2 pr-4 text-gray-900 dark:text-white font-medium">
                {unroutedDisplayName(doc)}
              </td>
              <td className="py-2 pr-4 text-xs text-gray-500 dark:text-gray-400">
                {doc.node_name || 'Deleted node'}
              </td>
              <td className="py-2 pr-4 text-xs text-gray-500 dark:text-gray-400">
                {doc.unrouted_port || 'default'}
              </td>
              <td className="py-2 pr-4 text-xs">
                {doc.workflow_id ? (
                  <button
                    onClick={() => navigate(`/app/workflow/${doc.workflow_id}`)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline text-left"
                  >
                    {doc.workflow_name || '—'}
                  </button>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">{doc.workflow_name || '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ReconciliationTab;
