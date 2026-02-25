import { describe, it, expect, beforeEach } from 'vitest';
import useAuthStore from '../../../src/stores/useAuthStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('starts with no user or session', () => {
    const { user, session } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(session).toBeNull();
  });

  it('sets session and exposes user', () => {
    const fakeSession = { access_token: 'tok', user: { id: '1', email: 'a@b.com' } };
    useAuthStore.getState().setSession(fakeSession);

    const { user, session } = useAuthStore.getState();
    expect(session).toEqual(fakeSession);
    expect(user.email).toBe('a@b.com');
  });

  it('clears session on logout', () => {
    useAuthStore.getState().setSession({ access_token: 'tok', user: { id: '1' } });
    useAuthStore.getState().clearSession();

    const { user, session } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(session).toBeNull();
  });
});
