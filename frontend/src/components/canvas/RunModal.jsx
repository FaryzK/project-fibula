import { useRef, useState } from 'react';

/**
 * RunModal — shown when the user clicks "Run".
 * Shows one file-picker per MANUAL_UPLOAD node.
 * If there are no MANUAL_UPLOAD nodes it falls back to a generic file picker.
 */
function RunModal({ nodes, onRun, onClose, uploading }) {
  const manualNodes = nodes.filter((n) => n.data.nodeType === 'MANUAL_UPLOAD');
  // Fallback: treat the whole workflow as a single entry with no specific node
  const entries = manualNodes.length > 0
    ? manualNodes.map((n) => ({ nodeId: n.id, label: n.data.label }))
    : [{ nodeId: null, label: 'Upload documents' }];

  const [fileMap, setFileMap] = useState({}); // { nodeId|'__default__': FileList }
  const fileRefs = useRef({});

  function key(nodeId) { return nodeId ?? '__default__'; }

  function handleFiles(nodeId, files) {
    setFileMap((prev) => ({ ...prev, [key(nodeId)]: files }));
  }

  function canRun() {
    return entries.some((e) => {
      const files = fileMap[key(e.nodeId)];
      return files && files.length > 0;
    });
  }

  function handleRun() {
    const runEntries = entries
      .map((e) => ({ files: fileMap[key(e.nodeId)] || [], nodeId: e.nodeId }))
      .filter((e) => e.files.length > 0);
    onRun(runEntries);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Run workflow</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {entries.map((entry) => (
            <div key={key(entry.nodeId)}>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {entry.label}
              </label>
              <div
                className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg hover:border-indigo-400 dark:hover:border-indigo-500 transition cursor-pointer"
                onClick={() => fileRefs.current[key(entry.nodeId)]?.click()}
              >
                <input
                  ref={(el) => { fileRefs.current[key(entry.nodeId)] = el; }}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
                  className="hidden"
                  onChange={(e) => handleFiles(entry.nodeId, e.target.files)}
                />
                <div className="flex-1 min-w-0">
                  {fileMap[key(entry.nodeId)]?.length > 0 ? (
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {fileMap[key(entry.nodeId)].length === 1
                        ? fileMap[key(entry.nodeId)][0].name
                        : `${fileMap[key(entry.nodeId)].length} files selected`}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Click to select files…</p>
                  )}
                </div>
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex-shrink-0">Browse</span>
              </div>
            </div>
          ))}

          {entries.length > 1 && (
            <p className="text-xs text-gray-400">
              You can leave a node empty — only nodes with files selected will run.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun() || uploading}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading…' : 'Start Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RunModal;
