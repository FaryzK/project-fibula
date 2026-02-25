import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import splittingService from '../../services/splittingService';

function SplittingEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [usage, setUsage] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isNew) {
      splittingService.getOne(id).then(({ data }) => {
        setName(data.instruction.name);
        setInstructions(data.instruction.instructions);
        setUsage(data.usage || []);
      });
    }
  }, [id, isNew]);

  async function handleSave() {
    if (!name.trim() || !instructions.trim()) {
      setError('Name and instructions are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await splittingService.create({ name: name.trim(), instructions: instructions.trim() });
      } else {
        await splittingService.update(id, { name: name.trim(), instructions: instructions.trim() });
      }
      navigate('/app?tab=splitting');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this splitting instruction?')) return;
    setDeleting(true);
    try {
      await splittingService.remove(id);
      navigate('/app?tab=splitting');
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/app?tab=splitting')}
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6 block"
        >
          ← Back to Splitting Instructions
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Splitting Instruction' : 'Edit Splitting Instruction'}
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Split into individual invoices"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Splitting Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="Describe how to split the document, e.g. 'Split the document into individual invoices. Each invoice starts with Invoice Number.'"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">
              The LLM uses these instructions to identify where to split the document into separate sub-documents.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {!isNew && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-sm text-red-500 hover:text-red-700 transition disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Usage list */}
        {!isNew && usage.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Used by {usage.length} node{usage.length !== 1 ? 's' : ''}
            </h2>
            <ul className="space-y-2">
              {usage.map((u) => (
                <li key={u.node_id}>
                  <button
                    onClick={() => navigate(`/app/workflow/${u.workflow_id}?node=${u.node_id}`)}
                    className="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{u.node_name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">in {u.workflow_name}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default SplittingEdit;
