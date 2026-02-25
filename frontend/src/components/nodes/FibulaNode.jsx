import { Handle, Position } from '@xyflow/react';
import useCanvasStore from '../../stores/useCanvasStore';

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

/** Build the list of output port handles for a node */
function getOutputHandles(nodeType, config) {
  switch (nodeType) {
    case 'IF':
      return [
        { id: 'true',  label: 'True' },
        { id: 'false', label: 'False' },
      ];
    case 'SWITCH': {
      const cases = (config?.cases || []).map((c) => ({ id: c.id, label: c.label || c.id }));
      return [...cases, { id: 'fallback', label: 'Fallback' }];
    }
    case 'CATEGORISATION': {
      const labels = config?.categorisation_labels || [];
      if (labels.length === 0) return [{ id: 'default', label: '' }];
      return labels.map((l) => ({ id: l, label: l }));
    }
    default:
      return [{ id: 'default', label: '' }];
  }
}

function deriveNodeRunStatus(statusList) {
  if (!statusList || statusList.length === 0) return null;
  const statuses = statusList.map((s) => s.status);
  if (statuses.includes('processing')) return 'processing';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('held')) return 'held';
  if (statuses.every((s) => s === 'completed')) return 'completed';
  return null;
}

const RUN_STATUS_STYLES = {
  processing: 'bg-amber-100 text-amber-700 border-amber-300',
  completed:  'bg-green-100 text-green-700 border-green-300',
  failed:     'bg-red-100 text-red-700 border-red-300',
  held:       'bg-orange-100 text-orange-700 border-orange-300',
};

const RUN_STATUS_LABELS = {
  processing: '⟳',
  completed:  '✓',
  failed:     '✕',
  held:       '⏸',
};

function FibulaNode({ id, data, selected }) {
  const category = NODE_CATEGORIES[data.nodeType] || 'Execution';
  const accent = CATEGORY_COLORS[category];
  const config = data.config || {};
  const outputHandles = getOutputHandles(data.nodeType, config);
  const hasMultipleOutputs = outputHandles.length > 1;

  const nodeStatuses = useCanvasStore((s) => s.nodeStatuses);
  const runStatus = deriveNodeRunStatus(nodeStatuses[id]);

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border-2 shadow-sm transition ${
        selected
          ? 'border-indigo-500 shadow-indigo-200 dark:shadow-indigo-900'
          : 'border-gray-200 dark:border-gray-700'
      }`}
      style={{ minWidth: 160 }}
    >
      {/* Colour accent bar */}
      <div className={`h-1 rounded-t-lg ${accent}`} />

      <div className="px-3 py-2">
        {/* Category badge + run status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">{category}</span>
          {runStatus && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${RUN_STATUS_STYLES[runStatus]}`}>
              {RUN_STATUS_LABELS[runStatus]}
            </span>
          )}
        </div>

        {/* Node name */}
        <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 truncate max-w-[140px]">
          {data.label}
        </p>

        {/* Output port labels for multi-handle nodes */}
        {hasMultipleOutputs && (
          <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-1.5 space-y-1">
            {outputHandles.map((h) => (
              <div key={h.id} className="flex items-center justify-end gap-1.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">{h.label}</span>
                <div className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-400 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800"
      />

      {/* Output handles (right) — one per port, evenly distributed vertically */}
      {outputHandles.map((h, i) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Right}
          style={{ top: `${((i + 1) / (outputHandles.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800"
        />
      ))}
    </div>
  );
}

export default FibulaNode;
