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
  headers: [{ name: 'VendorName', data_type: 'string' }, { name: 'VendorCode', data_type: 'string' }],
  records: [
    { id: 'rec-1', data_map_set_id: 'set-1', values: { VendorName: 'Acme Corp', VendorCode: 'V001' } },
  ],
  total: 1,
  page: 1,
  pageSize: 0,
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
        .send({ name: 'Vendor Master', headers: [{ name: 'VendorName', data_type: 'string' }], records: [] });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Vendor Master');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/data-map-sets')
        .set(authHeaders())
        .send({ headers: [{ name: 'VendorName', data_type: 'string' }] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/data-map-sets/upload', () => {
    it('creates a set from CSV upload', async () => {
      dataMapperModel.createSet.mockResolvedValue(FAKE_SET);
      const csvContent = 'VendorName,VendorCode\nAcme Corp,V001\nGlobex Inc,V002\n';
      const headers = JSON.stringify([
        { name: 'VendorName', data_type: 'string' },
        { name: 'VendorCode', data_type: 'string' },
      ]);

      const res = await request(app)
        .post('/api/data-map-sets/upload')
        .set(authHeaders())
        .field('name', 'Vendor Master')
        .field('headers', headers)
        .attach('file', Buffer.from(csvContent), { filename: 'vendors.csv', contentType: 'text/csv' });

      expect(res.statusCode).toBe(201);
      expect(dataMapperModel.createSet).toHaveBeenCalled();
    });

    it('returns 400 without file', async () => {
      const res = await request(app)
        .post('/api/data-map-sets/upload')
        .set(authHeaders())
        .field('name', 'Test')
        .field('headers', '[]');
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 without name', async () => {
      const res = await request(app)
        .post('/api/data-map-sets/upload')
        .set(authHeaders())
        .field('headers', '[]')
        .attach('file', Buffer.from('a,b\n1,2'), { filename: 'test.csv', contentType: 'text/csv' });
      expect(res.statusCode).toBe(400);
    });

    it('reports validation errors for type mismatches', async () => {
      dataMapperModel.createSet.mockResolvedValue({ ...FAKE_SET, records: [] });
      const csvContent = 'Amount\nnot_a_number\n42\n';
      const headers = JSON.stringify([{ name: 'Amount', data_type: 'number' }]);

      const res = await request(app)
        .post('/api/data-map-sets/upload')
        .set(authHeaders())
        .field('name', 'Test')
        .field('headers', headers)
        .attach('file', Buffer.from(csvContent), { filename: 'test.csv', contentType: 'text/csv' });

      expect(res.statusCode).toBe(201);
      expect(res.body.validationErrors).toHaveLength(1);
      expect(res.body.validationErrors[0].column).toBe('Amount');
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

    it('passes pagination params to model', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      await request(app)
        .get('/api/data-map-sets/set-1?page=2&pageSize=25')
        .set(authHeaders());
      expect(dataMapperModel.findSetById).toHaveBeenCalledWith('set-1', { page: 2, pageSize: 25 });
    });

    it('passes filter params to model', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      const filters = JSON.stringify({ VendorName: { search: 'Acme' } });
      await request(app)
        .get(`/api/data-map-sets/set-1?filters=${encodeURIComponent(filters)}`)
        .set(authHeaders());
      expect(dataMapperModel.findSetById).toHaveBeenCalledWith('set-1', {
        filters: { VendorName: { search: 'Acme' } },
      });
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
    it('deletes a data map set when not referenced', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.findSetUsage.mockResolvedValue([]);
      dataMapperModel.removeSet.mockResolvedValue();
      const res = await request(app).delete('/api/data-map-sets/set-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when set is referenced by rules', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.findSetUsage.mockResolvedValue([{ rule_id: 'rule-1', rule_name: 'Lookup' }]);
      const res = await request(app).delete('/api/data-map-sets/set-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
      expect(res.body.usage).toHaveLength(1);
    });
  });

  describe('GET /api/data-map-sets/:id/usage', () => {
    it('returns referencing rules', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.findSetUsage.mockResolvedValue([{ rule_id: 'rule-1', rule_name: 'Lookup' }]);
      const res = await request(app).get('/api/data-map-sets/set-1/usage').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].rule_name).toBe('Lookup');
    });
  });

  describe('GET /api/data-map-sets/:id/download', () => {
    it('returns CSV file', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      const res = await request(app).get('/api/data-map-sets/set-1/download').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('Vendor_Master.csv');
      expect(res.text).toContain('VendorName,VendorCode');
      expect(res.text).toContain('Acme Corp,V001');
    });
  });

  describe('POST /api/data-map-sets/:id/records', () => {
    it('adds records from JSON body', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.addRecords.mockResolvedValue([{ id: 'rec-2' }]);
      const res = await request(app)
        .post('/api/data-map-sets/set-1/records')
        .set(authHeaders())
        .send({ records: [{ VendorName: 'Globex', VendorCode: 'V002' }] });
      expect(res.statusCode).toBe(201);
      expect(res.body.added).toBe(1);
    });

    it('deduplicates against existing records', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.addRecords.mockResolvedValue([]);
      const res = await request(app)
        .post('/api/data-map-sets/set-1/records')
        .set(authHeaders())
        .send({ records: [{ VendorName: 'Acme Corp', VendorCode: 'V001' }] });
      expect(res.statusCode).toBe(201);
      expect(res.body.added).toBe(0);
      expect(res.body.duplicatesRemoved).toBe(1);
    });
  });

  describe('DELETE /api/data-map-sets/:id/records/:recordId', () => {
    it('deletes a record', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.removeRecord.mockResolvedValue();
      const res = await request(app)
        .delete('/api/data-map-sets/set-1/records/rec-1')
        .set(authHeaders());
      expect(res.statusCode).toBe(204);
    });
  });

  describe('PATCH /api/data-map-sets/:id/records/:recordId', () => {
    it('updates a record', async () => {
      dataMapperModel.findSetById.mockResolvedValue(FAKE_SET);
      dataMapperModel.updateRecord.mockResolvedValue({
        id: 'rec-1',
        values: { VendorName: 'Updated', VendorCode: 'V999' },
      });
      const res = await request(app)
        .patch('/api/data-map-sets/set-1/records/rec-1')
        .set(authHeaders())
        .send({ values: { VendorName: 'Updated', VendorCode: 'V999' } });
      expect(res.statusCode).toBe(200);
      expect(res.body.values.VendorName).toBe('Updated');
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

// ── Service unit tests ────────────────────────────────────────────────────────

const { parseFile, validateAndCoerceRows, generateCsv } = require('../../src/services/dataMapSet.service');
const { coerceValue, validateValue } = require('../../src/utils/coercion');

describe('dataMapSet.service', () => {
  describe('parseFile', () => {
    it('parses CSV with headers from first row', () => {
      const csv = 'Name,Age,City\nAlice,30,NYC\nBob,25,LA\n';
      const result = parseFile(Buffer.from(csv), 'text/csv');
      expect(result.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ Name: 'Alice', Age: '30', City: 'NYC' });
    });

    it('parses JSON array of objects', () => {
      const json = JSON.stringify([
        { Name: 'Alice', Age: 30 },
        { Name: 'Bob', Age: 25 },
      ]);
      const result = parseFile(Buffer.from(json), 'application/json');
      expect(result.headers).toEqual(['Name', 'Age']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].Age).toBe(30);
    });

    it('throws on empty JSON array', () => {
      expect(() => parseFile(Buffer.from('[]'), 'application/json')).toThrow('non-empty');
    });

    it('throws on non-object JSON elements', () => {
      expect(() => parseFile(Buffer.from('[1,2,3]'), 'application/json')).toThrow('objects');
    });

    it('throws on empty CSV', () => {
      expect(() => parseFile(Buffer.from('Name\n'), 'text/csv')).toThrow('empty');
    });
  });

  describe('validateAndCoerceRows', () => {
    const headers = [
      { name: 'Amount', data_type: 'number' },
      { name: 'Active', data_type: 'boolean' },
      { name: 'Date', data_type: 'date' },
      { name: 'Label', data_type: 'string' },
    ];

    it('coerces valid values', () => {
      const rows = [{ Amount: '42.5', Active: 'yes', Date: '2024-01-15', Label: 'test' }];
      const result = validateAndCoerceRows(rows, headers);
      expect(result.errors).toHaveLength(0);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].Amount).toBe(42.5);
      expect(result.valid[0].Active).toBe(true);
      expect(result.valid[0].Date).toBe('2024-01-15');
    });

    it('collects errors for invalid values', () => {
      const rows = [{ Amount: 'not_a_number', Active: 'yes', Date: '2024-01-15', Label: 'test' }];
      const result = validateAndCoerceRows(rows, headers);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].column).toBe('Amount');
      expect(result.valid).toHaveLength(0);
    });

    it('removes duplicate rows', () => {
      const rows = [
        { Amount: '10', Active: 'true', Date: '2024-01-01', Label: 'a' },
        { Amount: '10', Active: 'true', Date: '2024-01-01', Label: 'a' },
        { Amount: '20', Active: 'false', Date: '2024-01-02', Label: 'b' },
      ];
      const result = validateAndCoerceRows(rows, headers);
      expect(result.valid).toHaveLength(2);
      expect(result.duplicatesRemoved).toBe(1);
    });

    it('allows empty/null values', () => {
      const rows = [{ Amount: '', Active: '', Date: '', Label: '' }];
      const result = validateAndCoerceRows(rows, headers);
      expect(result.errors).toHaveLength(0);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].Amount).toBeNull();
    });
  });

  describe('generateCsv', () => {
    it('produces correct CSV output', () => {
      const headers = [{ name: 'Name', data_type: 'string' }, { name: 'Age', data_type: 'number' }];
      const records = [
        { values: { Name: 'Alice', Age: 30 } },
        { values: { Name: 'Bob', Age: 25 } },
      ];
      const csv = generateCsv(headers, records);
      expect(csv).toBe('Name,Age\nAlice,30\nBob,25');
    });

    it('escapes commas and quotes', () => {
      const headers = [{ name: 'Name', data_type: 'string' }];
      const records = [{ values: { Name: 'Doe, "Jane"' } }];
      const csv = generateCsv(headers, records);
      expect(csv).toBe('Name\n"Doe, ""Jane"""');
    });

    it('handles JSON string values from DB', () => {
      const headers = [{ name: 'X', data_type: 'string' }];
      const records = [{ values: JSON.stringify({ X: 'hello' }) }];
      const csv = generateCsv(headers, records);
      expect(csv).toBe('X\nhello');
    });
  });
});

describe('coercion utility', () => {
  describe('coerceValue', () => {
    it('coerces numbers', () => {
      expect(coerceValue('42', 'number')).toBe(42);
      expect(coerceValue('$1,234.56', 'number')).toBe(1234.56);
      expect(coerceValue(null, 'number')).toBeNull();
    });

    it('coerces booleans', () => {
      expect(coerceValue('yes', 'boolean')).toBe(true);
      expect(coerceValue('false', 'boolean')).toBe(false);
      expect(coerceValue('maybe', 'boolean')).toBeNull();
    });

    it('coerces dates', () => {
      expect(coerceValue('2024-01-15', 'date')).toBe('2024-01-15');
      expect(coerceValue('not a date', 'date')).toBeNull();
    });

    it('coerces currency codes', () => {
      expect(coerceValue('USD', 'currency')).toBe('USD');
      expect(coerceValue('$', 'currency')).toBe('USD');
      expect(coerceValue('INVALID', 'currency')).toBeNull();
    });

    it('returns string for string type', () => {
      expect(coerceValue(123, 'string')).toBe('123');
      expect(coerceValue('hello', 'string')).toBe('hello');
    });
  });

  describe('validateValue', () => {
    it('returns valid for correct values', () => {
      expect(validateValue('42', 'number')).toEqual({ valid: true, coerced: 42 });
    });

    it('returns error for invalid values', () => {
      const result = validateValue('not_a_number', 'number');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns valid for empty values', () => {
      expect(validateValue('', 'number')).toEqual({ valid: true, coerced: null });
      expect(validateValue(null, 'number')).toEqual({ valid: true, coerced: null });
    });
  });
});
