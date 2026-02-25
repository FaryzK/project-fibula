import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import splittingService from '../../services/splittingService';
import categorisationService from '../../services/categorisationService';
import * as workflowService from '../../services/workflowService';
import useCanvasStore from '../../stores/useCanvasStore';

function NodePanel({ node, onClose }) {
  const navigate = useNavigate();
  const { workflowId, nodes, deleteNode } = useCanvasStore();
  const [splittingOptions, setSplittingOptions] = useState([]);
  const [categorisationOptions, setCategorisationOptions] = useState([]);
  const [selectedSplitting, setSelectedSplitting] = useState(node.data.config?.splitting_instruction_id || '');
  const [selectedCategorisation, setSelectedCategorisation] = useState(node.data.config?.categorisation_prompt_id || '');
  const [saving, setSaving] = useState(false);

  const nodeType = node.data.nodeType;

  useEffect(() => {
    if (nodeType === 'SPLITTING') {
      splittingService.getAll().then(({ data }) => setSplittingOptions(data));
    }
    if (nodeType === 'CATEGORISATION') {
      categorisationService.getAll().then(({ data }) => setCategorisationOptions(data));
    }
  }, [nodeType]);

  async function handleSave() {
    setSaving(true);
    let config = {};
    if (nodeType === 'SPLITTING') config = { splitting_instruction_id: selectedSplitting || null };
    if (nodeType === 'CATEGORISATION') config = { categorisation_prompt_id: selectedCategorisation || null };

    await workflowService.updateNode(workflowId, node.id, { config });
    // Update local node data in store
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

        {nodeType === 'SPLITTING' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Splitting Instruction
            </label>
            <select
              value={selectedSplitting}
              onChange={(e) => setSelectedSplitting(e.target.value)}
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
              value={selectedCategorisation}
              onChange={(e) => setSelectedCategorisation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select a prompt —</option>
              {categorisationOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {categorisationOptions.length === 0 && (
              <button
                onClick={() => navigate('/app/categorisation/new')}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Create a categorisation prompt →
              </button>
            )}
            {selectedCategorisation && (
              <p className="mt-2 text-xs text-gray-400">
                Output ports will match the label names (e.g. INVOICE, PO). Connect edges from those ports to route documents.
              </p>
            )}
          </div>
        )}

        {!['SPLITTING', 'CATEGORISATION'].includes(nodeType) && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No configuration options for this node type yet.
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
        {['SPLITTING', 'CATEGORISATION'].includes(nodeType) && (
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
