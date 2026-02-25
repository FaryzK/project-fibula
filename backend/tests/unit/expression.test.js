process.env.NODE_ENV = 'test';

const { resolveValue, evaluateCondition, evaluateConditions, applyAssignments } = require('../../src/utils/expression');

const META = {
  document_id: 'doc-1',
  category: 'INVOICE',
  amount: 150,
  subTotal: 80,
  date: { dateString: '2024-06-01' },
  notes: 'Contains some text',
  active: true,
};

describe('resolveValue', () => {
  it('returns literal string as-is', () => {
    expect(resolveValue('hello', META)).toBe('hello');
  });

  it('resolves $document.field reference', () => {
    expect(resolveValue('$document.category', META)).toBe('INVOICE');
  });

  it('resolves nested $document.field reference', () => {
    expect(resolveValue('$document.date.dateString', META)).toBe('2024-06-01');
  });

  it('evaluates {{ }} template expression', () => {
    expect(resolveValue('{{ $document.amount * 2 }}', META)).toBe(300);
  });

  it('evaluates Date expression in template', () => {
    const result = resolveValue('{{ new Date($document.date.dateString).getFullYear() }}', META);
    expect(result).toBe(2024);
  });

  it('returns undefined for missing field', () => {
    expect(resolveValue('$document.missing', META)).toBeUndefined();
  });
});

describe('evaluateCondition — string', () => {
  it('equals', () => {
    expect(evaluateCondition({ field: '$document.category', operator: 'equals', value: 'INVOICE', type: 'string' }, META)).toBe(true);
    expect(evaluateCondition({ field: '$document.category', operator: 'equals', value: 'PO', type: 'string' }, META)).toBe(false);
  });

  it('not_equals', () => {
    expect(evaluateCondition({ field: '$document.category', operator: 'not_equals', value: 'PO', type: 'string' }, META)).toBe(true);
  });

  it('contains', () => {
    expect(evaluateCondition({ field: '$document.notes', operator: 'contains', value: 'some', type: 'string' }, META)).toBe(true);
    expect(evaluateCondition({ field: '$document.notes', operator: 'contains', value: 'missing', type: 'string' }, META)).toBe(false);
  });

  it('not_contains', () => {
    expect(evaluateCondition({ field: '$document.notes', operator: 'not_contains', value: 'missing', type: 'string' }, META)).toBe(true);
  });

  it('exists / not_exists', () => {
    expect(evaluateCondition({ field: '$document.category', operator: 'exists', type: 'string' }, META)).toBe(true);
    expect(evaluateCondition({ field: '$document.missing', operator: 'not_exists', type: 'string' }, META)).toBe(true);
  });
});

describe('evaluateCondition — number', () => {
  it('greater_than', () => {
    expect(evaluateCondition({ field: '$document.amount', operator: 'greater_than', value: '100', type: 'number' }, META)).toBe(true);
    expect(evaluateCondition({ field: '$document.amount', operator: 'greater_than', value: '200', type: 'number' }, META)).toBe(false);
  });

  it('less_than', () => {
    expect(evaluateCondition({ field: '$document.subTotal', operator: 'less_than', value: '100', type: 'number' }, META)).toBe(true);
  });

  it('greater_than_or_equal', () => {
    expect(evaluateCondition({ field: '$document.amount', operator: 'greater_than_or_equal', value: '150', type: 'number' }, META)).toBe(true);
  });

  it('less_than_or_equal', () => {
    expect(evaluateCondition({ field: '$document.amount', operator: 'less_than_or_equal', value: '150', type: 'number' }, META)).toBe(true);
  });
});

describe('evaluateCondition — boolean', () => {
  it('is_true', () => {
    expect(evaluateCondition({ field: '$document.active', operator: 'is_true', type: 'boolean' }, META)).toBe(true);
  });

  it('is_false', () => {
    expect(evaluateCondition({ field: '$document.active', operator: 'is_false', type: 'boolean' }, META)).toBe(false);
  });
});

describe('evaluateConditions', () => {
  const conds = [
    { field: '$document.category', operator: 'equals', value: 'INVOICE', type: 'string' },
    { field: '$document.amount', operator: 'greater_than', value: '100', type: 'number' },
  ];
  const mixedConds = [
    { field: '$document.category', operator: 'equals', value: 'PO', type: 'string' }, // false
    { field: '$document.amount', operator: 'greater_than', value: '100', type: 'number' }, // true
  ];

  it('AND: all must be true', () => {
    expect(evaluateConditions(conds, 'AND', META)).toBe(true);
    expect(evaluateConditions(mixedConds, 'AND', META)).toBe(false);
  });

  it('OR: any must be true', () => {
    expect(evaluateConditions(mixedConds, 'OR', META)).toBe(true);
  });

  it('empty conditions returns true', () => {
    expect(evaluateConditions([], 'AND', META)).toBe(true);
  });
});

describe('applyAssignments', () => {
  it('sets literal values', () => {
    const result = applyAssignments([{ field: 'status', value: 'approved' }], META);
    expect(result.status).toBe('approved');
  });

  it('sets expression values', () => {
    const result = applyAssignments([{ field: 'doubled', value: '{{ $document.amount * 2 }}' }], META);
    expect(result.doubled).toBe(300);
  });

  it('copies existing fields', () => {
    const result = applyAssignments([{ field: 'status', value: 'done' }], META);
    expect(result.category).toBe('INVOICE');
  });

  it('sets field from $document reference', () => {
    const result = applyAssignments([{ field: 'cat', value: '$document.category' }], META);
    expect(result.cat).toBe('INVOICE');
  });
});
