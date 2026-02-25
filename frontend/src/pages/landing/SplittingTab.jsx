import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSplittingStore from '../../stores/useSplittingStore';

function SplittingTab() {
  const { instructions, loading, fetchInstructions } = useSplittingStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchInstructions();
  }, [fetchInstructions]);

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Splitting Instructions</h2>
        <button
          onClick={() => navigate('/app/splitting/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          + Add splitting instruction
        </button>
      </div>

      {instructions.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          No splitting instructions yet. Create one to use in a Splitting node.
        </p>
      ) : (
        <ul className="space-y-2">
          {instructions.map((instr) => (
            <li
              key={instr.id}
              onClick={() => navigate(`/app/splitting/${instr.id}`)}
              className="flex items-start justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{instr.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">
                  {instr.instructions}
                </p>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-4 shrink-0">Edit →</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SplittingTab;
