import { Navigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';

function ProtectedRoute({ children }) {
  const session = useAuthStore((s) => s.session);

  // On first load, check localStorage before deciding
  const stored = !session
    ? JSON.parse(localStorage.getItem('fibula_session') || 'null')
    : null;

  if (!session && !stored) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
