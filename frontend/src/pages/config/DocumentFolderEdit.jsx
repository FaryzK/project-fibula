import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import documentFolderService from '../../services/documentFolderService';

function DocumentFolderEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [usage, setUsage] = useState([]);
  const [heldDocs, setHeldDocs] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const { folder, usage: u } = await documentFolderService.getOne(id);
        setName(folder.name);
        setUsage(u);
        const docs = await documentFolderService.listDocuments(id);
        setHeldDocs(docs);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await documentFolderService.create({ name });
        navigate('/app?tab=documentFolders');
      } else {
        await documentFolderService.update(id, { name });
        navigate('/app?tab=documentFolders');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendOut(heldId) {
    try {
      await documentFolderService.sendOut(id, heldId);
      setHeldDocs((prev) => prev.filter((d) => d.id !== heldId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this folder?')) return;
    try {
      await documentFolderService.remove(id);
      navigate('/app?tab=documentFolders');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/app?tab=documentFolders')}
          className="text-sm text-indigo-600 hover:underline mb-6 block"
        >
          ← Back to Document Folders
        </button>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Document Folder' : 'Edit Document Folder'}
        </h1>

        <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Folder name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Review Queue"
            required
          />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-200 transition"
              >
                Delete
              </button>
            )}
          </div>
        </form>

        {/* Usage */}
        {!isNew && usage.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Used in workflows</h2>
            <ul className="space-y-1">
              {usage.map((u) => (
                <li key={u.node_id} className="text-xs text-gray-500 dark:text-gray-400">
                  <button
                    onClick={() => navigate(`/app/workflow/${u.workflow_id}?node=${u.node_id}`)}
                    className="text-indigo-600 hover:underline"
                  >
                    {u.workflow_name} → {u.node_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Held documents */}
        {!isNew && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Held documents ({heldDocs.length})
            </h2>
            {heldDocs.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No documents currently held.</p>
            ) : (
              <ul className="space-y-2">
                {heldDocs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{doc.file_name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {doc.workflow_name} · {doc.node_name} · {new Date(doc.arrived_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSendOut(doc.id)}
                      className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                    >
                      Send out
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentFolderEdit;
