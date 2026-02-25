import supabase from '../../services/supabase';

function Login() {
  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Project Fibula</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Document processing workflows</p>
        <button
          onClick={handleGoogleSignIn}
          className="px-6 py-3 bg-white border border-gray-300 rounded-lg shadow-sm text-gray-700 font-medium hover:bg-gray-50 transition"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default Login;
