process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');

jest.mock('../../src/config/db', () => ({
  db: jest.fn(),
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('../../src/models/workflow.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1', supabase_auth_id: 'supabase-uid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const workflowModel = require('../../src/models/workflow.model');
const userModel = require('../../src/models/user.model');

const FAKE_USER = { id: 'supabase-uid-1', email: 'test@example.com' };
const FAKE_DB_USER = { id: 'db-uuid-1', supabase_auth_id: 'supabase-uid-1', email: 'test@example.com' };

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
});

describe('Workflow routes', () => {
  describe('GET /api/workflows', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/workflows');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of workflows for the user', async () => {
      workflowModel.findByUserId.mockResolvedValue([
        { id: 'wf-1', name: 'My Workflow', is_published: false },
      ]);
      const res = await request(app).get('/api/workflows').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('My Workflow');
    });
  });

  describe('POST /api/workflows', () => {
    it('creates a workflow and returns it', async () => {
      const created = { id: 'wf-new', name: 'New Workflow', is_published: false };
      workflowModel.create.mockResolvedValue(created);
      const res = await request(app)
        .post('/api/workflows')
        .set(authHeaders())
        .send({ name: 'New Workflow' });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('New Workflow');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/workflows').set(authHeaders()).send({});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/workflows/:id', () => {
    it('returns 404 when workflow not found', async () => {
      workflowModel.findById.mockResolvedValue(null);
      const res = await request(app).get('/api/workflows/missing-id').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });

    it('returns the workflow', async () => {
      workflowModel.findById.mockResolvedValue({ id: 'wf-1', name: 'My Workflow', user_id: 'db-uuid-1' });
      const res = await request(app).get('/api/workflows/wf-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('wf-1');
    });
  });

  describe('PATCH /api/workflows/:id', () => {
    it('updates a workflow name', async () => {
      workflowModel.findById.mockResolvedValue({ id: 'wf-1', name: 'Old', user_id: 'db-uuid-1' });
      workflowModel.update.mockResolvedValue({ id: 'wf-1', name: 'Updated' });
      const res = await request(app)
        .patch('/api/workflows/wf-1')
        .set(authHeaders())
        .send({ name: 'Updated' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/workflows/:id', () => {
    it('deletes a workflow', async () => {
      workflowModel.findById.mockResolvedValue({ id: 'wf-1', user_id: 'db-uuid-1' });
      workflowModel.remove.mockResolvedValue();
      const res = await request(app).delete('/api/workflows/wf-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });
  });

  describe('PATCH /api/workflows/:id/publish', () => {
    it('publishes a workflow', async () => {
      workflowModel.findById.mockResolvedValue({ id: 'wf-1', user_id: 'db-uuid-1' });
      workflowModel.setPublished.mockResolvedValue({ id: 'wf-1', is_published: true });
      const res = await request(app).patch('/api/workflows/wf-1/publish').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.is_published).toBe(true);
    });
  });

  describe('PATCH /api/workflows/:id/unpublish', () => {
    it('unpublishes a workflow', async () => {
      workflowModel.findById.mockResolvedValue({ id: 'wf-1', user_id: 'db-uuid-1' });
      workflowModel.setPublished.mockResolvedValue({ id: 'wf-1', is_published: false });
      const res = await request(app).patch('/api/workflows/wf-1/unpublish').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.is_published).toBe(false);
    });
  });
});
