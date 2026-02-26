import { useState } from 'react';
import NODE_CATALOGUE from '../../utils/nodeCatalogue';

function NodePalette({ onAddNode, onClose, connectingFrom }) {
  const [search, setSearch] = useState('');

  const filtered = NODE_CATALOGUE.filter((n) =>
    n.label.toLowerCase().includes(search.toLowerCase()) ||
    n.category.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = filtered.reduce((acc, node) => {
    if (!acc[node.category]) acc[node.category] = [];
    acc[node.category].push(node);
    return acc;
  }, {});

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add node</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      {connectingFrom && (
        <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300">
          Connecting from <span className="font-semibold">{connectingFrom}</span> — pick a node to attach
        </div>
      )}

      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <input
          autoFocus
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(grouped).map(([category, nodes]) => (
          <div key={category} className="mb-2">
            <p className="px-4 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              {category}
            </p>
            {nodes.map((node) => (
              <div
                key={node.nodeType}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('application/nodetype', node.nodeType);
                  e.dataTransfer.setData('application/nodelabel', node.label);
                }}
                onClick={() => onAddNode(node.nodeType, node.label)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-gray-700 transition cursor-grab active:cursor-grabbing select-none"
              >
                {node.label}
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">No nodes match your search.</p>
        )}
      </div>
    </div>
  );
}

export default NodePalette;
