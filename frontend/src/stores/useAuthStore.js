import { create } from 'zustand';

const stored = JSON.parse(localStorage.getItem('fibula_session') || 'null');

const useAuthStore = create((set) => ({
  user: stored?.user ?? null,
  session: stored ?? null,

  setSession: (session) => {
    localStorage.setItem('fibula_session', JSON.stringify(session));
    set({ session, user: session?.user ?? null });
  },

  clearSession: () => {
    localStorage.removeItem('fibula_session');
    set({ session: null, user: null });
  },
}));

export default useAuthStore;
