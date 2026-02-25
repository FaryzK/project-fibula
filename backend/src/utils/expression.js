const vm = require('vm');

/**
 * Resolve a value which may be:
 *  - A literal string/number/boolean
 *  - A field reference: "$document.some.nested.field"
 *  - A template expression: "{{ $document.amount * 2 }}"
 */
function resolveValue(expr, metadata) {
  if (typeof expr !== 'string') return expr;

  // Template expression: {{ ... }}
  const templateMatch = expr.match(/^\{\{(.+)\}\}$/s);
  if (templateMatch) {
    const code = templateMatch[1].trim();
    const context = vm.createContext({
      $document: metadata,
      Date,
      Math,
      JSON,
      Number,
      String,
      Boolean,
    });
    return vm.runInContext(code, context, { timeout: 100 });
  }

  // Simple field reference: $document.foo.bar
  if (expr.startsWith('$document.')) {
    const path = expr.slice('$document.'.length).split('.');
    let val = metadata;
    for (const key of path) {
      if (val == null) return undefined;
      val = val[key];
    }
    return val;
  }

  // Literal value
  return expr;
}

/**
 * Evaluate a single condition against metadata.
 * @param {{ field, operator, value, type }} condition
 * @param {Object} metadata
 * @returns {boolean}
 */
function evaluateCondition(condition, metadata) {
  const { field, operator, value, type } = condition;

  let fieldVal = resolveValue(field, metadata);
  let compareVal = resolveValue(value, metadata);

  // Type coercions
  if (type === 'number') {
    fieldVal = Number(fieldVal);
    compareVal = Number(compareVal);
  } else if (type === 'datetime') {
    fieldVal = new Date(fieldVal).getTime();
    compareVal = new Date(compareVal).getTime();
  } else if (type === 'boolean') {
    fieldVal = Boolean(fieldVal);
  }

  switch (operator) {
    case 'equals':                return fieldVal == compareVal; // eslint-disable-line eqeqeq
    case 'not_equals':            return fieldVal != compareVal; // eslint-disable-line eqeqeq
    case 'contains':              return String(fieldVal).includes(String(compareVal));
    case 'not_contains':          return !String(fieldVal).includes(String(compareVal));
    case 'greater_than':          return fieldVal > compareVal;
    case 'less_than':             return fieldVal < compareVal;
    case 'greater_than_or_equal': return fieldVal >= compareVal;
    case 'less_than_or_equal':    return fieldVal <= compareVal;
    case 'is_true':               return Boolean(fieldVal) === true;
    case 'is_false':              return Boolean(fieldVal) === false;
    case 'exists':                return fieldVal !== undefined && fieldVal !== null;
    case 'not_exists':            return fieldVal === undefined || fieldVal === null;
    default:                      return false;
  }
}

/**
 * Evaluate a list of conditions with AND or OR logic.
 */
function evaluateConditions(conditions, logic, metadata) {
  if (!conditions || conditions.length === 0) return true;
  if (logic === 'OR') return conditions.some((c) => evaluateCondition(c, metadata));
  return conditions.every((c) => evaluateCondition(c, metadata)); // AND (default)
}

/**
 * Apply SET_VALUE assignments to metadata, returning an enriched copy.
 */
function applyAssignments(assignments, metadata) {
  const result = { ...metadata };
  for (const { field, value } of assignments) {
    result[field] = resolveValue(value, metadata);
  }
  return result;
}

module.exports = { resolveValue, evaluateCondition, evaluateConditions, applyAssignments };
