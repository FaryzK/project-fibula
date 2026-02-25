import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useExtractorStore from '../../stores/useExtractorStore';

function ExtractorsTab() {
  const { extractors, loading, loadExtractors } = useExtractorStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadExtractors();
  }, [loadExtractors]);

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Extractors</h2>
        <button
          onClick={() => navigate('/app/extractors/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + New Extractor
        </button>
      </div>

      {extractors.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          No extractors yet. Create one to define a schema for VLM data extraction.
        </p>
      ) : (
        <ul className="space-y-2">
          {extractors.map((ext) => (
            <li
              key={ext.id}
              onClick={() => navigate(`/app/extractors/${ext.id}`)}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ext.name}</p>
                {ext.hold_all && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">Hold all documents</span>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">Edit →</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ExtractorsTab;
