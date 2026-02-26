const openai = require('../utils/openai');

const SYSTEM_PROMPT = `You are a document classification assistant. Given a document and a list of categories with descriptions,
classify the document into exactly one category.
Return ONLY valid JSON in this exact format, with no other text:
{ "category": "CATEGORY_LABEL" }
The category must be one of the provided labels exactly as written.`;

/**
 * Fetch a file from a URL and return as a Buffer.
 */
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Build the category list string for the prompt.
 */
function buildCategoryList(labels) {
  return labels
    .map((l, i) => `${i + 1}. ${l.label}: ${l.description}`)
    .join('\n');
}

/**
 * Classify a document using OpenAI Responses API.
 * Passes the file directly (PDF or image) — same approach as the extractor.
 * @param {Object} document - { file_url, file_type }
 * @param {Array<{label: string, description: string}>} labels
 * @returns {string} - The matched category label
 */
async function classifyDocument(document, labels) {
  const { file_url, file_type } = document;
  const isPdf = file_type === 'application/pdf';
  const categoryList = buildCategoryList(labels);

  const fileBuffer = await fetchBuffer(file_url);
  const base64 = fileBuffer.toString('base64');

  const contentItem = isPdf
    ? { type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image', image_url: `data:${file_type};base64,${base64}` };

  const response = await openai.responses.create({
    model: 'gpt-4o',
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: 'user',
        content: [
          contentItem,
          {
            type: 'input_text',
            text: `Classify this document into one of the following categories:\n${categoryList}`,
          },
        ],
      },
    ],
    text: { format: { type: 'json_object' } },
    max_output_tokens: 100,
  });

  const parsed = JSON.parse(response.output_text);
  const validLabels = labels.map((l) => l.label);

  if (!validLabels.includes(parsed.category)) {
    throw new Error(`OpenAI returned unknown category: ${parsed.category}`);
  }

  return parsed.category;
}

module.exports = { classifyDocument };
