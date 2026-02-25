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

jest.mock('../../src/models/dataMapper.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const dataMapperModel = require('../../src/models/dataMapper.model');
const userModel = require('../../src/models/user.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1' };

const FAKE_SET = {
  id: 'set-1',
  user_id: 'db-uuid-1',
  name: 'Vendor Master',
  headers: ['VendorName', 'VendorCode'],
  records: [
    { id: 'rec-1', data_map_set_id: 'set-1', values: { VendorName: 'Acme Corp', VendorCode: 'V001' } },
  ],
};

const FAKE_RULE = {
  id: 'rule-1',
  user_id: 'db-uuid-1',
  name: 'Vendor Code Lookup',
  extractor_id: 'ext-1',
  lookups: [
    { id: 'lk-1', rule_id: 'rule-1', data_map_set_id: 'set-1', map_set_column: 'VendorName', schema_field: 'vendor_name', match_type: 'fuzzy', match_threshold: 0.8, sort_order: 0 },
  ],
  targets: [
    { id: 'tg-1', rule_id: 'rule-1', target_type: 'header', schema_field: 'vendor_code', map_set_column: 'VendorCode', mode: 'map' },
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

describe('Data Map Set routes', () => {
  describe('GET /api/data-map-sets', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/data-map-sets');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of data map sets', async () => {
      dataMapperModel.findSetsByUserId.mockResolvedValue([FAKE_SET]);
      const res = await request(app).get('/api/data-map-sets').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Vendor Master');
    });
  });

  describe('POST /api/data-map-sets', () => {
    it('creates a data map set', async () => {
      dataMapperModel.createSet.mockResolvedValue(FAKE_SET);
      const res = await request(app)
        .post('/api/data-map-sets')
        .set(authHeaders())
        .send({ name: 'Vendor Master', headers: ['VendorName', 'VendorCode'], records: [] });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Vendor Master');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/data-map-sets')
        .set(authHeaders())
        .send({ headers: ['VendorName'] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/data-map-sets/:id', () => {
    it('returns a data map set with records', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      const res = await request(app).get('/api/data-map-sets/set-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('set-1');
      expect(res.body.records).toHaveLength(1);
    });

    it('returns 404 when not found', async () => {
      dataMapperModel.findSetById.mockResolvedValue(null);
      const res = await request(app).get('/api/data-map-sets/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/data-map-sets/:id', () => {
    it('updates a data map set', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.updateSet.mockResolvedValue({ ...FAKE_SET, name: 'Updated' });
      const res = await request(app)
        .patch('/api/data-map-sets/set-1')
        .set(authHeaders())
        .send({ name: 'Updated' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/data-map-sets/:id', () => {
    it('deletes a data map set', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.removeSet.mockResolvedValue();
      const res = await request(app).delete('/api/data-map-sets/set-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });
  });
});

describe('Data Map Rule routes', () => {
  describe('GET /api/data-map-rules', () => {
    it('returns list of rules', async () => {
      dataMapperModel.findRulesByUserId.mockResolvedValue([FAKE_RULE]);
      const res = await request(app).get('/api/data-map-rules').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Vendor Code Lookup');
    });
  });

  describe('POST /api/data-map-rules', () => {
    it('creates a rule', async () => {
      dataMapperModel.createRule.mockResolvedValue(FAKE_RULE);
      const res = await request(app)
        .post('/api/data-map-rules')
        .set(authHeaders())
        .send({ name: 'Vendor Code Lookup', extractor_id: 'ext-1', lookups: [], targets: [] });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Vendor Code Lookup');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/data-map-rules')
        .set(authHeaders())
        .send({ extractor_id: 'ext-1' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/data-map-rules/:id', () => {
    it('returns rule with lookups, targets, and usage', async () => {
      dataMapperModel.findRuleById.mockResolvedValue(FAKE_RULE);
      dataMapperModel.findRuleUsage.mockResolvedValue([]);
      const res = await request(app).get('/api/data-map-rules/rule-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.rule.id).toBe('rule-1');
      expect(Array.isArray(res.body.usage)).toBe(true);
    });

    it('returns 404 when not found', async () => {
      dataMapperModel.findRuleById.mockResolvedValue(null);
      const res = await request(app).get('/api/data-map-rules/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/data-map-rules/:id', () => {
    it('updates a rule', async () => {
      dataMapperModel.findRuleById.mockResolvedValue(FAKE_RULE);
      dataMapperModel.updateRule.mockResolvedValue({ ...FAKE_RULE, name: 'Updated Rule' });
      const res = await request(app)
        .patch('/api/data-map-rules/rule-1')
        .set(authHeaders())
        .send({ name: 'Updated Rule' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated Rule');
    });
  });

  describe('DELETE /api/data-map-rules/:id', () => {
    it('deletes when no nodes are using it', async () => {
      dataMapperModel.findRuleById.mockResolvedValue(FAKE_RULE);
      dataMapperModel.findRuleUsage.mockResolvedValue([]);
      dataMapperModel.removeRule.mockResolvedValue();
      const res = await request(app).delete('/api/data-map-rules/rule-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when nodes are using it', async () => {
      dataMapperModel.findRuleById.mockResolvedValue(FAKE_RULE);
      dataMapperModel.findRuleUsage.mockResolvedValue([{ workflow_id: 'wf-1', node_id: 'n-1' }]);
      const res = await request(app).delete('/api/data-map-rules/rule-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
    });
  });
});
