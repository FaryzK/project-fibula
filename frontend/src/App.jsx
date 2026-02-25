import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login';
import AuthCallback from './pages/auth/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/landing/Landing';
import WorkflowCanvas from './pages/canvas/WorkflowCanvas';
import SplittingEdit from './pages/config/SplittingEdit';
import CategorisationEdit from './pages/config/CategorisationEdit';
import DocumentFolderEdit from './pages/config/DocumentFolderEdit';
import ExtractorEdit from './pages/config/ExtractorEdit';
import DataMapSetEdit from './pages/config/DataMapSetEdit';
import DataMapRuleEdit from './pages/config/DataMapRuleEdit';
import ReconciliationRuleEdit from './pages/config/ReconciliationRuleEdit';
import MatchingSetDetail from './pages/config/MatchingSetDetail';

function protect(element) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app" element={protect(<Landing />)} />
        <Route path="/app/workflow/:id" element={protect(<WorkflowCanvas />)} />
        <Route path="/app/splitting/:id" element={protect(<SplittingEdit />)} />
        <Route path="/app/categorisation/:id" element={protect(<CategorisationEdit />)} />
        <Route path="/app/document-folders/:id" element={protect(<DocumentFolderEdit />)} />
        <Route path="/app/extractors/:id" element={protect(<ExtractorEdit />)} />
        <Route path="/app/data-map-sets/:id" element={protect(<DataMapSetEdit />)} />
        <Route path="/app/data-map-rules/:id" element={protect(<DataMapRuleEdit />)} />
        <Route path="/app/reconciliation-rules/:id" element={protect(<ReconciliationRuleEdit />)} />
        <Route
          path="/app/reconciliation-rules/:ruleId/matching-sets/:setId"
          element={protect(<MatchingSetDetail />)}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
