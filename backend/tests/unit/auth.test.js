process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');

// Mock the Supabase client used in auth middleware and auth service
jest.mock('../../src/config/db', () => ({
  db: {
    raw: jest.fn(),
  },
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

jest.mock('../../src/models/user.model', () => ({
  upsertUser: jest.fn(),
  findBySupabaseId: jest.fn(),
}));

const { supabase } = require('../../src/config/db');
const userModel = require('../../src/models/user.model');

describe('Auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when token is invalid', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer bad-token');

      expect(res.statusCode).toBe(401);
    });

    it('returns the current user when token is valid', async () => {
      const fakeSupabaseUser = { id: 'supabase-uid-1', email: 'test@example.com' };
      const fakeDbUser = {
        id: 'db-uuid-1',
        supabase_auth_id: 'supabase-uid-1',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      };

      supabase.auth.getUser.mockResolvedValue({ data: { user: fakeSupabaseUser }, error: null });
      userModel.findBySupabaseId.mockResolvedValue(fakeDbUser);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe('test@example.com');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 when token is valid', async () => {
      const fakeSupabaseUser = { id: 'supabase-uid-1', email: 'test@example.com' };
      supabase.auth.getUser.mockResolvedValue({ data: { user: fakeSupabaseUser }, error: null });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Logged out');
    });
  });
});
