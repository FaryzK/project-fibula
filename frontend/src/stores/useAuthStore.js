import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  session: null,
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
