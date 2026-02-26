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

jest.mock('../../src/models/reconciliation.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const reconciliationModel = require('../../src/models/reconciliation.model');
const userModel = require('../../src/models/user.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1' };

const FAKE_RULE = {
  id: 'rule-1',
  user_id: 'db-uuid-1',
  name: 'PO vs Invoice',
  anchor_extractor_id: 'ext-po',
  target_extractors: [{ id: 'te-1', rule_id: 'rule-1', extractor_id: 'ext-inv' }],
  variations: [
    {
      id: 'var-1',
      rule_id: 'rule-1',
      variation_order: 1,
      doc_matching_links: [
        { id: 'dml-1', variation_id: 'var-1', anchor_field: 'po_number', target_extractor_id: 'ext-inv', target_field: 'order_reference', match_type: 'exact' },
      ],
      table_matching_keys: [],
      comparison_rules: [
        { id: 'cr-1', variation_id: 'var-1', level: 'header', formula: 'Invoice.grand_total = PO.grand_total', tolerance_type: 'absolute', tolerance_value: 0.5 },
      ],
    },
  ],
};

const FAKE_MATCHING_SET = {
  id: 'ms-1',
  rule_id: 'rule-1',
  anchor_document_execution_id: 'exec-1',
  status: 'pending',
  created_at: '2024-06-01T00:00:00Z',
  docs: [
    { id: 'msd-1', matching_set_id: 'ms-1', document_execution_id: 'exec-1', extractor_id: 'ext-po' },
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

describe('Reconciliation Rule routes', () => {
  describe('GET /api/reconciliation-rules', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/reconciliation-rules');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of rules', async () => {
      reconciliationModel.findByUserId.mockResolvedValue([FAKE_RULE]);
      const res = await request(app).get('/api/reconciliation-rules').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('PO vs Invoice');
    });
  });

  describe('POST /api/reconciliation-rules', () => {
    it('creates a rule', async () => {
      reconciliationModel.create.mockResolvedValue(FAKE_RULE);
      const res = await request(app)
        .post('/api/reconciliation-rules')
        .set(authHeaders())
        .send({
          name: 'PO vs Invoice',
          anchor_extractor_id: 'ext-po',
          target_extractors: [{ extractor_id: 'ext-inv' }],
          variations: [],
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('PO vs Invoice');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/reconciliation-rules')
        .set(authHeaders())
        .send({ anchor_extractor_id: 'ext-po' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when anchor_extractor_id is missing', async () => {
      const res = await request(app)
        .post('/api/reconciliation-rules')
        .set(authHeaders())
        .send({ name: 'Test' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/reconciliation-rules/:id', () => {
    it('returns rule with full config and usage', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findUsage.mockResolvedValue([]);
      const res = await request(app).get('/api/reconciliation-rules/rule-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.rule.id).toBe('rule-1');
      expect(res.body.rule.variations).toHaveLength(1);
      expect(Array.isArray(res.body.usage)).toBe(true);
    });

    it('returns 404 when not found', async () => {
      reconciliationModel.findById.mockResolvedValue(null);
      const res = await request(app).get('/api/reconciliation-rules/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/reconciliation-rules/:id', () => {
    it('updates a rule', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.update.mockResolvedValue({ ...FAKE_RULE, name: 'Updated' });
      const res = await request(app)
        .patch('/api/reconciliation-rules/rule-1')
        .set(authHeaders())
        .send({ name: 'Updated' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/reconciliation-rules/:id', () => {
    it('deletes when no nodes are using it', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findUsage.mockResolvedValue([]);
      reconciliationModel.remove.mockResolvedValue();
      const res = await request(app).delete('/api/reconciliation-rules/rule-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when nodes are using it', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findUsage.mockResolvedValue([{ workflow_id: 'wf-1', node_id: 'n-1' }]);
      const res = await request(app).delete('/api/reconciliation-rules/rule-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /api/reconciliation-rules/documents', () => {
    it('returns all held documents', async () => {
      const FAKE_HELD_DOC = {
        id: 'hd-1',
        document_execution_id: 'exec-1',
        extractor_id: 'ext-po',
        status: 'held',
        held_at: '2024-06-01T00:00:00Z',
      };
      reconciliationModel.findHeldDocs.mockResolvedValue([FAKE_HELD_DOC]);
      reconciliationModel.findHeldDocMatchingSets.mockResolvedValue([]);
      const res = await request(app)
        .get('/api/reconciliation-rules/documents')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].document_execution_id).toBe('exec-1');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/reconciliation-rules/documents');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/reconciliation-rules/:id/matching-sets', () => {
    it('returns matching sets for a rule', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findMatchingSets.mockResolvedValue([FAKE_MATCHING_SET]);
      const res = await request(app)
        .get('/api/reconciliation-rules/rule-1/matching-sets')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('ms-1');
    });
  });

  describe('GET /api/reconciliation-rules/:id/matching-sets/:setId', () => {
    it('returns a matching set with docs', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findMatchingSetById.mockResolvedValue(FAKE_MATCHING_SET);
      const res = await request(app)
        .get('/api/reconciliation-rules/rule-1/matching-sets/ms-1')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('ms-1');
    });

    it('returns 404 when matching set not found', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findMatchingSetById.mockResolvedValue(null);
      const res = await request(app)
        .get('/api/reconciliation-rules/rule-1/matching-sets/missing')
        .set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/reconciliation-rules/:id/matching-sets/:setId/force-reconcile', () => {
    it('force reconciles a matching set', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findMatchingSetById.mockResolvedValue(FAKE_MATCHING_SET);
      reconciliationModel.updateMatchingSetStatus.mockResolvedValue({ ...FAKE_MATCHING_SET, status: 'force_reconciled' });
      const res = await request(app)
        .post('/api/reconciliation-rules/rule-1/matching-sets/ms-1/force-reconcile')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/reconciliation-rules/:id/matching-sets/:setId/reject', () => {
    it('rejects a matching set', async () => {
      reconciliationModel.findById.mockResolvedValue(FAKE_RULE);
      reconciliationModel.findMatchingSetById.mockResolvedValue(FAKE_MATCHING_SET);
      reconciliationModel.updateMatchingSetStatus.mockResolvedValue({ ...FAKE_MATCHING_SET, status: 'rejected' });
      const res = await request(app)
        .post('/api/reconciliation-rules/rule-1/matching-sets/ms-1/reject')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
    });
  });
});
