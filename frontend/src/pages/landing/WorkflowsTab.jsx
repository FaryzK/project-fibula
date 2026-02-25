import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useWorkflowStore from '../../stores/useWorkflowStore';

function WorkflowsTab() {
  const { workflows, loading, fetchWorkflows, createWorkflow, renameWorkflow, deleteWorkflow, togglePublish } =
    useWorkflowStore();
  const navigate = useNavigate();
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  async function handleCreate() {
    const workflow = await createWorkflow('Untitled workflow');
    navigate(`/app/workflow/${workflow.id}`);
  }

  function startRename(wf) {
    setRenamingId(wf.id);
    setRenameValue(wf.name);
  }

  async function commitRename(id) {
    if (renameValue.trim()) await renameWorkflow(id, renameValue.trim());
    setRenamingId(null);
  }

  if (loading) {
    return <div className="text-gray-400 text-sm">Loading workflows…</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Workflows</h2>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + Add workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">No workflows yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-2">
          {workflows.map((wf) => (
            <li
              key={wf.id}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3"
            >
              {/* Name */}
              {renamingId === wf.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(wf.id)}
                  onKeyDown={(e) => e.key === 'Enter' && commitRename(wf.id)}
                  className="text-sm font-medium text-gray-900 dark:text-white bg-transparent border-b border-indigo-500 outline-none w-48"
                />
              ) : (
                <button
                  onClick={() => navigate(`/app/workflow/${wf.id}`)}
                  className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                >
                  {wf.name}
                </button>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    wf.is_published
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {wf.is_published ? 'Published' : 'Unpublished'}
                </span>
                <button
                  onClick={() => togglePublish(wf.id, wf.is_published)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  {wf.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => startRename(wf)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                >
                  Rename
                </button>
                <button
                  onClick={() => deleteWorkflow(wf.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default WorkflowsTab;
