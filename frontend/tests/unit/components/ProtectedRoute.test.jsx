import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../../../src/components/ProtectedRoute';
import useAuthStore from '../../../src/stores/useAuthStore';

// Mock localStorage
beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().clearSession();
});

describe('ProtectedRoute', () => {
  it('redirects to /login when no session exists', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/app']}>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders children when session exists in store', () => {
    useAuthStore.getState().setSession({
      access_token: 'tok',
      user: { id: '1', email: 'a@b.com' },
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
