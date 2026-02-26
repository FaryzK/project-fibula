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
  return {
    header: parsed.header || {},
    tables: parsed.tables || {},
    document_description,
  };
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
  return {
    header: parsed.header || {},
    tables: parsed.tables || {},
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
