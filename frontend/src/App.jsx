import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login';
import AuthCallback from './pages/auth/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/landing/Landing';
import WorkflowCanvas from './pages/canvas/WorkflowCanvas';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Landing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/workflow/:id"
          element={
            <ProtectedRoute>
              <WorkflowCanvas />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
