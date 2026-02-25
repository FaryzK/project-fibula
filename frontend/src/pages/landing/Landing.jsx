import { useState } from 'react';
import WorkflowsTab from './WorkflowsTab';
import useAuthStore from '../../stores/useAuthStore';
import supabase from '../../services/supabase';
import { useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'workflows', label: 'Workflows' },
  { id: 'document-folders', label: 'Document Folders' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'splitting', label: 'Document Splitting' },
  { id: 'categorisation', label: 'Categorisation' },
  { id: 'extractors', label: 'Extractors' },
  { id: 'data-mapper', label: 'Data Mapper' },
];

function Landing() {
  const [activeTab, setActiveTab] = useState('workflows');
  const clearSession = useAuthStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Project Fibula</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <main className="flex-1 p-6">
        {activeTab === 'workflows' && <WorkflowsTab />}
        {activeTab !== 'workflows' && (
          <div className="text-gray-400 dark:text-gray-500 text-sm">Coming soon</div>
        )}
      </main>
    </div>
  );
}

export default Landing;
