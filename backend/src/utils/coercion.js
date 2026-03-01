// Shared data-type coercion utilities.
// Used by extractor service (post-extraction) and data map set service (upload validation).

const CURRENCY_SYMBOLS = {
  '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY',
  'S$': 'SGD', 'A$': 'AUD', 'C$': 'CAD', 'HK$': 'HKD',
};
const ISO4217 = new Set([
  'USD','EUR','GBP','JPY','SGD','AUD','CAD','CHF','CNY','HKD','INR','MYR',
  'NZD','THB','IDR','PHP','KRW','TWD','BRL','MXN','ZAR','SEK','NOK','DKK',
  'PLN','CZK','HUF','AED','SAR','QAR','KWD','BHD','OMR','JOD','EGP','ILS',
  'NGN','KES','GHS','PKR','BDT','LKR','VND','UAH','ARS','CLP','COP','PEN',
  'RUB','TRY','RON','BGN','HRK',
]);

function coerceNumber(val) {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (val === null || val === undefined) return null;
  const cleaned = String(val).replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function coerceBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (val === null || val === undefined) return null;
  const s = String(val).toLowerCase().trim();
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return null;
}

function coerceDate(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
}

function coerceCurrency(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().toUpperCase();
  if (ISO4217.has(s)) return s;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (s === sym.toUpperCase() || s.startsWith(sym.toUpperCase())) return code;
  }
  return null;
}

function coerceValue(val, dataType, arrayItemType) {
  if (val === null || val === undefined) return null;
  switch (dataType) {
    case 'number':   return coerceNumber(val);
    case 'boolean':  return coerceBoolean(val);
    case 'date':     return coerceDate(val);
    case 'currency': return coerceCurrency(val);
    case 'array': {
      const arr = Array.isArray(val) ? val : [val];
      return arr.map((v) => coerceValue(v, arrayItemType || 'string', null));
    }
    default: return val === null ? null : String(val);
  }
}

// Returns { valid, coerced, error } for upload/add validation.
function validateValue(val, dataType) {
  if (val === null || val === undefined || val === '') {
    return { valid: true, coerced: null };
  }
  const coerced = coerceValue(val, dataType);
  if (coerced === null) {
    return { valid: false, coerced: null, error: `Cannot convert "${val}" to ${dataType}` };
  }
  return { valid: true, coerced };
}

module.exports = {
  CURRENCY_SYMBOLS,
  ISO4217,
  coerceNumber,
  coerceBoolean,
  coerceDate,
  coerceCurrency,
  coerceValue,
  validateValue,
};
