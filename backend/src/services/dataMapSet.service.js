const { parse } = require('csv-parse/sync');
const { validateValue } = require('../utils/coercion');

// Parse CSV or JSON buffer into { headers: string[], rows: object[] }
function parseFile(buffer, mimeType) {
  if (mimeType === 'application/json' || mimeType === 'text/json') {
    const text = buffer.toString('utf-8');
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('JSON must be a non-empty array of objects');
    }
    if (typeof data[0] !== 'object' || data[0] === null) {
      throw new Error('JSON array elements must be objects');
    }
    const headers = Object.keys(data[0]);
    const rows = data.map((item) => {
      const row = {};
      for (const h of headers) row[h] = item[h] !== undefined ? item[h] : '';
      return row;
    });
    return { headers, rows };
  }

  // Default: CSV
  const text = buffer.toString('utf-8');
  const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  if (records.length === 0) {
    throw new Error('CSV file is empty or has no data rows');
  }
  const headers = Object.keys(records[0]);
  return { headers, rows: records };
}

// Validate & coerce rows against typed headers.
// headers: [{ name, data_type }]
// Returns { valid: object[], errors: [{row, column, value, error}], duplicatesRemoved: number }
function validateAndCoerceRows(rows, headers) {
  const errors = [];
  const coerced = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const coercedRow = {};
    let rowValid = true;

    for (const hdr of headers) {
      const raw = row[hdr.name];
      const result = validateValue(raw, hdr.data_type);
      if (!result.valid) {
        errors.push({ row: i, column: hdr.name, value: raw, error: result.error });
        rowValid = false;
      } else {
        coercedRow[hdr.name] = result.coerced;
      }
    }

    if (rowValid) coerced.push(coercedRow);
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const row of coerced) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }
  const duplicatesRemoved = coerced.length - unique.length;

  return { valid: unique, errors, duplicatesRemoved };
}

// Generate CSV string from typed headers and records.
// headers: [{ name, data_type }]
// records: [{ values: object }] (raw from DB — values may be JSON string)
function generateCsv(headers, records) {
  const names = headers.map((h) => h.name);
  const escape = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [names.map(escape).join(',')];
  for (const rec of records) {
    const vals = typeof rec.values === 'string' ? JSON.parse(rec.values) : rec.values || rec;
    lines.push(names.map((n) => escape(vals[n])).join(','));
  }
  return lines.join('\n');
}

module.exports = { parseFile, validateAndCoerceRows, generateCsv };
