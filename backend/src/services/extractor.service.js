const openai = require('../utils/openai');
const extractorModel = require('../models/extractor.model');

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate a text embedding using OpenAI text-embedding-3-small.
 * Returns a 1536-dim float array, or null on failure.
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('Failed to generate embedding:', err.message);
    return null;
  }
}

/**
 * Produce a text description of a document for embedding / similarity search.
 * Uses the Responses API so it works for both text-based and image-based PDFs and images.
 */
async function describeDocument(fileBuffer, fileType) {
  const base64 = fileBuffer.toString('base64');
  const isPdf = fileType === 'application/pdf';

  try {
    const contentItem = isPdf
      ? { type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
      : { type: 'input_image', image_url: `data:${fileType};base64,${base64}` };

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: [
            contentItem,
            { type: 'input_text', text: 'Describe this document in detail, including all visible text, numbers, dates, and layout. Be thorough.' },
          ],
        },
      ],
      max_output_tokens: 1000,
    });
    return response.output_text;
  } catch (err) {
    console.error('Failed to describe document:', err.message);
    return '[document — could not describe]';
  }
}

// Map a data_type to a human-readable VLM format instruction.
function typeInstruction(dataType, arrayItemType) {
  switch (dataType) {
    case 'number':   return 'number — numeric value only, no currency symbols or commas';
    case 'boolean':  return 'boolean — true or false';
    case 'date':     return 'date — ISO 8601 format: YYYY-MM-DD';
    case 'currency': return 'currency code — ISO 4217 code only (e.g. USD, SGD, JPY), not the amount';
    case 'array':    return `array — JSON array where each element is: ${typeInstruction(arrayItemType || 'string', null)}`;
    default:         return 'string — plain text';
  }
}

function buildSchemaPrompt(extractor) {
  const lines = ['Extract the following fields from the document as JSON.', '', 'HEADER FIELDS:'];
  for (const f of extractor.header_fields) {
    const hint = typeInstruction(f.data_type || 'string', f.array_item_type);
    lines.push(`- ${f.field_name}${f.is_mandatory ? ' (mandatory)' : ''} [type: ${hint}]: ${f.field_description}`);
  }
  if (extractor.table_types && extractor.table_types.length > 0) {
    lines.push('', 'TABLE TYPES:');
    for (const tt of extractor.table_types) {
      lines.push(`- Table type: ${tt.type_name} — ${tt.type_description}`);
      lines.push('  Columns:');
      for (const col of tt.columns || []) {
        const hint = typeInstruction(col.data_type || 'string', null);
        lines.push(`    - ${col.column_name}${col.is_mandatory ? ' (mandatory)' : ''} [type: ${hint}]: ${col.column_description}`);
      }
    }
  }
  lines.push('', 'Return ONLY valid JSON with this structure:');
  lines.push('{');
  lines.push('  "header": { "<field_name>": <typed value or null>, ... },');
  lines.push('  "tables": { "<table_type_name>": [{ "<column_name>": <typed value>, ... }, ...], ... }');
  lines.push('}');
  lines.push('Return null for any field whose value cannot be found in the document.');
  return lines.join('\n');
}

// ── Post-extraction type coercion ────────────────────────────────────────────

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

function coerceExtracted(extracted, extractor) {
  const header = {};
  for (const f of extractor.header_fields || []) {
    const raw = extracted.header?.[f.field_name];
    header[f.field_name] = raw !== undefined
      ? coerceValue(raw, f.data_type || 'string', f.array_item_type)
      : null;
  }
  const tables = {};
  for (const tt of extractor.table_types || []) {
    const rows = extracted.tables?.[tt.type_name] || [];
    tables[tt.type_name] = rows.map((row) => {
      const coercedRow = {};
      for (const col of tt.columns || []) {
        const raw = row[col.column_name];
        coercedRow[col.column_name] = raw !== undefined
          ? coerceValue(raw, col.data_type || 'string', null)
          : null;
      }
      return coercedRow;
    });
  }
  return { header, tables };
}

function buildFeedbackContext(feedbackItems) {
  if (!feedbackItems || feedbackItems.length === 0) return '';
  const lines = ['', 'TRAINING FEEDBACK (apply these corrections):'];
  for (const fb of feedbackItems) {
    lines.push(`- ${fb.feedback_text}`);
  }
  return lines.join('\n');
}

/**
 * Core extraction call using the Responses API.
 * Passes the file directly (PDF or image) as base64 — works like ChatGPT file attachments.
 */
async function runExtraction(fileBuffer, fileType, systemPrompt) {
  const base64 = fileBuffer.toString('base64');
  const isPdf = fileType === 'application/pdf';

  const contentItem = isPdf
    ? { type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image', image_url: `data:${fileType};base64,${base64}` };

  const response = await openai.responses.create({
    model: 'gpt-4o',
    instructions: systemPrompt,
    input: [
      {
        role: 'user',
        content: [
          contentItem,
          { type: 'input_text', text: 'Extract data according to the schema and return valid JSON.' },
        ],
      },
    ],
    text: { format: { type: 'json_object' } },
    max_output_tokens: 2000,
  });

  return JSON.parse(response.output_text);
}

/**
 * Run VLM extraction on a document (fetched by URL) using an extractor schema.
 * Returns { header, tables, document_description }
 */
async function extractData(document, extractor) {
  const fileBuffer = await fetchBuffer(document.file_url);
  const fileType = document.file_type;

  // Generate document description + embedding for similarity search
  const document_description = await describeDocument(fileBuffer, fileType);
  const embedding = await generateEmbedding(document_description);

  const schemaPrompt = buildSchemaPrompt(extractor);
  const feedback = await extractorModel.findSimilarFeedback(extractor.id, embedding, 5);
  const feedbackContext = buildFeedbackContext(feedback);
  const systemPrompt = schemaPrompt + feedbackContext;

  const parsed = await runExtraction(fileBuffer, fileType, systemPrompt);
  const coerced = coerceExtracted({ header: parsed.header || {}, tables: parsed.tables || {} }, extractor);
  return { ...coerced, document_description };
}

/**
 * Run VLM extraction from a raw buffer (e.g. test extraction from upload).
 * Returns { header, tables, feedback_used, document_description }
 */
async function testExtractFromBuffer(fileBuffer, fileType, extractor) {
  const document_description = await describeDocument(fileBuffer, fileType);
  const embedding = await generateEmbedding(document_description);

  const schemaPrompt = buildSchemaPrompt(extractor);
  const feedback = await extractorModel.findSimilarFeedback(extractor.id, embedding, 5);
  const feedbackContext = buildFeedbackContext(feedback);
  const systemPrompt = schemaPrompt + feedbackContext;

  const parsed = await runExtraction(fileBuffer, fileType, systemPrompt);
  const coerced = coerceExtracted({ header: parsed.header || {}, tables: parsed.tables || {} }, extractor);
  return {
    ...coerced,
    feedback_used: feedback.map((fb) => ({
      feedback_text: fb.feedback_text,
      document_file_url: fb.document_file_url || null,
      document_file_name: fb.document_file_name || null,
    })),
    document_description,
  };
}

/**
 * Check if any mandatory fields are missing from extracted data.
 * Returns true if at least one mandatory field/column is missing.
 */
function hasMissingMandatory(extractor, extracted) {
  for (const f of extractor.header_fields || []) {
    if (f.is_mandatory) {
      const val = extracted.header && extracted.header[f.field_name];
      if (val === null || val === undefined || val === '') return true;
    }
  }
  for (const tt of extractor.table_types || []) {
    for (const col of tt.columns || []) {
      if (col.is_mandatory) {
        const rows = extracted.tables && extracted.tables[tt.type_name];
        if (!rows || rows.length === 0) return true;
        for (const row of rows) {
          const val = row[col.column_name];
          if (val === null || val === undefined || val === '') return true;
        }
      }
    }
  }
  return false;
}

module.exports = { extractData, testExtractFromBuffer, generateEmbedding, hasMissingMandatory };
