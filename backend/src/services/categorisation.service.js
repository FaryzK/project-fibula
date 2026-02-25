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
 * Classify a document using OpenAI.
 * @param {Object} document - { file_url, file_type }
 * @param {Array<{label: string, description: string}>} labels
 * @returns {string} - The matched category label
 */
async function classifyDocument(document, labels) {
  const { file_url, file_type } = document;
  const isImage = file_type.startsWith('image/');
  const categoryList = buildCategoryList(labels);

  let userMessage;

  if (isImage) {
    const fileBuffer = await fetchBuffer(file_url);
    const base64 = fileBuffer.toString('base64');
    userMessage = {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${file_type};base64,${base64}` },
        },
        {
          type: 'text',
          text: `Classify this document into one of the following categories:\n${categoryList}`,
        },
      ],
    };
  } else {
    // PDF — extract text
    let textContent = `[Document: ${document.file_name || 'unknown'}]`;
    try {
      const fileBuffer = await fetchBuffer(file_url);
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      textContent = data.text.slice(0, 4000); // cap at 4k chars
    } catch (_) {
      // Keep default
    }

    userMessage = {
      role: 'user',
      content: `Classify this document into one of the following categories:\n${categoryList}\n\nDocument content:\n${textContent}`,
    };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, userMessage],
    response_format: { type: 'json_object' },
    max_tokens: 100,
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  const validLabels = labels.map((l) => l.label);

  if (!validLabels.includes(parsed.category)) {
    throw new Error(`OpenAI returned unknown category: ${parsed.category}`);
  }

  return parsed.category;
}

module.exports = { classifyDocument };
