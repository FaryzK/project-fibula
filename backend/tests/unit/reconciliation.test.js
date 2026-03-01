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

// ---------------------------------------------------------------------------
// Service unit tests — table-level comparison logic
// ---------------------------------------------------------------------------

jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/models/extractor.model');

const { runSingleComparison } = require('../../src/services/reconciliation.service');

const EXT_PO = { id: 'ext-po', name: 'PO Extractor' };
const EXT_INV = { id: 'ext-inv', name: 'Invoice Extractor' };
const EXT_CREDIT = { id: 'ext-credit', name: 'Credit Note Extractor' };

const TABLE_KEYS_PO_INV = [
  {
    left_extractor_id: 'ext-po',
    left_table_type: 'PO_table',
    left_column: 'Item Code',
    right_extractor_id: 'ext-inv',
    right_table_type: 'Invoice Table',
    right_column: 'Item Code',
  },
];

const TABLE_KEYS_3WAY = [
  ...TABLE_KEYS_PO_INV,
  {
    left_extractor_id: 'ext-inv',
    left_table_type: 'Invoice Table',
    left_column: 'Item Code',
    right_extractor_id: 'ext-credit',
    right_table_type: 'Credit Table',
    right_column: 'Item Code',
  },
];

describe('runSingleComparison — table level', () => {
  const compRule = {
    id: 'cr-tbl',
    level: 'table',
    formula: 'PO Extractor.PO_table.Total = Invoice Extractor.Invoice Table.Total',
    tolerance_type: null,
    tolerance_value: null,
  };

  it('passes when all rows match', async () => {
    const setDocs = [
      {
        extractor_id: 'ext-po',
        document_execution_id: 'exec-po',
        metadata: {
          tables: {
            PO_table: [
              { 'Item Code': 'A001', Total: '100.00' },
              { 'Item Code': 'A002', Total: '200.00' },
            ],
          },
        },
      },
      {
        extractor_id: 'ext-inv',
        document_execution_id: 'exec-inv',
        metadata: {
          tables: {
            'Invoice Table': [
              { 'Item Code': 'A001', Total: '100.00' },
              { 'Item Code': 'A002', Total: '200.00' },
            ],
          },
        },
      },
    ];
    const { passed } = await runSingleComparison(compRule, setDocs, [EXT_PO, EXT_INV], TABLE_KEYS_PO_INV, 'ext-po');
    expect(passed).toBe(true);
  });

  it('fails when one row does not match', async () => {
    const setDocs = [
      {
        extractor_id: 'ext-po',
        document_execution_id: 'exec-po',
        metadata: {
          tables: {
            PO_table: [
              { 'Item Code': 'A001', Total: '100.00' },
              { 'Item Code': 'A002', Total: '200.00' },
            ],
          },
        },
      },
      {
        extractor_id: 'ext-inv',
        document_execution_id: 'exec-inv',
        metadata: {
          tables: {
            'Invoice Table': [
              { 'Item Code': 'A001', Total: '100.00' },
              { 'Item Code': 'A002', Total: '999.00' }, // mismatch
            ],
          },
        },
      },
    ];
    const { passed } = await runSingleComparison(compRule, setDocs, [EXT_PO, EXT_INV], TABLE_KEYS_PO_INV, 'ext-po');
    expect(passed).toBe(false);
  });

  it('defaults missing non-anchor rows to 0 and evaluates correctly', async () => {
    // Formula: PO.Total = Invoice.Total - CreditNote.Total
    // PO row A001 Total=100, Invoice Total=100, no Credit Note row → Credit Note defaults to 0
    // 100 = 100 - 0 → true
    const rule3 = {
      id: 'cr-3way',
      level: 'table',
      formula: 'PO Extractor.PO_table.Total = Invoice Extractor.Invoice Table.Total - Credit Note Extractor.Credit Table.Total',
      tolerance_type: null,
      tolerance_value: null,
    };
    const setDocs = [
      {
        extractor_id: 'ext-po',
        document_execution_id: 'exec-po',
        metadata: {
          tables: {
            PO_table: [{ 'Item Code': 'A001', Total: '100.00' }],
          },
        },
      },
      {
        extractor_id: 'ext-inv',
        document_execution_id: 'exec-inv',
        metadata: {
          tables: {
            'Invoice Table': [{ 'Item Code': 'A001', Total: '100.00' }],
          },
        },
      },
      {
        extractor_id: 'ext-credit',
        document_execution_id: 'exec-credit',
        metadata: {
          tables: {
            'Credit Table': [], // no rows — the A001 row has no credit note match
          },
        },
      },
    ];
    const { passed } = await runSingleComparison(rule3, setDocs, [EXT_PO, EXT_INV, EXT_CREDIT], TABLE_KEYS_3WAY, 'ext-po');
    expect(passed).toBe(true);
  });

  it('passes trivially when no table matching keys are defined', async () => {
    const setDocs = [
      {
        extractor_id: 'ext-po',
        document_execution_id: 'exec-po',
        metadata: { tables: { PO_table: [{ 'Item Code': 'A001', Total: '100.00' }] } },
      },
    ];
    const { passed } = await runSingleComparison(compRule, setDocs, [EXT_PO, EXT_INV], [], 'ext-po');
    expect(passed).toBe(true);
  });

  it('handles floating-point row values correctly', async () => {
    // 934.20 - 59.40 = 874.80 (float imprecision should be handled by epsilon)
    const floatRule = {
      id: 'cr-float',
      level: 'table',
      formula: 'PO Extractor.PO_table.Total = Invoice Extractor.Invoice Table.Total - Credit Note Extractor.Credit Table.Total',
      tolerance_type: null,
      tolerance_value: null,
    };
    const setDocs = [
      {
        extractor_id: 'ext-po',
        document_execution_id: 'exec-po',
        metadata: { tables: { PO_table: [{ 'Item Code': 'A001', Total: '874.80' }] } },
      },
      {
        extractor_id: 'ext-inv',
        document_execution_id: 'exec-inv',
        metadata: { tables: { 'Invoice Table': [{ 'Item Code': 'A001', Total: '934.20' }] } },
      },
      {
        extractor_id: 'ext-credit',
        document_execution_id: 'exec-credit',
        metadata: { tables: { 'Credit Table': [{ 'Item Code': 'A001', Total: '59.40' }] } },
      },
    ];
    const { passed } = await runSingleComparison(floatRule, setDocs, [EXT_PO, EXT_INV, EXT_CREDIT], TABLE_KEYS_3WAY, 'ext-po');
    expect(passed).toBe(true);
  });
});

// ── withRuleLock tests ──────────────────────────────────────────────────
const { withRuleLock, _ruleChains } = require('../../src/services/reconciliation.service');

describe('withRuleLock — per-rule async mutex', () => {
  afterEach(() => {
    _ruleChains.clear();
  });

  it('serialises two tasks for the same ruleId', async () => {
    const order = [];
    let resolveFirst;
    const firstGate = new Promise((r) => { resolveFirst = r; });

    const p1 = withRuleLock('rule-1', async () => {
      order.push('A-start');
      await firstGate;
      order.push('A-end');
      return 'A';
    });

    // Give p1 a microtick to register and begin executing
    await Promise.resolve();

    const p2 = withRuleLock('rule-1', async () => {
      order.push('B-start');
      order.push('B-end');
      return 'B';
    });

    // Release the first task
    resolveFirst();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('A');
    expect(r2).toBe('B');
    // B must not start until A finishes
    expect(order).toEqual(['A-start', 'A-end', 'B-start', 'B-end']);
  });

  it('allows different ruleIds to run concurrently', async () => {
    const order = [];
    let resolveFirst;
    const firstGate = new Promise((r) => { resolveFirst = r; });

    const p1 = withRuleLock('rule-1', async () => {
      order.push('A-start');
      await firstGate;
      order.push('A-end');
    });

    await Promise.resolve();

    const p2 = withRuleLock('rule-2', async () => {
      order.push('B-start');
      order.push('B-end');
    });

    // B should have already started because it's a different rule
    await p2;
    expect(order).toContain('B-start');
    expect(order).toContain('B-end');
    // A is still waiting
    expect(order).not.toContain('A-end');

    resolveFirst();
    await p1;
    expect(order).toEqual(['A-start', 'B-start', 'B-end', 'A-end']);
  });

  it('releases the lock even when the function throws', async () => {
    await expect(
      withRuleLock('rule-1', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');

    // A subsequent call should still succeed (lock was released)
    const result = await withRuleLock('rule-1', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('cleans up the chain map after all callers finish', async () => {
    await withRuleLock('rule-1', async () => 'done');
    expect(_ruleChains.has('rule-1')).toBe(false);
  });
});
