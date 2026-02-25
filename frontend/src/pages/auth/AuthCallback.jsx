import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../../services/supabase';
import useAuthStore from '../../stores/useAuthStore';

function AuthCallback() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        navigate('/app', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    });
  }, [navigate, setSession]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <p className="text-gray-500 dark:text-gray-400">Signing you in…</p>
    </div>
  );
}

export default AuthCallback;
