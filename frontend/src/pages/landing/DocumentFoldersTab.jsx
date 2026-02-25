import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useDocumentFolderStore from '../../stores/useDocumentFolderStore';

function DocumentFoldersTab() {
  const { folders, loading, loadFolders } = useDocumentFolderStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Document Folders</h2>
        <button
          onClick={() => navigate('/app/document-folders/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + Add folder
        </button>
      </div>

      {folders.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          No document folders yet. Create one to use as a holding area in your workflows.
        </p>
      ) : (
        <ul className="space-y-2">
          {folders.map((folder) => (
            <li
              key={folder.id}
              onClick={() => navigate(`/app/document-folders/${folder.id}`)}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{folder.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {folder.held_count > 0 && (
                  <span className="text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full">
                    {folder.held_count} held
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500">View →</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DocumentFoldersTab;
