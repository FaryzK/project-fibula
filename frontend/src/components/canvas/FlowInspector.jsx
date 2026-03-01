import { useEffect, useState, useCallback, useRef } from 'react';
import flowInspectorService from '../../services/flowInspectorService';

// Node types that can hold documents
const HOLD_CAPABLE = new Set(['EXTRACTOR', 'DOCUMENT_FOLDER', 'RECONCILIATION']);

const CATEGORY_COLORS = {
  Trigger:   'bg-blue-500',
  Config:    'bg-purple-500',
  Execution: 'bg-amber-500',
  Service:   'bg-emerald-500',
  Output:    'bg-rose-500',
};

const NODE_CATEGORIES = {
  MANUAL_UPLOAD:   'Trigger',
  WEBHOOK:         'Trigger',
  SPLITTING:       'Config',
  CATEGORISATION:  'Config',
  IF:              'Execution',
  SWITCH:          'Execution',
  SET_VALUE:       'Execution',
  EXTRACTOR:       'Service',
  DATA_MAPPER:     'Service',
  RECONCILIATION:  'Service',
  DOCUMENT_FOLDER: 'Service',
  HTTP:            'Output',
};

/** Return the display name for a doc.
 *  New records: branch suffix is baked into file_name (e.g. invoice(2).pdf) — return as-is.
 *  Legacy records: branch suffix is derived from _branch_index metadata and appended. */
function displayName(doc) {
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

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/** Derive output port list from node type + config — mirrors FibulaNode.getOutputHandles */
function getOutputPorts(nodeType, config) {
  switch (nodeType) {
    case 'RECONCILIATION': {
      const slots = config?.recon_inputs || [];
      if (slots.length > 0) return slots.map((s) => ({ id: s.id, label: s.label || `Slot ${s.id}` }));
      return [{ id: 'default', label: 'Output' }];
    }
    case 'IF':
      return [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }];
    case 'SWITCH': {
      const cases = (config?.cases || []).map((c) => ({ id: c.id, label: c.label || c.id }));
      return [...cases, { id: 'fallback', label: 'Fallback' }];
    }
    case 'CATEGORISATION': {
      const labels = config?.categorisation_labels || [];
      if (labels.length === 0) return [{ id: 'default', label: 'Output' }];
      return labels.map((l) => ({ id: l, label: l }));
    }
    default:
      return [{ id: 'default', label: 'Output' }];
  }
}

/** Build tab list for a node — includes one Unrouted tab per output port */
function getNodeTabs(nodeType, config) {
  const ports = getOutputPorts(nodeType, config);
  const unroutedTabs = ports.map((p) => ({
    id: `unrouted:${p.id}`,
    label: ports.length === 1 ? 'Unrouted' : `Unrouted (${p.label})`,
    portId: p.id,
    type: 'unrouted',
  }));

  if (nodeType === 'RECONCILIATION') {
    return [
      { id: 'held', label: 'Held Documents', type: 'held' },
      ...unroutedTabs,
      { id: 'failed', label: 'Failed', type: 'failed' },
    ];
  }

  const tabs = [];
  if (nodeType === 'EXTRACTOR' || nodeType === 'DOCUMENT_FOLDER') {
    tabs.push({ id: 'held', label: 'Held', type: 'held' });
  }
  tabs.push({ id: 'processing', label: 'Processing', type: 'processing' });
  tabs.push(...unroutedTabs);
  tabs.push({ id: 'failed', label: 'Failed', type: 'failed' });
  return tabs;
}

// ─── Retrigger Modal ─────────────────────────────────────────────────────────

function RetriggerModal({ workflowId, execIds, onClose, onDone }) {
  const [triggerNodes, setTriggerNodes] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    flowInspectorService.getSummary(workflowId).then((r) => {
      const triggers = r.data.filter((n) =>
        n.node_type === 'MANUAL_UPLOAD' || n.node_type === 'WEBHOOK'
      );
      setTriggerNodes(triggers);
      if (triggers.length === 1) setSelected([triggers[0].id]);
    });
  }, [workflowId]);

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleRun() {
    if (!selected.length) return;
    setLoading(true);
    try {
      await flowInspectorService.retrigger(workflowId, execIds, selected);
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Re-trigger {execIds.length} document{execIds.length !== 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select which trigger node(s) to send the document(s) to:</p>
          {triggerNodes.length === 0 && (
            <p className="text-sm text-gray-400">No trigger nodes found in this workflow.</p>
          )}
          {triggerNodes.map((n) => (
            <label key={n.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={selected.includes(n.id)}
                onChange={() => toggle(n.id)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-900 dark:text-white">{n.name}</span>
              <span className="text-xs text-gray-400">{n.node_type === 'WEBHOOK' ? 'Webhook' : 'Manual Upload'}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
          <button
            onClick={handleRun}
            disabled={!selected.length || loading}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Triggering…' : 'Re-trigger'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Unrouted Panel ───────────────────────────────────────────────────────────

function UnroutedPanel({ workflowId, node, portId, onRetrigger }) {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [sendOutError, setSendOutError] = useState(null);
  const intervalRef = useRef(null);

  const fetchDocs = useCallback(async () => {
    try {
      const r = await flowInspectorService.getNodeDocuments(workflowId, node.id, 'unrouted', portId);
      setDocs(r.data);
    } catch (_) {}
  }, [workflowId, node.id, portId]);

  useEffect(() => {
    setDocs([]);
    setSelected(new Set());
    setSendOutError(null);
    setLoading(true);
    fetchDocs().finally(() => setLoading(false));
    intervalRef.current = setInterval(fetchDocs, 2000);
    return () => clearInterval(intervalRef.current);
  }, [fetchDocs]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => prev.size === docs.length ? new Set() : new Set(docs.map((d) => d.id)));
  }

  async function handleDelete(ids) {
    await Promise.all(ids.map((id) => flowInspectorService.deleteDocument(workflowId, id)));
    setDocs((prev) => prev.filter((d) => !ids.includes(d.id)));
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
  }

  async function handleSendOut(ids) {
    setSendOutError(null);
    try {
      await flowInspectorService.sendOut(workflowId, ids, node.id, portId);
      setDocs((prev) => prev.filter((d) => !ids.includes(d.id)));
      setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    } catch (err) {
      const errData = err?.response?.data;
      if (errData?.error === 'port_not_connected') {
        setSendOutError('Connect this port to a downstream node before sending out.');
      } else {
        setSendOutError('Send Out failed. Please try again.');
      }
    }
  }

  const selArray = [...selected];

  return (
    <div className="flex flex-col h-full">
      {selArray.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800">
          <span className="text-xs text-indigo-700 dark:text-indigo-300">{selArray.length} selected</span>
          <button
            onClick={() => handleSendOut(selArray)}
            className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
          >
            Send Out
          </button>
          <button
            onClick={() => onRetrigger(selArray)}
            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
          >
            Re-trigger
          </button>
          <button
            onClick={() => handleDelete(selArray)}
            className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded"
          >
            Delete
          </button>
        </div>
      )}

      {sendOutError && (
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
          {sendOutError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && docs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
        )}
        {!loading && docs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            No unrouted documents. Connect this port to route documents forward.
          </p>
        )}
        {docs.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={selected.size === docs.length && docs.length > 0}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-xs text-gray-400">Select all</span>
          </div>
        )}
        {docs.map((doc) => (
          <div key={doc.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-xs">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(doc.id)}
                onChange={() => toggleSelect(doc.id)}
                className="w-3.5 h-3.5 mt-0.5 rounded border-gray-300 text-indigo-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{displayName(doc)}</p>
                <p className="text-gray-400 mt-0.5">Unrouted {timeAgo(doc.updated_at)}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleSendOut([doc.id])}
                  className="px-2 py-1 text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 rounded"
                >
                  Send Out
                </button>
                <button
                  onClick={() => onRetrigger([doc.id])}
                  className="px-2 py-1 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 rounded"
                >
                  Re-trigger
                </button>
                <button
                  onClick={() => handleDelete([doc.id])}
                  className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Node Document Panel ──────────────────────────────────────────────────────

function NodeDocumentPanel({ workflowId, node, onRetrigger }) {
  const tabs = getNodeTabs(node.node_type, node.config);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  // Reset to first tab when node changes
  useEffect(() => {
    setActiveTabId(getNodeTabs(node.node_type, node.config)[0].id);
  }, [node.id, node.node_type]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const activeTabType = activeTab.type;

  const fetchDocs = useCallback(async () => {
    if (activeTabType === 'unrouted') return; // UnroutedPanel handles its own fetch
    try {
      const r = await flowInspectorService.getNodeDocuments(workflowId, node.id, activeTabType);
      setDocs(r.data);
    } catch (_) {}
  }, [workflowId, node.id, activeTabType]);

  useEffect(() => {
    if (activeTabType === 'unrouted') return;
    setDocs([]);
    setLoading(true);
    fetchDocs().finally(() => setLoading(false));
    intervalRef.current = setInterval(fetchDocs, 2000);
    return () => clearInterval(intervalRef.current);
  }, [fetchDocs]);

  async function handleDelete(execId) {
    await flowInspectorService.deleteDocument(workflowId, execId);
    setDocs((prev) => prev.filter((d) => d.id !== execId));
  }

  const EMPTY_MESSAGES = {
    processing: 'No documents currently processing.',
    held: 'No documents held.',
    failed: 'No failed documents.',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition -mb-px whitespace-nowrap ${
              activeTabId === tab.id
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Unrouted tab — delegate to UnroutedPanel */}
      {activeTab.type === 'unrouted' && (
        <UnroutedPanel
          key={activeTab.id}
          workflowId={workflowId}
          node={node}
          portId={activeTab.portId}
          onRetrigger={onRetrigger}
        />
      )}

      {/* Non-unrouted doc list */}
      {activeTab.type !== 'unrouted' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && docs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          )}
          {!loading && docs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">
              {EMPTY_MESSAGES[activeTab.type] || 'No documents.'}
            </p>
          )}
          {docs.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              tabType={activeTab.type}
              onDelete={() => handleDelete(doc.id)}
              onRetrigger={() => onRetrigger([doc.id])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({ doc, tabType, onDelete, onRetrigger }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 dark:text-white truncate">{displayName(doc)}</p>
          {tabType === 'processing' && (
            <p className="text-gray-400 mt-0.5">Processing since {timeAgo(doc.updated_at)}</p>
          )}
          {tabType === 'held' && (
            <p className="text-gray-400 mt-0.5">
              Held {timeAgo(doc.updated_at)}
              {doc.held_reason && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                  {doc.held_reason === 'hold_all' ? 'Hold all' : 'Missing fields'}
                </span>
              )}
            </p>
          )}
          {tabType === 'failed' && (
            <>
              <p className="text-gray-400 mt-0.5">Failed {timeAgo(doc.completed_at)}</p>
              {doc.error && (
                <p
                  className={`text-red-500 mt-1 leading-snug cursor-pointer ${expanded ? '' : 'line-clamp-2'}`}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {doc.error}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {tabType === 'failed' && (
            <button
              onClick={onRetrigger}
              className="px-2 py-1 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 rounded"
            >
              Re-trigger
            </button>
          )}
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 rounded"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Orphaned Panel ───────────────────────────────────────────────────────────

function OrphanedPanel({ workflowId }) {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [retriggerIds, setRetriggerIds] = useState(null);
  const intervalRef = useRef(null);

  const fetchDocs = useCallback(async () => {
    try {
      const r = await flowInspectorService.getOrphaned(workflowId);
      setDocs(r.data);
    } catch (_) {}
  }, [workflowId]);

  useEffect(() => {
    fetchDocs();
    intervalRef.current = setInterval(fetchDocs, 2000);
    return () => clearInterval(intervalRef.current);
  }, [fetchDocs]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => prev.size === docs.length ? new Set() : new Set(docs.map((d) => d.id)));
  }

  async function handleDelete(ids) {
    await Promise.all(ids.map((id) => flowInspectorService.deleteDocument(workflowId, id)));
    setDocs((prev) => prev.filter((d) => !ids.includes(d.id)));
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Orphaned Documents</h3>
        <p className="text-xs text-gray-400 mt-0.5">Documents that were held when their node was deleted.</p>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800">
          <span className="text-xs text-indigo-700 dark:text-indigo-300">{selected.size} selected</span>
          <button
            onClick={() => setRetriggerIds([...selected])}
            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
          >
            Re-trigger
          </button>
          <button
            onClick={() => handleDelete([...selected])}
            className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded"
          >
            Delete
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {docs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">No orphaned documents.</p>
        )}
        {docs.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={selected.size === docs.length && docs.length > 0}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-xs text-gray-400">Select all</span>
          </div>
        )}
        {docs.map((doc) => (
          <div key={doc.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-xs">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(doc.id)}
                onChange={() => toggleSelect(doc.id)}
                className="w-3.5 h-3.5 mt-0.5 rounded border-gray-300 text-indigo-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{displayName(doc)}</p>
                <p className="text-gray-400 mt-0.5">
                  From: <span className="text-gray-600 dark:text-gray-300">{doc.orphaned_node_name}</span>
                  {' · '}{timeAgo(doc.updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setRetriggerIds([doc.id])}
                  className="px-2 py-1 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded"
                >
                  Re-trigger
                </button>
                <button
                  onClick={() => handleDelete([doc.id])}
                  className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {retriggerIds && (
        <RetriggerModal
          workflowId={workflowId}
          execIds={retriggerIds}
          onClose={() => setRetriggerIds(null)}
          onDone={() => { setRetriggerIds(null); fetchDocs(); }}
        />
      )}
    </div>
  );
}

// ─── Main FlowInspector ───────────────────────────────────────────────────────

export default function FlowInspector({ workflowId }) {
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showOrphaned, setShowOrphaned] = useState(false);
  const [retriggerIds, setRetriggerIds] = useState(null);
  const intervalRef = useRef(null);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await flowInspectorService.getSummary(workflowId);
      setNodes(r.data);
    } catch (_) {}
  }, [workflowId]);

  useEffect(() => {
    fetchSummary();
    intervalRef.current = setInterval(fetchSummary, 2000);
    return () => clearInterval(intervalRef.current);
  }, [fetchSummary]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  function handleSelectNode(id) {
    setSelectedNodeId(id);
    setShowOrphaned(false);
  }

  function handleShowOrphaned() {
    setShowOrphaned(true);
    setSelectedNodeId(null);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {nodes.map((node) => {
            const category = NODE_CATEGORIES[node.node_type] || 'Execution';
            const accent = CATEGORY_COLORS[category] || 'bg-gray-400';
            const isActive = selectedNodeId === node.id;
            return (
              <button
                key={node.id}
                onClick={() => handleSelectNode(node.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition border-b border-gray-100 dark:border-gray-700/50 ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${accent}`} />
                <span className={`flex-1 text-xs font-medium truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  {node.name}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {node.processing > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                      {node.processing}
                    </span>
                  )}
                  {node.held > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 font-medium">
                      {node.held}
                    </span>
                  )}
                  {node.unrouted > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 font-medium">
                      {node.unrouted}
                    </span>
                  )}
                  {node.failed > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">
                      {node.failed}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Orphaned section */}
        <button
          onClick={handleShowOrphaned}
          className={`flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-gray-200 dark:border-gray-700 transition ${
            showOrphaned
              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-500 dark:text-gray-400'
          }`}
        >
          <span className="text-xs font-medium">Orphaned Documents</span>
        </button>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!selectedNode && !showOrphaned && (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Select a node to inspect its documents
          </div>
        )}

        {selectedNode && !showOrphaned && (
          <>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedNode.name}</h3>
              <p className="text-xs text-gray-400 capitalize mt-0.5">
                {(NODE_CATEGORIES[selectedNode.node_type] || 'Execution').toLowerCase()} node
              </p>
            </div>
            <NodeDocumentPanel
              workflowId={workflowId}
              node={selectedNode}
              onRetrigger={(ids) => setRetriggerIds(ids)}
            />
          </>
        )}

        {showOrphaned && (
          <OrphanedPanel workflowId={workflowId} />
        )}
      </div>

      {retriggerIds && (
        <RetriggerModal
          workflowId={workflowId}
          execIds={retriggerIds}
          onClose={() => setRetriggerIds(null)}
          onDone={() => setRetriggerIds(null)}
        />
      )}
    </div>
  );
}
