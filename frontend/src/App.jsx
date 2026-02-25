import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login';

// Placeholder pages — will be implemented phase by phase
function Landing() {
  return <div className="p-8 text-gray-800 dark:text-white">Landing — coming soon</div>;
}

function WorkflowCanvas() {
  return <div className="p-8 text-gray-800 dark:text-white">Canvas — coming soon</div>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Landing />} />
        <Route path="/app/workflow/:id" element={<WorkflowCanvas />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
