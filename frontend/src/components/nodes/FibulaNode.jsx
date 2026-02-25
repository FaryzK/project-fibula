import { Handle, Position } from '@xyflow/react';
import useCanvasStore from '../../stores/useCanvasStore';

// Category colour accents
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

// Derive a single display status from the node's status array for the run
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

  const nodeStatuses = useCanvasStore((s) => s.nodeStatuses);
  const runStatus = deriveNodeRunStatus(nodeStatuses[id]);

  return (
    <div
      className={`w-40 bg-white dark:bg-gray-800 rounded-lg border-2 shadow-sm transition ${
        selected
          ? 'border-indigo-500 shadow-indigo-200 dark:shadow-indigo-900'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* Colour accent bar */}
      <div className={`h-1 rounded-t-lg ${accent}`} />

      <div className="px-3 py-2">
        {/* Category badge + run status badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">{category}</span>
          {runStatus && (
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded border ${RUN_STATUS_STYLES[runStatus]}`}
            >
              {RUN_STATUS_LABELS[runStatus]}
            </span>
          )}
        </div>
        {/* Node name */}
        <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 truncate">
          {data.label}
        </p>
      </div>

      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-400 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800"
      />

      {/* Output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800"
      />
    </div>
  );
}

export default FibulaNode;
