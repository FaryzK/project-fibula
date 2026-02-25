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

jest.mock('../../src/models/categorisationPrompt.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const categorisationModel = require('../../src/models/categorisationPrompt.model');
const userModel = require('../../src/models/user.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1' };
const FAKE_PROMPT = {
  id: 'cp-1',
  user_id: 'db-uuid-1',
  name: 'Invoice vs PO',
  labels: [
    { id: 'lbl-1', label: 'INVOICE', description: 'Has invoice number only', sort_order: 0 },
    { id: 'lbl-2', label: 'PO', description: 'Has invoice and PO number', sort_order: 1 },
  ],
};

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
});

describe('Categorisation Prompt routes', () => {
  describe('GET /api/categorisation-prompts', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/categorisation-prompts');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of prompts', async () => {
      categorisationModel.findByUserId.mockResolvedValue([FAKE_PROMPT]);
      const res = await request(app).get('/api/categorisation-prompts').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Invoice vs PO');
    });
  });

  describe('POST /api/categorisation-prompts', () => {
    it('creates a prompt with labels', async () => {
      categorisationModel.create.mockResolvedValue(FAKE_PROMPT);
      const res = await request(app)
        .post('/api/categorisation-prompts')
        .set(authHeaders())
        .send({
          name: 'Invoice vs PO',
          labels: [
            { label: 'INVOICE', description: 'Has invoice number only' },
            { label: 'PO', description: 'Has invoice and PO number' },
          ],
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Invoice vs PO');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/categorisation-prompts')
        .set(authHeaders())
        .send({ labels: [{ label: 'INVOICE', description: 'test' }] });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when labels is empty', async () => {
      const res = await request(app)
        .post('/api/categorisation-prompts')
        .set(authHeaders())
        .send({ name: 'My prompt', labels: [] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/categorisation-prompts/:id', () => {
    it('returns a prompt with labels and usage info', async () => {
      categorisationModel.findById.mockResolvedValue(FAKE_PROMPT);
      categorisationModel.findUsage.mockResolvedValue([
        { workflow_id: 'wf-1', workflow_name: 'My Workflow', node_id: 'n-2', node_name: 'Categoriser' },
      ]);
      const res = await request(app).get('/api/categorisation-prompts/cp-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.prompt.id).toBe('cp-1');
      expect(res.body.prompt.labels).toHaveLength(2);
      expect(res.body.usage).toHaveLength(1);
    });

    it('returns 404 when not found', async () => {
      categorisationModel.findById.mockResolvedValue(null);
      const res = await request(app).get('/api/categorisation-prompts/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/categorisation-prompts/:id', () => {
    it('updates a prompt and replaces labels', async () => {
      categorisationModel.findById.mockResolvedValue(FAKE_PROMPT);
      categorisationModel.update.mockResolvedValue({ ...FAKE_PROMPT, name: 'Updated' });
      const res = await request(app)
        .patch('/api/categorisation-prompts/cp-1')
        .set(authHeaders())
        .send({
          name: 'Updated',
          labels: [{ label: 'INVOICE', description: 'Desc' }],
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/categorisation-prompts/:id', () => {
    it('deletes when no nodes are using it', async () => {
      categorisationModel.findById.mockResolvedValue(FAKE_PROMPT);
      categorisationModel.findUsage.mockResolvedValue([]);
      categorisationModel.remove.mockResolvedValue();
      const res = await request(app).delete('/api/categorisation-prompts/cp-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when nodes are using it', async () => {
      categorisationModel.findById.mockResolvedValue(FAKE_PROMPT);
      categorisationModel.findUsage.mockResolvedValue([{ node_id: 'n-2' }]);
      const res = await request(app).delete('/api/categorisation-prompts/cp-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
    });
  });
});
