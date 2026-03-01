process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';

jest.mock('../../src/config/db', () => ({
  db: jest.fn(),
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('../../src/models/dataMapper.model');

const dataMapperModel = require('../../src/models/dataMapper.model');
const { applyRule } = require('../../src/services/dataMapper.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRule({ lookups = [], targets = [], dataMapSetId = 'set-1' } = {}) {
  return { id: 'rule-1', name: 'Test Rule', extractor_id: 'ext-1', data_map_set_id: dataMapSetId, lookups, targets };
}

function makeTableLookup(schemaField, mapSetColumn, matchType = 'exact') {
  return { map_set_column: mapSetColumn, schema_field: schemaField, match_type: matchType, match_threshold: 0.8, sort_order: 0 };
}

// Token helper — shorthand for building token arrays
function tok(type, value) { return { type, value }; }

function makeTableTarget(schemaField, expression) {
  return { schema_field: schemaField, expression };
}

function makeHeaderTarget(schemaField, expression) {
  return { schema_field: schemaField, expression };
}

function makeSetRecords(records) {
  return records.map((r, i) => ({ id: `rec-${i}`, data_map_set_id: 'set-1', values: JSON.stringify(r) }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('applyRule — table-level enrichment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('populates SKUCode on all matching rows (simple set column)', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.Description', 'Description')],
      targets: [makeTableTarget('Invoice Items.SKUCode', [tok('set', 'SKUCode')])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { Description: 'Widget A', SKUCode: 'WGT-001' },
      { Description: 'Widget B', SKUCode: 'WGT-002' },
    ]));

    const metadata = {
      header: { VendorName: 'Acme' },
      tables: {
        'Invoice Items': [
          { Description: 'Widget A', UnitPrice: '10.00', SKUCode: null },
          { Description: 'Widget B', UnitPrice: '20.00', SKUCode: null },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].SKUCode).toBe('WGT-001');
    expect(result.tables['Invoice Items'][1].SKUCode).toBe('WGT-002');
  });

  it('leaves unmatched rows unchanged', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.Description', 'Description')],
      targets: [makeTableTarget('Invoice Items.SKUCode', [tok('set', 'SKUCode')])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { Description: 'Widget A', SKUCode: 'WGT-001' },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { Description: 'Widget A', SKUCode: null },
          { Description: 'Unknown Item', SKUCode: null }, // no match
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].SKUCode).toBe('WGT-001');
    expect(result.tables['Invoice Items'][1].SKUCode).toBeNull(); // unchanged
  });

  it('evaluates extractor * set expression per row', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.UoM', 'UoM_initial')],
      targets: [makeTableTarget('Invoice Items.Quantity', [
        tok('extractor', 'Invoice Items.Quantity'),
        tok('operator', '*'),
        tok('set', 'Conversion'),
      ])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { UoM_initial: 'dozen', Conversion: 12 },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { UoM: 'dozen', Quantity: 5 },
          { UoM: 'dozen', Quantity: 3 },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].Quantity).toBe(60);
    expect(result.tables['Invoice Items'][1].Quantity).toBe(36);
  });

  it('enriches both header target and table target in same rule', async () => {
    const headerLookup = { map_set_column: 'VendorName', schema_field: 'VendorName', match_type: 'exact', match_threshold: 0.8, sort_order: 0 };
    const rule = makeRule({
      lookups: [headerLookup],
      targets: [
        makeHeaderTarget('VendorCode', [tok('set', 'VendorCode')]),
        makeTableTarget('Invoice Items.SKUCode', [tok('set', 'SKUCode')]),
      ],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { VendorName: 'Acme Corp', SKUCode: 'WGT-001', VendorCode: 'V001' },
    ]));

    const metadata = {
      header: { VendorName: 'Acme Corp', VendorCode: null },
      tables: {
        'Invoice Items': [
          { Description: 'Widget A', SKUCode: null },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.header.VendorCode).toBe('V001');
    expect(result.tables['Invoice Items'][0].SKUCode).toBe('WGT-001');
  });

  it('uses row column value for lookup, not header field of same name', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.Description', 'Description')],
      targets: [makeTableTarget('Invoice Items.SKUCode', [tok('set', 'SKUCode')])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { Description: 'Row Value', SKUCode: 'CORRECT' },
      { Description: 'Header Value', SKUCode: 'WRONG' },
    ]));

    const metadata = {
      header: { Description: 'Header Value' }, // should NOT be used for table lookups
      tables: {
        'Invoice Items': [
          { Description: 'Row Value', SKUCode: null },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].SKUCode).toBe('CORRECT');
  });

  it('handles set columns with spaces in token expressions', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.UoM', 'from uom')],
      targets: [makeTableTarget('Invoice Items.Quantity', [
        tok('extractor', 'Invoice Items.Quantity'),
        tok('operator', '*'),
        tok('set', 'conv factor'),
      ])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { 'from uom': 'BOX', 'to uom': 'PCS', 'conv factor': 10 },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { UoM: 'BOX', Quantity: 3 },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].Quantity).toBe(30);
  });

  it('handles simple set column reference with spaces', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.UoM', 'from uom')],
      targets: [makeTableTarget('Invoice Items.UoM', [tok('set', 'to uom')])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { 'from uom': 'BOX', 'to uom': 'PCS', 'conv factor': 10 },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { UoM: 'BOX', Quantity: 3 },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].UoM).toBe('PCS');
  });

  it('evaluates literal token in expression', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.Description', 'Description')],
      targets: [makeTableTarget('Invoice Items.Quantity', [
        tok('extractor', 'Invoice Items.Quantity'),
        tok('operator', '*'),
        tok('literal', '2'),
      ])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { Description: 'Widget A' },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { Description: 'Widget A', Quantity: 7 },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].Quantity).toBe(14);
  });

  it('returns undefined for null or empty expression', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.Description', 'Description')],
      targets: [
        makeTableTarget('Invoice Items.SKUCode', null),
        makeTableTarget('Invoice Items.UoM', []),
      ],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { Description: 'Widget A', SKUCode: 'WGT-001' },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { Description: 'Widget A', SKUCode: 'original', UoM: 'PCS' },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    // null and empty array expressions return undefined → written to the row
    expect(result.tables['Invoice Items'][0].SKUCode).toBeUndefined();
    expect(result.tables['Invoice Items'][0].UoM).toBeUndefined();
  });

  it('evaluates extractor / set expression (division)', async () => {
    const rule = makeRule({
      lookups: [makeTableLookup('Invoice Items.UoM', 'from_uom')],
      targets: [makeTableTarget('Invoice Items.UnitPrice', [
        tok('extractor', 'Invoice Items.UnitPrice'),
        tok('operator', '/'),
        tok('set', 'conversion'),
      ])],
    });
    dataMapperModel.findSetRecords.mockResolvedValue(makeSetRecords([
      { from_uom: 'BOX', to_uom: 'PCS', conversion: 10 },
    ]));

    const metadata = {
      header: {},
      tables: {
        'Invoice Items': [
          { UoM: 'BOX', UnitPrice: 50 },
        ],
      },
    };

    const result = await applyRule(rule, metadata);
    expect(result.tables['Invoice Items'][0].UnitPrice).toBe(5);
  });
});
