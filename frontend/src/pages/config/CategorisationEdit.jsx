import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import categorisationService from '../../services/categorisationService';

const MAX_LABELS = 20;

function CategorisationEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('');
  const [labels, setLabels] = useState([{ label: '', description: '' }]);
  const [usage, setUsage] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isNew) {
      categorisationService.getOne(id).then(({ data }) => {
        setName(data.prompt.name);
        setLabels(data.prompt.labels.map((l) => ({ label: l.label, description: l.description })));
        setUsage(data.usage || []);
      });
    }
  }, [id, isNew]);

  function updateLabel(index, field, value) {
    setLabels((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLabel() {
    if (labels.length < MAX_LABELS) setLabels((prev) => [...prev, { label: '', description: '' }]);
  }

  function removeLabel(index) {
    setLabels((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    const validLabels = labels.filter((l) => l.label.trim());
    if (validLabels.length === 0) { setError('At least one label is required.'); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), labels: validLabels.map((l) => ({ label: l.label.trim(), description: l.description.trim() })) };
      if (isNew) {
        await categorisationService.create(payload);
      } else {
        await categorisationService.update(id, payload);
      }
      navigate('/app?tab=categorisation');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this categorisation prompt?')) return;
    setDeleting(true);
    try {
      await categorisationService.remove(id);
      navigate('/app?tab=categorisation');
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/app?tab=categorisation')}
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6 block"
        >
          ← Back to Categorisation Prompts
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Categorisation Prompt' : 'Edit Categorisation Prompt'}
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
              placeholder="e.g. Invoice vs PO"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Labels ({labels.length}/{MAX_LABELS})
              </label>
              <button
                onClick={addLabel}
                disabled={labels.length >= MAX_LABELS}
                className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-40"
              >
                + Add label
              </button>
            </div>
            <div className="space-y-3">
              {labels.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <input
                      value={l.label}
                      onChange={(e) => updateLabel(i, 'label', e.target.value.toUpperCase())}
                      placeholder="LABEL (e.g. INVOICE)"
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <input
                      value={l.description}
                      onChange={(e) => updateLabel(i, 'description', e.target.value)}
                      placeholder="Description (e.g. A document with invoice number only)"
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {labels.length > 1 && (
                    <button
                      onClick={() => removeLabel(i)}
                      className="text-red-400 hover:text-red-600 text-lg mt-1 leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              The LLM uses these labels and descriptions to classify each document. The output port of the node matches the label name.
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

export default CategorisationEdit;
