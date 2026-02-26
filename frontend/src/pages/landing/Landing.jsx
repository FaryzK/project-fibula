import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WorkflowsTab from './WorkflowsTab';
import SplittingTab from './SplittingTab';
import CategorisationTab from './CategorisationTab';
import DocumentFoldersTab from './DocumentFoldersTab';
import ExtractorsTab from './ExtractorsTab';
import DataMapperTab from './DataMapperTab';
import ReconciliationTab from './ReconciliationTab';
import useAuthStore from '../../stores/useAuthStore';
import supabase from '../../services/supabase';

const TABS = [
  { id: 'workflows', label: 'Workflows' },
  { id: 'extractors', label: 'Extractors' },
  { id: 'data-mapper', label: 'Data Mapper' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'document-folders', label: 'Document Folders' },
  { id: 'splitting', label: 'Document Splitting' },
  { id: 'categorisation', label: 'Categorisation' },
];

function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'workflows';
  const [activeTab, setActiveTab] = useState(initialTab);

  const clearSession = useAuthStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  // Keep URL in sync with active tab
  useEffect(() => {
    if (activeTab !== 'workflows') {
      setSearchParams({ tab: activeTab }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [activeTab, setSearchParams]);

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
        {activeTab === 'splitting' && <SplittingTab />}
        {activeTab === 'categorisation' && <CategorisationTab />}
        {activeTab === 'document-folders' && <DocumentFoldersTab />}
        {activeTab === 'extractors' && <ExtractorsTab />}
        {activeTab === 'data-mapper' && <DataMapperTab />}
        {activeTab === 'reconciliation' && <ReconciliationTab />}
      </main>
    </div>
  );
}

export default Landing;
