import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach Supabase JWT to every request
api.interceptors.request.use((config) => {
  const session = JSON.parse(localStorage.getItem('fibula_session') || 'null');
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export default api;
