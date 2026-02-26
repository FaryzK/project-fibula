import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import executionService from '../../services/executionService';
import splittingService from '../../services/splittingService';
import categorisationService from '../../services/categorisationService';
import documentFolderService from '../../services/documentFolderService';
import extractorService from '../../services/extractorService';
import dataMapperService from '../../services/dataMapperService';
import reconciliationService from '../../services/reconciliationService';
import * as workflowService from '../../services/workflowService';
import useCanvasStore from '../../stores/useCanvasStore';

// ─── Condition row helpers ───────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'string',   label: 'String' },
  { value: 'number',   label: 'Number' },
  { value: 'datetime', label: 'Date/Time' },
  { value: 'boolean',  label: 'Boolean' },
];

const OPERATORS_BY_TYPE = {
  string:   ['equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists'],
  number:   ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'exists', 'not_exists'],
  datetime: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'exists', 'not_exists'],
  boolean:  ['is_true', 'is_false', 'exists', 'not_exists'],
};

const OPERATOR_LABELS = {
  equals: 'equals', not_equals: 'not equals',
  contains: 'contains', not_contains: 'not contains',
  greater_than: '>', less_than: '<',
  greater_than_or_equal: '≥', less_than_or_equal: '≤',
  is_true: 'is true', is_false: 'is false',
  exists: 'exists', not_exists: 'not exists',
};

const NO_VALUE_OPERATORS = new Set(['exists', 'not_exists', 'is_true', 'is_false']);

function emptyCondition() {
  return { field: '', type: 'string', operator: 'equals', value: '' };
}

function ConditionRow({ condition, onChange, onRemove, showRemove }) {
  const operators = OPERATORS_BY_TYPE[condition.type] || OPERATORS_BY_TYPE.string;
  const needsValue = !NO_VALUE_OPERATORS.has(condition.operator);

  function update(key, val) {
    const updated = { ...condition, [key]: val };
    if (key === 'type') updated.operator = OPERATORS_BY_TYPE[val][0];
    onChange(updated);
  }

  return (
    <div className="space-y-1.5 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div className="flex gap-1.5">
        <input
          value={condition.field}
          onChange={(e) => update('field', e.target.value)}
          placeholder="$document.field or {{ expr }}"
          className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
        />
        <select
          value={condition.type}
          onChange={(e) => update('type', e.target.value)}
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
        >
          {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {showRemove && (
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-base leading-none px-1">×</button>
        )}
      </div>
      <div className="flex gap-1.5">
        <select
          value={condition.operator}
          onChange={(e) => update('operator', e.target.value)}
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
        >
          {operators.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
        </select>
        {needsValue && (
          <input
            value={condition.value}
            onChange={(e) => update('value', e.target.value)}
            placeholder="value or $document.field"
            className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
      </div>
    </div>
  );
}

// ─── Node-type config sections ───────────────────────────────────────────────

function IFConfig({ config, onChange }) {
  const conditions = config.conditions || [emptyCondition()];
  const logic = config.logic || 'AND';

  function updateCondition(i, cond) {
    const updated = [...conditions];
    updated[i] = cond;
    onChange({ ...config, conditions: updated });
  }

  function addCondition() {
    onChange({ ...config, conditions: [...conditions, emptyCondition()] });
  }

  function removeCondition(i) {
    onChange({ ...config, conditions: conditions.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Logic</span>
        {['AND', 'OR'].map((l) => (
          <label key={l} className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              checked={logic === l}
              onChange={() => onChange({ ...config, logic: l })}
              className="accent-indigo-600"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">{l}</span>
          </label>
        ))}
      </div>

      <div className="space-y-2">
        {conditions.map((cond, i) => (
          <ConditionRow
            key={i}
            condition={cond}
            onChange={(c) => updateCondition(i, c)}
            onRemove={() => removeCondition(i)}
            showRemove={conditions.length > 1}
          />
        ))}
      </div>

      <button
        onClick={addCondition}
        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        + Add condition
      </button>

      <p className="text-xs text-gray-400">
        Output: <span className="font-mono text-green-600">true</span> or <span className="font-mono text-red-500">false</span>
      </p>
    </div>
  );
}

function SwitchConfig({ config, onChange }) {
  const cases = config.cases || [];

  function updateCase(i, updated) {
    const newCases = [...cases];
    newCases[i] = updated;
    onChange({ ...config, cases: newCases });
  }

  function addCase() {
    if (cases.length >= 10) return;
    const newId = `case_${cases.length + 1}`;
    onChange({ ...config, cases: [...cases, { id: newId, label: `Case ${cases.length + 1}`, ...emptyCondition() }] });
  }

  function removeCase(i) {
    onChange({ ...config, cases: cases.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      {cases.length === 0 && (
        <p className="text-xs text-gray-400">No cases yet. Add one below.</p>
      )}
      {cases.map((c, i) => {
        const operators = OPERATORS_BY_TYPE[c.type] || OPERATORS_BY_TYPE.string;
        const needsValue = !NO_VALUE_OPERATORS.has(c.operator);
        return (
          <div key={c.id} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-1.5">
            <div className="flex gap-1.5 items-center">
              <input
                value={c.label}
                onChange={(e) => updateCase(i, { ...c, label: e.target.value })}
                placeholder="Case label"
                className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              />
              <span className="text-xs text-gray-400 font-mono">{c.id}</span>
              <button onClick={() => removeCase(i)} className="text-red-400 hover:text-red-600 text-base leading-none px-1">×</button>
            </div>
            <div className="flex gap-1.5">
              <input
                value={c.field}
                onChange={(e) => updateCase(i, { ...c, field: e.target.value })}
                placeholder="$document.field"
                className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none font-mono"
              />
              <select
                value={c.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  updateCase(i, { ...c, type: newType, operator: OPERATORS_BY_TYPE[newType][0] });
                }}
                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
              >
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5">
              <select
                value={c.operator}
                onChange={(e) => updateCase(i, { ...c, operator: e.target.value })}
                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
              >
                {operators.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
              </select>
              {needsValue && (
                <input
                  value={c.value}
                  onChange={(e) => updateCase(i, { ...c, value: e.target.value })}
                  placeholder="value"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                />
              )}
            </div>
          </div>
        );
      })}

      {cases.length < 10 && (
        <button onClick={addCase} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
          + Add case ({cases.length}/10)
        </button>
      )}

      <p className="text-xs text-gray-400">
        Always has a <span className="font-mono">fallback</span> port if no case matches.
      </p>
    </div>
  );
}

function SetValueConfig({ config, onChange }) {
  const assignments = config.assignments || [];

  function updateAssignment(i, updated) {
    const newList = [...assignments];
    newList[i] = updated;
    onChange({ ...config, assignments: newList });
  }

  function addAssignment() {
    onChange({ ...config, assignments: [...assignments, { field: '', value: '' }] });
  }

  function removeAssignment(i) {
    onChange({ ...config, assignments: assignments.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      {assignments.length === 0 && (
        <p className="text-xs text-gray-400">No assignments yet.</p>
      )}
      {assignments.map((a, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <input
            value={a.field}
            onChange={(e) => updateAssignment(i, { ...a, field: e.target.value })}
            placeholder="fieldName"
            className="w-28 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none font-mono"
          />
          <span className="text-xs text-gray-400">=</span>
          <input
            value={a.value}
            onChange={(e) => updateAssignment(i, { ...a, value: e.target.value })}
            placeholder="value or $document.field"
            className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none font-mono"
          />
          <button onClick={() => removeAssignment(i)} className="text-red-400 hover:text-red-600 text-base leading-none px-1">×</button>
        </div>
      ))}
      <button onClick={addAssignment} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
        + Add assignment
      </button>
      <p className="text-xs text-gray-400">
        Use <span className="font-mono">$document.field</span> or <span className="font-mono">{'{{ expr }}'}</span> for dynamic values.
      </p>
    </div>
  );
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function HTTPConfig({ config, onChange }) {
  const headers = config.headers || {};
  const headerEntries = Object.entries(headers);
  const bodyText = config._bodyText !== undefined
    ? config._bodyText
    : (config.body ? JSON.stringify(config.body, null, 2) : '');

  function updateHeaders(entries) {
    const obj = {};
    for (const [k, v] of entries) { if (k) obj[k] = v; }
    onChange({ ...config, headers: obj });
  }

  function setHeader(i, key, val) {
    const entries = [...headerEntries];
    entries[i] = [key, val];
    updateHeaders(entries);
  }

  function addHeader() {
    updateHeaders([...headerEntries, ['', '']]);
  }

  function removeHeader(i) {
    updateHeaders(headerEntries.filter((_, idx) => idx !== i));
  }

  function handleBodyChange(text) {
    let parsed = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch (_) { /* invalid JSON while typing */ }
    onChange({ ...config, body: parsed, _bodyText: text });
  }

  return (
    <div className="space-y-4">
      {/* URL */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL</label>
        <input
          value={config.url || ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://api.example.com/endpoint"
          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
        />
      </div>

      {/* Method */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Method</label>
        <select
          value={config.method || 'POST'}
          onChange={(e) => onChange({ ...config, method: e.target.value })}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
        >
          {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Headers */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Headers</label>
        <div className="space-y-1.5">
          {headerEntries.map(([k, v], i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                value={k}
                onChange={(e) => setHeader(i, e.target.value, v)}
                placeholder="Key"
                className="w-24 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none font-mono"
              />
              <input
                value={v}
                onChange={(e) => setHeader(i, k, e.target.value)}
                placeholder="Value or $document.field"
                className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none font-mono"
              />
              <button onClick={() => removeHeader(i)} className="text-red-400 hover:text-red-600 text-base leading-none px-1">×</button>
            </div>
          ))}
          <button onClick={addHeader} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            + Add header
          </button>
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Body <span className="font-normal text-gray-400">(JSON)</span>
        </label>
        <textarea
          value={bodyText}
          onChange={(e) => handleBodyChange(e.target.value)}
          rows={5}
          placeholder={'{\n  "invoiceNumber": "{{ $document.invoiceNumber }}"\n}'}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono resize-y"
        />
        <p className="text-xs text-gray-400 mt-1">
          Use <span className="font-mono">$document.field</span> or <span className="font-mono">{'{{ expr }}'}</span> in values.
        </p>
      </div>

      <p className="text-xs text-gray-400">
        On non-2xx or network error the document is marked <span className="font-mono text-red-500">failed</span>.
        Response is appended to metadata as <span className="font-mono">_http_response</span>.
      </p>
    </div>
  );
}

function WebhookConfig({ config, onChange, nodeId }) {
  const webhookUrl = nodeId
    ? `${window.location.origin.replace(':5173', ':3000')}/api/webhooks/${nodeId}/trigger`
    : '(save the node first)';

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl);
  }

  return (
    <div className="space-y-4">
      {/* Generated URL */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Webhook URL
        </label>
        <div className="flex gap-1.5">
          <input
            readOnly
            value={webhookUrl}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 outline-none font-mono"
          />
          <button
            onClick={copyUrl}
            className="px-2 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded border border-indigo-200 dark:border-indigo-700 transition"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          External systems POST to this URL to trigger the workflow. No authentication required.
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Description <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          value={config.description || ''}
          onChange={(e) => onChange({ ...config, description: e.target.value })}
          placeholder="e.g. Inbound invoice from ERP"
          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <p className="text-xs text-gray-400">
        JSON payload fields become document metadata. No input handle — this is a trigger node.
      </p>
    </div>
  );
}

// ─── Last-run IO block ───────────────────────────────────────────────────────

function MetaBlock({ label, data }) {
  let parsed = data;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch (_) { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const entries = Object.entries(parsed).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <div className="bg-gray-50 dark:bg-gray-700/40 rounded p-2 space-y-0.5 max-h-40 overflow-y-auto">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="font-mono text-gray-500 dark:text-gray-400 flex-shrink-0">{k}:</span>
            <span className="font-mono text-gray-900 dark:text-white break-all">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main NodePanel ──────────────────────────────────────────────────────────

function NodePanel({ node, onClose }) {
  const navigate = useNavigate();
  const { workflowId, deleteNode, renameNode, activeRunId } = useCanvasStore();
  const nodeType = node.data.nodeType;

  const [splittingOptions, setSplittingOptions] = useState([]);
  const [categorisationOptions, setCategorisationOptions] = useState([]);
  const [folderOptions, setFolderOptions] = useState([]);
  const [extractorOptions, setExtractorOptions] = useState([]);
  const [dataMapRuleOptions, setDataMapRuleOptions] = useState([]);
  const [reconciliationOptions, setReconciliationOptions] = useState([]);
  const [config, setConfig] = useState(node.data.config || {});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [nodeName, setNodeName] = useState(node.data.label);
  const [renamingNode, setRenamingNode] = useState(false);
  const [nodeLog, setNodeLog] = useState(null);

  useEffect(() => {
    if (nodeType === 'SPLITTING') splittingService.getAll().then(({ data }) => setSplittingOptions(data));
    if (nodeType === 'CATEGORISATION') categorisationService.getAll().then(({ data }) => setCategorisationOptions(data));
    if (nodeType === 'DOCUMENT_FOLDER') documentFolderService.list().then((data) => setFolderOptions(data));
    if (nodeType === 'EXTRACTOR') extractorService.list().then((data) => setExtractorOptions(data));
    if (nodeType === 'RECONCILIATION') extractorService.list().then((data) => setExtractorOptions(data));
    if (nodeType === 'DATA_MAPPER') dataMapperService.listRules().then((data) => setDataMapRuleOptions(data));
  }, [nodeType]);

  useEffect(() => {
    if (!activeRunId) { setNodeLog(null); return; }
    executionService.getNodeLog(activeRunId, node.id)
      .then(({ data }) => setNodeLog(data))
      .catch(() => setNodeLog(null));
  }, [activeRunId, node.id]);

  async function saveConfig(newConfig) {
    setSaving(true);
    setSaveError(null);
    try {
      await workflowService.updateNode(workflowId, node.id, { config: newConfig });
      useCanvasStore.setState((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === node.id ? { ...n, data: { ...n.data, config: newConfig } } : n
        ),
      }));
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function commitRename() {
    setRenamingNode(false);
    const trimmed = nodeName.trim();
    if (!trimmed || trimmed === node.data.label) return;
    try {
      await renameNode(node.id, trimmed);
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Failed to rename');
    }
  }

  async function handleSave() {
    await saveConfig(config);
    onClose();
  }

  async function handleDelete() {
    if (window.confirm(`Delete node "${node.data.label}"?`)) {
      await deleteNode(node.id);
      onClose();
    }
  }

  const hasConfig = ['SPLITTING', 'CATEGORISATION', 'IF', 'SWITCH', 'SET_VALUE',
    'DOCUMENT_FOLDER', 'EXTRACTOR', 'DATA_MAPPER', 'RECONCILIATION',
    'HTTP', 'WEBHOOK'].includes(nodeType);

  // These node types auto-save on dropdown change — no explicit Save button needed
  const needsSaveButton = ['IF', 'SWITCH', 'SET_VALUE', 'HTTP', 'WEBHOOK'].includes(nodeType);

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1 min-w-0 mr-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">{nodeType}</p>
          {renamingNode ? (
            <input
              autoFocus
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNodeName(node.data.label); setRenamingNode(false); } }}
              className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-indigo-500 outline-none w-full"
            />
          ) : (
            <button
              onClick={() => setRenamingNode(true)}
              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition truncate block w-full text-left"
              title="Click to rename"
            >
              {nodeName}
            </button>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none flex-shrink-0">×</button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {nodeType === 'IF' && (
          <IFConfig config={config} onChange={setConfig} />
        )}

        {nodeType === 'SWITCH' && (
          <SwitchConfig config={config} onChange={setConfig} />
        )}

        {nodeType === 'SET_VALUE' && (
          <SetValueConfig config={config} onChange={setConfig} />
        )}

        {nodeType === 'SPLITTING' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Splitting Instruction
            </label>
            <select
              value={config.splitting_instruction_id || ''}
              onChange={(e) => {
                const newConfig = { ...config, splitting_instruction_id: e.target.value || null };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select an instruction —</option>
              {splittingOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {splittingOptions.length === 0 && (
              <button
                onClick={() => navigate('/app/splitting/new')}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Create a splitting instruction →
              </button>
            )}
            {config.splitting_instruction_id && (
              <button
                onClick={() => navigate(`/app/splitting/${config.splitting_instruction_id}`)}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline block"
              >
                Edit instruction →
              </button>
            )}
          </div>
        )}

        {nodeType === 'CATEGORISATION' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Categorisation Prompt
            </label>
            <select
              value={config.categorisation_prompt_id || ''}
              onChange={(e) => {
                const selected = categorisationOptions.find((c) => c.id === e.target.value);
                const newConfig = {
                  ...config,
                  categorisation_prompt_id: e.target.value || null,
                  categorisation_labels: selected ? selected.labels.map((l) => l.label) : [],
                };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select a prompt —</option>
              {categorisationOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {config.categorisation_labels?.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Output ports: {config.categorisation_labels.map((l) => (
                  <span key={l} className="font-mono text-indigo-600 dark:text-indigo-400 mr-1">{l}</span>
                ))}
              </p>
            )}
            {categorisationOptions.length === 0 && (
              <button
                onClick={() => navigate('/app/categorisation/new')}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Create a categorisation prompt →
              </button>
            )}
            {config.categorisation_prompt_id && (
              <button
                onClick={() => navigate(`/app/categorisation/${config.categorisation_prompt_id}`)}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline block"
              >
                Edit prompt →
              </button>
            )}
          </div>
        )}

        {nodeType === 'DOCUMENT_FOLDER' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Document Folder
            </label>
            <select
              value={config.folder_instance_id || ''}
              onChange={(e) => {
                const newConfig = { ...config, folder_instance_id: e.target.value || null };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select a folder —</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {folderOptions.length === 0 && (
              <button
                onClick={() => navigate('/app/document-folders/new')}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Create a document folder →
              </button>
            )}
            {config.folder_instance_id && (
              <button
                onClick={() => navigate(`/app/document-folders/${config.folder_instance_id}`)}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline block"
              >
                Open folder →
              </button>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Documents will be held in this folder until manually sent out.
            </p>
          </div>
        )}

        {nodeType === 'EXTRACTOR' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Extractor
            </label>
            <select
              value={config.extractor_id || ''}
              onChange={(e) => {
                const newConfig = { ...config, extractor_id: e.target.value || null };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select an extractor —</option>
              {extractorOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            {extractorOptions.length === 0 && (
              <button
                onClick={() => navigate('/app/extractors/new')}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Create an extractor →
              </button>
            )}
            {config.extractor_id && (
              <button
                onClick={() => navigate(`/app/extractors/${config.extractor_id}`)}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline block"
              >
                Edit extractor schema →
              </button>
            )}
          </div>
        )}

        {nodeType === 'DATA_MAPPER' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Data Map Rule
            </label>
            <select
              value={config.data_map_rule_id || ''}
              onChange={(e) => {
                const newConfig = { ...config, data_map_rule_id: e.target.value || null };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select a rule —</option>
              {dataMapRuleOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {dataMapRuleOptions.length === 0 && (
              <button
                onClick={() => navigate('/app/data-map-rules/new')}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Create a data map rule →
              </button>
            )}
            {config.data_map_rule_id && (
              <button
                onClick={() => navigate(`/app/data-map-rules/${config.data_map_rule_id}`)}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline block"
              >
                Edit rule →
              </button>
            )}
          </div>
        )}

        {nodeType === 'RECONCILIATION' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Extractor Inputs</p>
              <button
                onClick={() => {
                  const slots = config.recon_inputs || [];
                  const newSlot = { id: `slot_${Date.now()}`, extractor_id: '', label: '' };
                  const newConfig = { ...config, recon_inputs: [...slots, newSlot] };
                  setConfig(newConfig);
                  saveConfig(newConfig);
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                + Add input
              </button>
            </div>
            {(config.recon_inputs || []).length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Add extractor inputs to define the document types this node accepts.
              </p>
            )}
            {(config.recon_inputs || []).map((slot, idx) => (
              <div key={slot.id} className="flex items-center gap-2">
                <select
                  value={slot.extractor_id}
                  onChange={(e) => {
                    const selected = extractorOptions.find((ex) => ex.id === e.target.value);
                    const updated = (config.recon_inputs || []).map((s) =>
                      s.id === slot.id ? { ...s, extractor_id: e.target.value, label: selected?.name || '', extractor_name: selected?.name || '' } : s
                    );
                    const newConfig = { ...config, recon_inputs: updated };
                    setConfig(newConfig);
                    saveConfig(newConfig);
                  }}
                  className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">— Extractor —</option>
                  {extractorOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const updated = (config.recon_inputs || []).filter((s) => s.id !== slot.id);
                    const newConfig = { ...config, recon_inputs: updated };
                    setConfig(newConfig);
                    saveConfig(newConfig);
                  }}
                  className="text-gray-400 hover:text-red-500 transition text-sm font-medium px-1"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {nodeType === 'HTTP' && (
          <HTTPConfig config={config} onChange={setConfig} />
        )}

        {nodeType === 'WEBHOOK' && (
          <WebhookConfig config={config} onChange={setConfig} nodeId={node.id} />
        )}

        {!hasConfig && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No configuration for this node type yet.
          </p>
        )}

        {/* Last run IO */}
        {nodeLog && (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Last run · <span className={
                nodeLog.status === 'completed' ? 'text-green-600' :
                nodeLog.status === 'failed'    ? 'text-red-500' :
                nodeLog.status === 'held'      ? 'text-orange-500' : 'text-amber-500'
              }>{nodeLog.status}</span>
            </p>
            {nodeLog.error && (
              <p className="text-xs text-red-500 font-mono break-all">{nodeLog.error}</p>
            )}
            <MetaBlock label="Input" data={nodeLog.input_metadata} />
            <MetaBlock label="Output" data={nodeLog.output_metadata} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {saveError && (
          <p className="text-xs text-red-500 dark:text-red-400">{saveError}</p>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600 transition"
          >
            Delete node
          </button>
          {needsSaveButton && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {!needsSaveButton && saving && (
            <span className="text-xs text-gray-400">Saving…</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default NodePanel;
