import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import splittingService from '../../services/splittingService';
import categorisationService from '../../services/categorisationService';
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

// ─── Main NodePanel ──────────────────────────────────────────────────────────

function NodePanel({ node, onClose }) {
  const navigate = useNavigate();
  const { workflowId, deleteNode } = useCanvasStore();
  const nodeType = node.data.nodeType;

  const [splittingOptions, setSplittingOptions] = useState([]);
  const [categorisationOptions, setCategorisationOptions] = useState([]);
  const [config, setConfig] = useState(node.data.config || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (nodeType === 'SPLITTING') splittingService.getAll().then(({ data }) => setSplittingOptions(data));
    if (nodeType === 'CATEGORISATION') categorisationService.getAll().then(({ data }) => setCategorisationOptions(data));
  }, [nodeType]);

  async function handleSave() {
    setSaving(true);
    await workflowService.updateNode(workflowId, node.id, { config });
    useCanvasStore.setState((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, config } } : n
      ),
    }));
    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    if (window.confirm(`Delete node "${node.data.label}"?`)) {
      await deleteNode(node.id);
      onClose();
    }
  }

  const hasConfig = ['SPLITTING', 'CATEGORISATION', 'IF', 'SWITCH', 'SET_VALUE'].includes(nodeType);

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{nodeType}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{node.data.label}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none">×</button>
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
              onChange={(e) => setConfig({ ...config, splitting_instruction_id: e.target.value || null })}
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
                setConfig({
                  ...config,
                  categorisation_prompt_id: e.target.value || null,
                  categorisation_labels: selected ? selected.labels.map((l) => l.label) : [],
                });
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
          </div>
        )}

        {!hasConfig && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No configuration for this node type yet.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <button
          onClick={handleDelete}
          className="text-xs text-red-400 hover:text-red-600 transition"
        >
          Delete node
        </button>
        {hasConfig && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

export default NodePanel;
