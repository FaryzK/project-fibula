import { Handle, Position } from '@xyflow/react';
import useCanvasStore from '../../stores/useCanvasStore';
import useExtractorStore from '../../stores/useExtractorStore';

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

/** Build the list of input port handles for a node */
function getInputHandles(nodeType, config, extractorMap) {
  if (nodeType === 'RECONCILIATION') {
    const slots = config?.recon_inputs || [];
    if (slots.length > 0) return slots.map((s, i) => ({
      id: s.id,
      label: s.label || s.extractor_name || extractorMap[s.extractor_id] || `Input ${i + 1}`,
    }));
    return [{ id: 'default', label: '' }];
  }
  return [{ id: 'default', label: '' }];
}

/** Build the list of output port handles for a node */
function getOutputHandles(nodeType, config) {
  switch (nodeType) {
    case 'RECONCILIATION': {
      const slots = config?.recon_inputs || [];
      // Labels are shown via the input section; output handles carry no label to avoid duplication
      if (slots.length > 0) return slots.map((s) => ({ id: s.id, label: '' }));
      return [{ id: 'default', label: '' }];
    }
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
  if (statuses.includes('unrouted')) return 'unrouted';
  if (statuses.every((s) => s === 'completed')) return 'completed';
  return null;
}

const RUN_STATUS_STYLES = {
  processing: 'bg-amber-100 text-amber-700 border-amber-300',
  completed:  'bg-green-100 text-green-700 border-green-300',
  failed:     'bg-red-100 text-red-700 border-red-300',
  held:       'bg-orange-100 text-orange-700 border-orange-300',
  unrouted:   'bg-gray-100 text-gray-600 border-gray-300',
};

const RUN_STATUS_LABELS = {
  processing: '⟳',
  completed:  '✓',
  failed:     '✕',
  held:       '⏸',
  unrouted:   '⇥',
};

/**
 * Pixel offset of the center of port row i, measured from the top of the node.
 *
 * Breakdown:
 *   4px  accent bar (h-1)
 *   8px  pt-2 of body wrapper
 *  16px  text-xs category badge (line-height: 1rem in Tailwind)
 *   2px  mt-0.5
 *  20px  text-sm node name (line-height: 1.25rem)
 *   8px  mt-2 before port section
 *   6px  pt-1.5 of port section
 *  12px  half of h-6 row (24px) → centre of row 0
 * ──────
 *  76px  FIRST_PORT_CENTER
 *
 * Each subsequent row: 24px row height + 4px space-y-1 gap = 28px step.
 */
const FIRST_PORT_CENTER_PX = 76;
const PORT_STEP_PX = 28; // h-6 (24) + space-y-1 gap (4)

function portTop(i) {
  return `${FIRST_PORT_CENTER_PX + i * PORT_STEP_PX}px`;
}

function FibulaNode({ id, data, selected }) {
  const category = NODE_CATEGORIES[data.nodeType] || 'Execution';
  const accent = CATEGORY_COLORS[category];
  const config = data.config || {};
  const extractors = useExtractorStore((s) => s.extractors);
  const extractorMap = Object.fromEntries(extractors.map((e) => [e.id, e.name]));
  const outputHandles = getOutputHandles(data.nodeType, config);
  const inputHandles = getInputHandles(data.nodeType, config, extractorMap);
  const hasMultipleOutputs = outputHandles.length > 1;
  const hasMultipleInputs = inputHandles.length > 1;

  const nodeStatuses = useCanvasStore((s) => s.nodeStatuses);
  const statusList = nodeStatuses[id] || [];
  const runStatus = deriveNodeRunStatus(statusList);
  const totalDocs = statusList.reduce((sum, s) => sum + (s.count || 0), 0);

  // Build a map of which output ports have had docs exit through them (for per-handle coloring)
  const portStatusMap = {};
  for (const s of statusList) {
    if (s.output_port && s.status === 'completed') portStatusMap[s.output_port] = true;
  }
  const hasRunData = statusList.length > 0;

  // Reconciliation nodes hold docs as normal operating behavior — show ✓ instead of ⏸
  const isReconHeld = data.nodeType === 'RECONCILIATION' && runStatus === 'held';
  const statusLabel = isReconHeld ? RUN_STATUS_LABELS.completed : RUN_STATUS_LABELS[runStatus];
  const statusStyle = isReconHeld ? RUN_STATUS_STYLES.completed : RUN_STATUS_STYLES[runStatus];

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
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${statusStyle}`}>
              {statusLabel}
              {totalDocs > 0 && <span className="font-normal opacity-80">{totalDocs}</span>}
            </span>
          )}
        </div>

        {/* Node name */}
        <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 truncate max-w-[140px]">
          {data.label}
        </p>

        {/* Multi-input port labels (left side) — one h-6 row per port */}
        {hasMultipleInputs && (
          <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-1.5 space-y-1">
            {inputHandles.map((h) => (
              <div key={h.id} className="flex items-center h-6 pl-1">
                <span className="text-xs text-gray-400 dark:text-gray-500 leading-none">{h.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Multi-output port labels (right side) — one h-6 row per port */}
        {/* RECONCILIATION skipped: input labels already cover both sides (same slots) */}
        {hasMultipleOutputs && data.nodeType !== 'RECONCILIATION' && (
          <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-1.5 space-y-1">
            {outputHandles.map((h) => (
              <div key={h.id} className="flex items-center justify-end h-6 pr-3">
                <span className="text-xs text-gray-400 dark:text-gray-500 leading-none">{h.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input handles (left) */}
      {inputHandles.map((h, i) => (
        <Handle
          key={h.id}
          id={h.id}
          type="target"
          position={Position.Left}
          style={hasMultipleInputs ? { top: portTop(i) } : undefined}
          className="!w-3 !h-3 !bg-gray-400 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800"
        />
      ))}

      {/* Output handles (right) — green if docs have exited through that port, grey if unused during a run */}
      {outputHandles.map((h, i) => {
        const handleColor = !hasRunData
          ? '!bg-indigo-500'
          : portStatusMap[h.id] ? '!bg-green-500' : '!bg-gray-400';
        return (
          <Handle
            key={h.id}
            id={h.id}
            type="source"
            position={Position.Right}
            style={hasMultipleOutputs ? { top: portTop(i) } : undefined}
            className={`!w-3 !h-3 !border-2 !border-white dark:!border-gray-800 ${handleColor}`}
          />
        );
      })}
    </div>
  );
}

export default FibulaNode;
