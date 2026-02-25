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

jest.mock('../../src/models/splittingInstruction.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const splittingModel = require('../../src/models/splittingInstruction.model');
const userModel = require('../../src/models/user.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1' };
const FAKE_INSTR = {
  id: 'si-1',
  user_id: 'db-uuid-1',
  name: 'Split into invoices',
  instructions: 'Split document into individual invoices.',
};

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
});

describe('Splitting Instruction routes', () => {
  describe('GET /api/splitting-instructions', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/splitting-instructions');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of instructions', async () => {
      splittingModel.findByUserId.mockResolvedValue([FAKE_INSTR]);
      const res = await request(app).get('/api/splitting-instructions').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Split into invoices');
    });
  });

  describe('POST /api/splitting-instructions', () => {
    it('creates an instruction', async () => {
      splittingModel.create.mockResolvedValue(FAKE_INSTR);
      const res = await request(app)
        .post('/api/splitting-instructions')
        .set(authHeaders())
        .send({ name: 'Split into invoices', instructions: 'Split document into individual invoices.' });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Split into invoices');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/splitting-instructions')
        .set(authHeaders())
        .send({ instructions: 'Some instructions' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when instructions is missing', async () => {
      const res = await request(app)
        .post('/api/splitting-instructions')
        .set(authHeaders())
        .send({ name: 'My splitter' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/splitting-instructions/:id', () => {
    it('returns a single instruction with usage info', async () => {
      splittingModel.findById.mockResolvedValue(FAKE_INSTR);
      splittingModel.findUsage.mockResolvedValue([
        { workflow_id: 'wf-1', workflow_name: 'My Workflow', node_id: 'n-1', node_name: 'Splitter' },
      ]);
      const res = await request(app).get('/api/splitting-instructions/si-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.instruction.id).toBe('si-1');
      expect(res.body.usage).toHaveLength(1);
    });

    it('returns 404 when not found', async () => {
      splittingModel.findById.mockResolvedValue(null);
      const res = await request(app).get('/api/splitting-instructions/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/splitting-instructions/:id', () => {
    it('updates an instruction', async () => {
      splittingModel.findById.mockResolvedValue(FAKE_INSTR);
      splittingModel.update.mockResolvedValue({ ...FAKE_INSTR, name: 'Updated' });
      const res = await request(app)
        .patch('/api/splitting-instructions/si-1')
        .set(authHeaders())
        .send({ name: 'Updated' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/splitting-instructions/:id', () => {
    it('deletes when no nodes are using it', async () => {
      splittingModel.findById.mockResolvedValue(FAKE_INSTR);
      splittingModel.findUsage.mockResolvedValue([]);
      splittingModel.remove.mockResolvedValue();
      const res = await request(app).delete('/api/splitting-instructions/si-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when nodes are using it', async () => {
      splittingModel.findById.mockResolvedValue(FAKE_INSTR);
      splittingModel.findUsage.mockResolvedValue([
        { workflow_id: 'wf-1', node_id: 'n-1', node_name: 'Splitter' },
      ]);
      const res = await request(app).delete('/api/splitting-instructions/si-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
    });
  });
});
