const openai = require('../utils/openai');
const extractorModel = require('../models/extractor.model');

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildSchemaPrompt(extractor) {
  const lines = ['Extract the following fields from the document as JSON.', '', 'HEADER FIELDS:'];
  for (const f of extractor.header_fields) {
    lines.push(`- ${f.field_name}${f.is_mandatory ? ' (mandatory)' : ''}: ${f.field_description}`);
  }
  if (extractor.table_types && extractor.table_types.length > 0) {
    lines.push('', 'TABLE TYPES:');
    for (const tt of extractor.table_types) {
      lines.push(`- Table type: ${tt.type_name} — ${tt.type_description}`);
      lines.push('  Columns:');
      for (const col of tt.columns || []) {
        lines.push(`    - ${col.column_name}${col.is_mandatory ? ' (mandatory)' : ''}: ${col.column_description}`);
      }
    }
  }
  lines.push('', 'Return ONLY valid JSON with this structure:');
  lines.push('{');
  lines.push('  "header": { "<field_name>": "<value or null>", ... },');
  lines.push('  "tables": { "<table_type_name>": [{ "<column_name>": "<value>", ... }, ...], ... }');
  lines.push('}');
  return lines.join('\n');
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
 * Run VLM extraction on a document using an extractor schema.
 * Returns { header: {...}, tables: {...} }
 */
async function extractData(document, extractor) {
  const schemaPrompt = buildSchemaPrompt(extractor);

  // Find similar training feedback
  const feedback = await extractorModel.findSimilarFeedback(extractor.id, null, 5);
  const feedbackContext = buildFeedbackContext(feedback);

  const systemPrompt = schemaPrompt + feedbackContext;

  const isPdf = document.file_type === 'application/pdf';
  let userMessage;

  if (isPdf) {
    let textContent;
    try {
      const fileBuffer = await fetchBuffer(document.file_url);
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      textContent = data.text;
    } catch (_) {
      textContent = '[PDF document — could not extract text]';
    }
    userMessage = { role: 'user', content: `Document text:\n${textContent}` };
  } else {
    const fileBuffer = await fetchBuffer(document.file_url);
    const base64 = fileBuffer.toString('base64');
    userMessage = {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${document.file_type};base64,${base64}` } },
        { type: 'text', text: 'Extract data according to the schema.' },
      ],
    };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: systemPrompt }, userMessage],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return {
    header: parsed.header || {},
    tables: parsed.tables || {},
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

module.exports = { extractData, hasMissingMandatory };
