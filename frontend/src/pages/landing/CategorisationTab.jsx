import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useCategorisationStore from '../../stores/useCategorisationStore';

function CategorisationTab() {
  const { prompts, loading, fetchPrompts } = useCategorisationStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Categorisation Prompts</h2>
        <button
          onClick={() => navigate('/app/categorisation/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + Add categorisation prompt
        </button>
      </div>

      {prompts.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          No categorisation prompts yet. Create one to use in a Categorisation node.
        </p>
      ) : (
        <ul className="space-y-2">
          {prompts.map((prompt) => (
            <li
              key={prompt.id}
              onClick={() => navigate(`/app/categorisation/${prompt.id}`)}
              className="flex items-start justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{prompt.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(prompt.labels || []).map((l) => (
                    <span
                      key={l.id}
                      className="text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full"
                    >
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-4 shrink-0">Edit →</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CategorisationTab;
