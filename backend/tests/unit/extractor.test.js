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

jest.mock('../../src/models/extractor.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/models/workflowRun.model');
jest.mock('../../src/services/execution.service', () => ({
  resumeDocumentExecution: jest.fn().mockResolvedValue(),
  runWorkflow: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const extractorModel = require('../../src/models/extractor.model');
const userModel = require('../../src/models/user.model');
const documentExecutionModel = require('../../src/models/documentExecution.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1' };

const FAKE_EXTRACTOR = {
  id: 'ext-1',
  user_id: 'db-uuid-1',
  name: 'Invoice Extractor',
  hold_all: false,
  header_fields: [
    { id: 'hf-1', extractor_id: 'ext-1', field_name: 'invoice_number', field_description: 'Invoice number', is_mandatory: true, sort_order: 0 },
  ],
  table_types: [
    {
      id: 'tt-1',
      extractor_id: 'ext-1',
      type_name: 'LineItems',
      type_description: 'Invoice line items',
      columns: [
        { id: 'tc-1', table_type_id: 'tt-1', column_name: 'description', column_description: 'Item description', is_mandatory: false, sort_order: 0 },
      ],
    },
  ],
};

const FAKE_HELD = {
  id: 'held-1',
  extractor_id: 'ext-1',
  document_execution_id: 'exec-1',
  status: 'held',
  held_at: '2024-06-01T00:00:00Z',
};

const FAKE_FEEDBACK = {
  id: 'fb-1',
  extractor_id: 'ext-1',
  document_id: 'doc-1',
  target_type: 'header_field',
  target_id: 'hf-1',
  feedback_text: 'Do not capture # in invoice number',
};

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
  documentExecutionModel.findById.mockResolvedValue(null);
});

describe('Extractor routes', () => {
  describe('GET /api/extractors', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/extractors');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of extractors', async () => {
      extractorModel.findByUserId.mockResolvedValue([FAKE_EXTRACTOR]);
      const res = await request(app).get('/api/extractors').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Invoice Extractor');
    });
  });

  describe('POST /api/extractors', () => {
    it('creates an extractor', async () => {
      extractorModel.create.mockResolvedValue(FAKE_EXTRACTOR);
      const res = await request(app)
        .post('/api/extractors')
        .set(authHeaders())
        .send({
          name: 'Invoice Extractor',
          header_fields: [{ field_name: 'invoice_number', field_description: 'Invoice number', is_mandatory: true }],
          table_types: [],
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Invoice Extractor');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/extractors')
        .set(authHeaders())
        .send({ header_fields: [] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/extractors/:id', () => {
    it('returns extractor with schema and usage', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findUsage.mockResolvedValue([
        { workflow_id: 'wf-1', workflow_name: 'My Workflow', node_id: 'n-1', node_name: 'Extractor' },
      ]);
      const res = await request(app).get('/api/extractors/ext-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.extractor.id).toBe('ext-1');
      expect(res.body.usage).toHaveLength(1);
    });

    it('returns 404 when not found', async () => {
      extractorModel.findById.mockResolvedValue(null);
      const res = await request(app).get('/api/extractors/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/extractors/:id', () => {
    it('updates an extractor', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.update.mockResolvedValue({ ...FAKE_EXTRACTOR, name: 'Updated Extractor' });
      const res = await request(app)
        .patch('/api/extractors/ext-1')
        .set(authHeaders())
        .send({ name: 'Updated Extractor' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated Extractor');
    });
  });

  describe('DELETE /api/extractors/:id', () => {
    it('deletes when no nodes are using it', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findUsage.mockResolvedValue([]);
      extractorModel.remove.mockResolvedValue();
      const res = await request(app).delete('/api/extractors/ext-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when nodes are using it', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findUsage.mockResolvedValue([{ workflow_id: 'wf-1', node_id: 'n-1' }]);
      const res = await request(app).delete('/api/extractors/ext-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /api/extractors/:id/held', () => {
    it('returns held documents', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findHeld.mockResolvedValue([FAKE_HELD]);
      const res = await request(app).get('/api/extractors/ext-1/held').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/extractors/:id/held/:heldId/send-out', () => {
    it('sends out a held document', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findHeldById.mockResolvedValue({ ...FAKE_HELD, extractor_id: 'ext-1' });
      extractorModel.sendOut.mockResolvedValue({ ...FAKE_HELD, status: 'sent_out' });
      const res = await request(app)
        .post('/api/extractors/ext-1/held/held-1/send-out')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when held doc not found', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findHeldById.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/extractors/ext-1/held/missing/send-out')
        .set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/extractors/:id/feedback', () => {
    it('creates feedback', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.createFeedback.mockResolvedValue(FAKE_FEEDBACK);
      const res = await request(app)
        .post('/api/extractors/ext-1/feedback')
        .set(authHeaders())
        .send({
          document_id: 'doc-1',
          target_type: 'header_field',
          target_id: 'hf-1',
          feedback_text: 'Do not capture # in invoice number',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.feedback_text).toBe('Do not capture # in invoice number');
    });
  });

  describe('GET /api/extractors/:id/feedback', () => {
    it('returns feedback list', async () => {
      extractorModel.findById.mockResolvedValue(FAKE_EXTRACTOR);
      extractorModel.findFeedback.mockResolvedValue([FAKE_FEEDBACK]);
      const res = await request(app).get('/api/extractors/ext-1/feedback').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
